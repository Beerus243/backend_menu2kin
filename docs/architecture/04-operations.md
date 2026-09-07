# Exploitation, sécurité et livraison

Statut : **ARCHITECTURE PROPOSÉE**. Les objectifs sont à valider en staging puis production. Les modèles deployment ne sont pas des configurations actives du dépôt.

## Authentification et secrets

Découverte anonyme autorisée. OTP téléphone E.164, challenge UUID imprévisible, code 6 chiffres CSPRNG, expiration 5 minutes, 5 essais atomiques, cooldown 60 secondes, quotas téléphone + IP + appareil et budget SMS global/jour. Hash du code = HMAC-SHA256 avec `OTP_PEPPER` séparé, phone + challengeId + purpose ; hash simple d'un espace d'un million de codes insuffisant face à fuite DB. Consommation via verrou row dans transaction ; réponse et durée ne révèlent pas l'existence d'un compte. Échec SMS ne crée pas de session. Provider appelé après persistance challenge, échec terminal annule challenge ; pas de code dans logs, events ou fixtures de production.

Google ID token vérifié via bibliothèque officielle : signature/JWKS, issuer, audience mobile/web explicitement autorisées, expiration, nonce émis dans le flux d'identité ; `sub` unique est l'identité, jamais l'email comme clé de fusion. Lier Google à un compte existant exige une session récente et une nouvelle preuve Google ; ce linking est reporté V1, ne pas fusionner silencieusement deux comptes. Le fournisseur OTP en RDC nécessite une validation terrain avant lancement ; Google ne remplace pas cette étude de couverture.

Access JWT HS256 signé par secret >=32 octets aléatoires, TTL 10 min, claims sub/sid/iss/aud/iat/exp/jti ; algorithme allowlist, clock skew 30 s. Rotation du secret avec key id et chevauchement de 10 min, ou passage RS256 si d'autres services valident plus tard. User.status et Session.revokedAt/expiresAt lus en DB sur chaque requête authentifiée V1 pour garantir la révocation immédiate ; index PK, pas besoin d'un second cache session à invalider. JWT ne porte pas de téléphone ni privilège faisant autorité.

Refresh opaque de 32 octets minimum en base64url ; HMAC-SHA256 avec `REFRESH_TOKEN_PEPPER` en DB ; Session constitue la famille. Chaque rotation crée RefreshToken et marque l'ancien usedAt en transaction. Historique consommé conservé jusqu'à expiration session + 7 jours pour détecter les replays. Durée session absolue 30 jours sans prolongation silencieuse. Mobile garde secret dans stockage OS sécurisé ; aucun refresh dans URL. `JWT_REFRESH_SECRET` n'est pas utilisé : refresh n'est pas JWT. Variable explicitement évitée malgré son nom proposé dans le brief.

Réauthentification : nouvelle connexion prouvée, Session.createdAt donne l’instant de preuve et ne change jamais au refresh ; une session vieille ne satisfait pas une opération récente. Pour admin, vérifier auth_time/acr/amr du fournisseur, pas simplement iat du token.

Suppression compte : réauth <5 min, marquer DELETED, révoquer sessions, désactiver devices dans transaction ; lectures personnelles interdites immédiatement. Job retire likes/favoris avec deltas, avis des agrégats, données analytiques identifiantes ; anonymise User et efface phone/googleSubject/displayName personnel (remplacé par « Utilisateur supprimé »). Audit conserve acteur pseudonyme selon politique de rétention, pas ses coordonnées. Les comptes AdminUser avec audit restent comme identités minimales. Phone unique réutilisable seulement après purge de l'identité, pas tant qu'il appartient à un compte actif. Compte suspendu : pas de refresh ni écriture, retrait des avis par job suivi ; les lectures d'avis excluent immédiatement les auteurs non ACTIVE, agrégats peuvent transitoirement être en retard jusqu'au retrait (objectif <5 min, job surveillé). Réconciliation corrige les écarts.

Admin : même User + AdminUser provisionné par opérateur ; oidcSubject unique associé au fournisseur admin configuré, sans chercher un compte par email ; aucun endpoint inscription admin. Fournisseur OIDC avec MFA, issuer/audience séparés, vérification cryptographique des claims acr/amr au `/auth/admin/exchange`. OTP SMS seul ne suffit pas pour droits admin. Rôle lu en DB et MFA session <12 h ; action rôle ou suppression sensible exige <5 min. Deux superadmins nominatifs recommandés au bootstrap, jamais compte partagé ni mot de passe seed.

## RBAC

| Action | SUPER_ADMIN | ADMIN | EDITOR | MODERATOR |
|---|---|---|---|---|
| Lire/créer/modifier/publier catalogue et médias | oui | oui | oui | non |
| Retirer restaurant/menu/plat | oui | oui | non | non |
| Vérifier restaurant / changer statut opérationnel | oui | oui | non | non |
| Avis, signalements, masquage | oui | oui | non | oui |
| Lister utilisateurs, suspendre client | oui | oui | non | non |
| Lire audit expurgé | oui | oui | non | non |
| Attribuer/retirer rôle admin | oui | non | non | non |
| Secrets, migrations, restauration DB | opérateur infra dédié, hors RBAC API | — | — | — |

Champ-level policy : EDITOR ne peut pas écrire Restaurant.status/verificationStatus même si DTO admin commun les connaît ; service vérifie la permission spécifique, 403. Le rôle ADMIN ne suspend pas un SUPER_ADMIN ni ne modifie des rôles. Protection du dernier superadmin actif sous verrou transactionnel commun ; interdire self-demotion involontaire. Permissions nommées `catalog:write`, `catalog:delete`, `restaurant:verify`, `reviews:moderate`, `users:suspend`, `roles:write`, `audit:read`. Guard vérifie permission, service vérifie objet/transition ; aucune logique métier dans controller.

## Médias et liens publics

1. EDITOR demande un upload, backend réserve MediaAsset PENDING, publicId aléatoire sous préfixe Menu2Kin, signature serveur et preset d'upload restrictif. Preset n'accepte que images JPEG/PNG/WebP, max 8 MiB, overwrite=false. La finalité upload est portée par le préfixe publicId réservé (dish/logo/cover), vérifiée au service d’association, sans faire confiance au client. Signature Cloudinary calculée avec SDK officiel ; aucun secret retourné.
2. Client admin charge directement chez Cloudinary. Limite interne intention 10 min ; la signature fournisseur peut avoir une validité plus longue, ne pas annoncer que 10 min la révoquent. Quotas d'upload limitent ce risque ; publicId unique et overwrite=false empêchent remplacement d'un autre fichier.
3. Confirmation : backend fetch metadata authentifiée Cloudinary, vérifie publicId réservé/assetId/version, format réel, bytes, dimensions <=6000 chaque axe et <=24 MP, utilisateur autorisé et intention non expirée. Les métadonnées client ne sont pas une preuve. READY seulement après validation.
4. Association DishMedia/logo/cover par mutation catalogue vérifiant READY. URL construite à partir d'un domaine Cloudinary configuré et version, pas une URL libre client. Remplacement transactionnel association+audit ; ancien fichier conservé tant que référencé, supprimé ensuite par outbox. DELETE asset encore utilisé ⇒409.
5. Nettoyage intentions expirées quotidien ; suppression distante idempotente, retry/backoff, état DELETING visible admin. En cas de délai Cloudinary, aucune grosse transaction DB ouverte. CDN versionné, formats/resolutions prédéfinis ; transformations arbitraires interdites pour éviter des coûts non bornés.

Le flux signé et le serveur de signature suivent le modèle [Cloudinary upload](https://cloudinary.com/documentation/upload_images). Les limites ci-dessus sont des choix Menu2Kin, pas des garanties automatiques du fournisseur.

Deep links canoniques `{PUBLIC_BASE_URL}/dish/{slug}`, `/restaurant/{slug}`, `/menu/{slug}`. Backend vérifie existence/visibilité puis fournit title/description/image/canonicalUrl/apiPath ; future page Next.js échappe les textes et génère metadata de partage. Universal Links/App Links nécessitent domaine possédé, apple-app-site-association et assetlinks.json avec IDs/certificats mobiles ; hébergement de ces fichiers à prévoir après choix domaine/identités. Pas de développement de page web dans V1 backend ni de service Firebase Dynamic Links ajouté. Slugs jamais réutilisés ; 404 si retiré, fermeture définitive restaurant résolue avec état explicite. Rien dans un slug ne constitue une autorisation.

## Redis et cohérence du cache

| Usage / clé | TTL initial | Invalidation / comportement |
|---|---:|---|
| `cat:v1:{locale}` | 3600 s | Invalidation outbox CategoryChanged ; HTTP 60 s admis pour taxonomie, fallback SQL |
| `catalog:v1:{resource}:{id}:{version}` | 60 s | Version invalide l'ancien ; statuts/ancêtres revalidés DB avant contenu ou 304 |
| `list:v1:{resource}:{filterHash}:{cursorHash}` | 30 s | IDs seulement ; filtre visibilité DB au service ; changements propagent outbox |
| `trend:v1:current` | 900 s | Pointeur vers snapshot publié atomiquement ; fallback dernier snapshot SQL |
| `trend:v1:{snapshot}:{commune}:{cursorHash}` | 900 s | Immutable dans snapshot, visibilité DB recontrôlée ; expiration curseur séparée |
| `home:v1:{commune}` | 30 s | IDs éditoriaux/tendances pour recommendations ; revalidation SQL |
| `search:v1:{dictionaryVersion}:{queryHash}:{filtersHash}` | 30 s | Seulement termes fréquents sans position précise ; invalidation génération catalogue ; SQL fallback |
| `rate:v1:{scope}:{actorHash}` | fenêtre + marge | Script Lua atomique ; quota partagé, pas de fallback permissif pour OTP/auth/admin |
| `dedup:v1:{kind}:{actorHash}:{resourceId}:{day}` | 48 h | SET NX pour vues client ; DB dédup par eventId, pas une sécurité utilisateur absolue |
| `bull:*` | selon job | Redis jobs noeviction, AOF ; suppression completed 7 j, failed 30 j ; outbox DB permet replay |

Timeout cache 50 ms, circuit breaker, jitter TTL ±10 % sauf expirations métier ; single-flight local pour prévenir stampede ; fallback SQL limité en concurrence (503 sous surcharge) ; Redis cache indisponible ne tue pas readiness. Redis utilisé pour quotas indisponible ⇒503 routes mutantes coûteuses ; découverte protégée par quota proxy de secours et pool borné. Readiness globale est stricte DB + Redis quotas ; liveness ne dépend d'aucun fournisseur.

Pas de cache profil/token, likes personnels, budget exact ou coordonnées précises. `Vary: Authorization` n'est pas une excuse pour mélanger privé/public : lectures catalogue n'enrichissent jamais selon l'utilisateur. Invalidation asynchrone peut retarder prix quelques secondes ; pour prix/détail/budget, relire les données SQL courantes. Les listes cachent surtout IDs et médias, pas prix faisant autorité. Disponibilité revalidée systématiquement.

## Transactions et concurrence

| Opération | Frontière transactionnelle | Effets externes |
|---|---|---|
| Restaurant + contacts/horaires + menu initial si demandé | Création complète, audit, outbox | Aucun provider dans TX |
| Publication menu/daily-menu | Contrôle parent, items, version ; état + audit/outbox | Index/push différés |
| Modifier prix ou disponibilité | CAS version + audit + outbox | Invalidation après commit |
| Like/favorite | INSERT/DELETE RETURNING + delta conditionnel + outbox | Pas d'événement pour retry no-op |
| Review create/edit/publish/hide/delete | Verrou restaurant puis avis, delta histogramme + audit si admin + outbox | Notifications éventuelles différées |
| Share | Dédup requestId, verrou acteur/cible/jour pour qualified, compteur + outbox | Pas d'appel réseau social |
| Refresh | Verrou session, consommation token, successeur ou révocation commit | Aucun |
| Changement téléphone/suppression compte/rôle | Identité, révocations, audit/outbox | Purge en lots |
| Remplacement média | Association + audit/outbox | Destruction provider après commit |

Prisma transaction interactive courte, timeout 3 s initial, isolation ReadCommitted + verrous ciblés ; opérations sur invariants transverses (dernier superadmin, publication simultanée) verrouillent agrégat parent. Retry borné 3 fois sur deadlock/serialization uniquement avec commande idempotente et jitter. Ne pas rejouer un appel SMS/FCM en bloc. Pas de transaction pour un simple GET ni pour enrichissement par provider.

Audit append-only : les modifications personnelles utilisent actorId=null et actorLabel="user:<UUID>" (actorId référence uniquement AdminUser) ; les jobs actorLabel="worker:<nom>". Champs : actorId, actorLabel, action, resourceType/id, before/after sélectionnés, reason, requestId, createdAt. Rôle DB application n'a ni DDL ni TRUNCATE ; trigger empêche UPDATE/DELETE audit, migrations via rôle différent. Export périodique vers stockage immuable si besoin opérationnel, pas de blockchain. Rétention initiale audit 12 mois à confirmer avec politique de confidentialité et obligations locales ; ceci n'est pas une affirmation de conformité juridique.

## Async et notifications

Outbox écrite dans PostgreSQL avec commande. Relay poll 1 s, lot 100, `FOR UPDATE SKIP LOCKED` ; enqueue jobId basé sur eventId (sans `:`), puis deliveredAt. Crash entre enqueue et marquage ⇒ duplicate possible ; consumer idempotent obligatoire, pas « exactly once ». Ordre par agrégat contrôlé par version de payload. Pas de dual write HTTP→DB puis queue sans outbox pour effet important.

Queues initiales : notifications, maintenance (trending/reconciliation/cleanup/media). Concurrence initiale notifications 5, maintenance 1, configurable après mesure. Retries provider transitoires 5, backoff exponentiel 1s..5min + jitter, respecter Retry-After ; poison job DLQ et alerte. Réexécution admin opérateur par eventId, aucune route queue publique. [BullMQ recommande des traitements idempotents pour rendre les retries sûrs](https://docs.bullmq.io/patterns/idempotent-jobs).

Planning : trending 15 min ; outbox continu ; housekeeping daily-menu 5 min (jamais condition de correction) ; nettoyage OTP/sessions/media/analytics quotidien ; réconciliation compteurs et notes nuit ; indexing Meili hors V1. Recalcule trending avec chevauchement contrôlé et snapshot complet, pas de publication partielle.

FCM : inbox PostgreSQL d'abord, Notification unique(user,eventKey), puis envoi à devices enabled et consentement push. Favorites restaurant déclenchent candidats sur DailyMenuPublished / DishPublished ; nouveauté pertinente = catégorie favorite explicite, pas scoring comportemental V1 ; rappels seulement opt-in, un rappel/jour max, quiet hours 21h–8h Kinshasa. Re-vérifier abonnement, statut user et contenu avant push. Cap initial 2 notifications/user/jour, dédup par événement ; pas de broadcast depuis endpoints publics.

Tokens FCM chiffrés AES-GCM avec key ID, hash HMAC pour unicité, installationId distinct, lastSeen renouvelé. Enregistrement idempotent ; changement de compte exige preuve d'installation (token actuel + secret d'installation conservé côté mobile via processus à implémenter ; simple UUID ne suffit pas). Choix V1 plus simple : refuser transfert inter-compte 409 jusqu'à DELETE authentifié sur ancien compte puis re-registration ; si ancien compte inaccessible, reset installation + nouveau token FCM, pas de takeover automatique. Token non enregistré/invalide retiré selon codes provider. [Firebase documente le suivi de fraîcheur et la maintenance des enregistrements](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

FCM ne garantit pas lecture ni livraison unique. Crash après succès réseau avant update sentAt peut doubler le push : notificationId dans payload et dédup côté client/inbox ; SENT signifie « accepté par fournisseur », jamais « lu ». Inbox reste disponible si FCM down ; liveness/readiness ne dépendent pas de FCM/Cloudinary.

## Analytics, anti-abuse et confidentialité

AnalyticsEvent rassemble SearchEvent/ViewEvent/InteractionEvent ; kind enum fixe, metadata validée par kind. Client autorisé à envoyer vues, filtres et clics sortants seulement ; like/favorite/share/review proviennent des transactions serveur. occurredAt serveur ; id événement client UUID déduplique les retries, userId/qualified/actorHash interdits en payload. Batch 20, payload total 64 KiB, métadonnées <=1 KiB.

DISH_VIEW, RESTAURANT_VIEW, DAILY_MENU_VIEW : resourceType/id et source ; SEARCH : query normalisée tronquée ou hash + resultCount bucket + commune, préférer hash si texte potentiellement sensible ; SEARCH_FILTER : noms de filtres seulement ; BUDGET_SEARCH : tranche budget/personnes/rayon, pas position précise ; phone/whatsapp/directions : cible restaurant et source, jamais numéro/contact du client. Consentement requis pour collecte non essentielle, sans bloquer découverte. Logs sécurité minimaux ont une finalité opérationnelle séparée et ne sont pas recyclés en profilage.

Actor analytics utilisateur = HMAC(userId), anonyme = HMAC(session anonyme signée), clé dédiée tournante mensuellement. Share utilise une clé SHARE_ACTOR_HASH_KEY distincte, stable pendant la fenêtre de dédup ; rotation planifiée avec recherche de hashes ancien/nouveau et verrou par identité stable pendant 30 jours ; suppression consentement bloque nouvelles collectes et job de purge. Bruts 30 jours, agrégats tendances 7 jours reconstructibles dans cette fenêtre, snapshots 2 h pour pagination, exports statistiques journaliers agrégés 12 mois dans stockage analytique externe seulement si utile ; pas de nouvelle table sans besoin. Share conservé 30 jours (idempotence), agrégat total Dish.shareCount conserve nombre historique qualifié ; reconstruction historique requiert checkpoint agrégé avant purge, job export mensuel vérifié. À défaut, `shareCount` doit être défini comme fenêtre 30 jours : décision retenue V1 **compteur glissant 30 jours**, décrément transactionnel à purge, jamais total historique prétendu. Like/Favorite compte courant reconstructible depuis relations.

Limiteurs multi-dimensions IP/user/phone/actor, IP hachée pour fenêtres de sécurité, TTL court, aucune IP brute dans analytics. Les identités anonymes sont faciles à renouveler : poids des vues anonymes plafonné, shares qualifiés anonymes séparément plafonnés par IP/cible/jour ; pas d'affirmation « utilisateur unique » sans compte. Burst >5× baseline 5 min ⇒ alerte, réduction quota et exclusion qualified après revue opérateur ; pas de bannissement définitif automatique. Proxy trust configuré sur nombre/proxy CIDR explicite pour éviter X-Forwarded-For forgé. Likes SQL uniques, shares requestId uniques, reports uniques, publication des avis modérée.

Sécurité HTTP : TLS obligatoire à l'edge, HSTS après validation domaine, Helmet, CORS allowlist exacte admin/web ; Flutter natif n'est pas protégé par CORS. JWT Bearer évite cookies implicites ; si futur back-office cookie, CSRF + SameSite/HttpOnly/Secure nécessaires. Rejeter masse de paramètres, bodies >64 KiB, SQL paramétré, tri allowlist, URLs website https/http validées sans fetch ; aucun import URL arbitraire. Texte avis brut sans HTML, encodage à la sortie du consommateur ; DTO n'est pas un sanitizer universel.

## Index et maintenance PostgreSQL

Les index sont dans schema.prisma + 02-invariants.sql ; pas d'index sur chaque booléen isolé.

| Index / groupe | Requête servie et justification |
|---|---|
| Slugs uniques Restaurant/Menu/Dish/FoodCategory | Résolution et collisions, B-tree déjà créé par unique |
| User.phone/googleSubject, RefreshToken.tokenHash | Identité et lookup secret hash, unique |
| Session(userId,revokedAt), expiresAt ; OTP(phone,purpose,createdAt), expiresAt | Sessions personnelles, restrictions/cleanup ; expiry index pour purge |
| Restaurant(status,createdAt,id), (commune,status) | Catalogue actif récent ou local ; neighborhood ajouté seulement si plans prouvent gain |
| Restaurant.location GiST | ST_DWithin géographique ; aucune distance exhaustive |
| Menu(restaurantId,status,position,id), MenuCategory(menuId,position,id) | Lecture ordonnée des descendants |
| Dish(restaurantId,availability,priceCdf), (menuCategoryId,position,id), (status,createdAt,id) | Plats d'un établissement, rubrique et feed ; pas de standalone availability |
| dish_budget_price partiel(priceCdf,id) | Plats principaux publiés disponibles avec portion, préfiltre budget |
| FTS GIN et trigram GIN Dish/Restaurant | Recherche lexicale et fuzzy ; coût d'écriture éditorial faible |
| DishFoodCategory PK(dishId,categoryId), (categoryId,dishId) | Taxonomie bidirectionnelle sans N+1 |
| Like PK(userId,dishId), (dishId,createdAt) | Idempotence, lookup personnel et agrégat par plat |
| Favorite uniques user/cible + user/createdAt/id + FK cibles | Dédoublonnage, liste personnelle et compteurs ; XOR SQL |
| Share(actorHash,requestId) unique, cible/createdAt | Replay et qualification fenêtrée ; purge via scans bornés à petit volume, createdAt index à ajouter si charge mesurée |
| Review unique(userId,restaurantId), restaurant/status/publishedAt/id, user/updatedAt/id, status/createdAt/id | Un avis, pagination publique/personnelle et file modération |
| ReviewReport(reviewId,reporterId), status/createdAt/id | Dédoublonnage et file d'attente |
| DailyMenu(restaurantId,date) unique, date/status/id | Un menu/jour et feed courant |
| MediaAsset(status,expiresAt), publicId/assetId uniques ; DishMedia unique(dishId,position) | Confirmations, orphelins, ordre images et sécurité ressource |
| Device installationId/tokenHash uniques, userId/enabled | Routage push et prévention association multiple |
| Notification(userId,eventKey) unique, userId/createdAt/id | Inbox et dédup événement |
| Analytics(kind,occurredAt), resourceType/resourceId/occurredAt | Fenêtres statistiques ; BRIN/partition date après volumétrie confirmée |
| DishTrend PK(snapshotAt,dishId), snapshotAt/score/dishId | Snapshots et cursor seek ordonné |
| Audit(resourceType,resourceId,createdAt), actorId/createdAt | Historique objet/auteur ; exports/purge opérateur |
| Outbox(deliveredAt,createdAt) | Relay non livré, purge livré ; index partiel WHERE deliveredAt IS NULL si la table grossit |
| Clés composites id/restaurantId et index FK | Intégrité intra-restaurant, coût assumé ; aucune FK polymorphe lâche |

Index positions uniques de plage horaires + exclusion GiST btree_gist empêchent chevauchement. CHECKs couvrent monnaie, rating/histogramme, XOR, coordonnées, jour local et portions. Les champs SQL search_text/search_vector sont gérés manuellement ; un diff Prisma futur doit être relu pour ne pas supprimer triggers, extensions et index. Ne pas exécuter db push en staging/production. Le support `Unsupported` est explicite dans [la référence Prisma](https://docs.prisma.io/docs/orm/reference/prisma-schema-reference).

## Performance, réseau mobile et objectifs initiaux

Selects minimaux, batch relations par pages, projections summary au lieu de DTO complet dans chaque arbre, max 50 résultats ; photos max 10. Préparer différentes projections de Dish pour feed si payload mesuré trop lourd, sans casser contrats existants (champ summary endpoint distinct). ETags représentation, gzip/Brotli au proxy, images CDN dimensionnées, dédup IDs. Pas d'ETag basé uniquement updatedAt si représentation inclut compteurs ou descendants ; hash sérialisation canonique après revalidation.

Connection pool initial 10/API replica, 5/worker, budget global ≤70 % de max_connections après réserves opérations/migrations ; PgBouncer transaction mode si replicas supplémentaires, URL directe séparée pour migrations. Timeouts requête HTTP 5 s, DB lectures lourdes 750 ms, transactions 3 s ; aucun fetch provider HTTP sans timeout. Search/nearby/budget → EXPLAIN ANALYZE BUFFERS sur 10k puis 100k plats et hotspots Gombe, pas uniquement seed 10 lignes. Home/recommendations assemble au plus 2 requêtes batch ; trending lit snapshot indexé ; aucun AVG review par carte restaurant.

| Indicateur | Cible initiale, non garantie | Validation / alerte |
|---|---|---|
| Disponibilité API | 99.5 % mensuelle V1 | Uptime probes, fenêtres déploiement incluses ; budget d'erreur |
| p95 GET catalogue | <250 ms serveur | Test 50 req/s initial puis production ; réseau mobile mesuré séparément |
| p95 search/geo/budget | <500 ms serveur | Corpus réaliste, cache chaud/froid ; >750ms alerte soutenue |
| 5xx hors erreurs client | <0.5 % / 24 h | Alerte >2 % sur 5 min et volume minimum |
| PostgreSQL CPU / connexions | <70 % soutenu / <70 % budget | CPU, wait events, slow queries, saturation pool ; tuning avant scale |
| Cache hit sur routes cacheables | >70 % quand trafic répétitif | Ne pas compter auth/budget ; bas taux n'est pas incident automatique |
| Outbox oldest / push backlog | <30 s / <5 min | Alerte lag, DLQ et essais provider |
| Données prix vérifiées | revue ≥ chaque 14 jours | Dashboard éditorial, pas promesse de prix restaurant |
| RPO/RTO initiaux | 15 min / 4 h | PITR + exercice de restauration trimestriel à chronométrer |

Logs structurés JSON pino avec timestamp UTC, level, requestId, correlationId, route template, status, durationMs, module, error code ; aucune URL query contenant token/phone/GPS, pas de payload auth. Request ID entrant accepté seulement format/longueur validés, sinon UUID serveur ; trace W3C via OpenTelemetry si utile, propagation job payload. Sentry backend filtre PII, sample erreurs conservé, traces échantillonnées ; métriques labels route/status, jamais userId/slug comme label à haute cardinalité. Surveiller locks, deadlocks, réplication, disque, cache erreurs, SMS taux succès/coût, FCM acceptations/tokens invalides, fraîcheur trending et délai modération.

Liveness répond sans DB, readiness DB + Redis sécurité avec timeout 500 ms ; détails internes derrière réseau ops. Arrêt SIGTERM : retirer readiness, terminer requêtes/jobs en cours (30 s grace), fermer clients DB/Redis. Un worker ne prend plus de job avant arrêt. Backups chiffrés + PITR, test de restauration obligatoire avant qualifier le système de production-ready.

## Tests et critères de livraison

Unitaires Jest : budget BigInt/Decimal et portions, normalisation/typos/synonymes, horaires/exception/minuit, règles publication, transitions avis, formule trending, signature/expiration curseur, mapper erreurs et redaction. Horloge injectée, pas de sleep réel. Les tests ne doivent pas recopier la formule sans vérifier des cas métier concrets.

Intégration Jest sur **vrai PostgreSQL/PostGIS + Redis**, jamais SQLite pour contraintes/geo : migrations vierges, FK composites et XOR, mauvais prix, horaires chevauchants, trigger coordonnées, 3 km/5 km avec points à 2999/3001 m construits avec ST_Project, requêtes explain sur fixture charge. Likes/favoris 50 requêtes concurrentes ; refresh double rotation et replay après commit ; reviews publish/edit/delete en concurrence puis histogramme exact ; share retries et qualification ; outbox crash entre enqueue/marquage ; Redis indisponible sécurité vs cache ; daily expiré avec worker arrêté.

E2E Supertest : matrice routes publiques/propriétaires/rôles, absence PII dans réponses, strict DTO, no-op idempotents, timestamps/Decimal format, pagination filtres modifiés, If-Match 409/428, 404 ressource retirée malgré cache/snapshot, changement téléphone/compte supprimé, media confirmation simulée trompeuse, notification cross-user, QR/deep link retiré. Providers SMS/FCM/Cloudinary mockés au niveau ports ; smoke sandbox séparé staging avec secrets, aucun SMS réel en CI PR.

OpenAPI : validation structurelle, toutes routes Nest exportées comparées au contrat, tests de réponse AJV par endpoint, snapshot des types générés pour client, breaking change check PR. Couverture cible domaine critique ≥90 % branches, pas un taux global décoratif ; aucun merge si invariant financier/auth échoue. Charge k6/artillery hors tests unitaires, profil cold/warm, limites et erreurs ; test panne DB/Redis et restauration sauvegarde avant lancement.

## Environnements, Docker et CI/CD

Development/test utilisent comptes de démo et adaptateurs SMS/push désactivés ; staging et production DB/Redis/provider credentials séparés ; aucune copie de données personnelles prod en staging. `.env.example` contient noms et valeurs locales sans vrais secrets. Env schema refuse JWT/peppers trop courts, URL manquante, wildcard CORS production, provider dev en production, TLS externe désactivé. DATABASE_URL pool appli ; DIRECT_DATABASE_URL migration ; Redis cache et jobs distincts en prod ; Cloudinary/FCM secrets montés en fichiers/secret manager, Sentry DSN facultatif en dev. Meili désactivé par défaut et variables non requises V1.

[Dockerfile](deployment/Dockerfile) multi-stage Node 22, npm ci, build + Prisma generate, runtime non-root, healthcheck ; [Compose](deployment/compose.yaml) PostGIS 17/3.5, Redis 7, Meili optionnel, API profil app. Versions majeures constituent une base de compatibilité à figer dans lock et digests avant production, pas une déclaration « dernières versions ». Les versions existantes Nest 12/TypeScript 6 du dépôt ne sont pas modifiées ici. Prisma 7 validé isolément ; vérifier matrice SDKs/Node lors installation complète.

Le template de release Kubernetes est une référence facultative pour un cluster géré déjà disponible ; il ne justifie pas de construire/exploiter un cluster pour V1. Pour une petite équipe, privilégier un service de conteneurs géré et adapter cette seule étape une fois l’hébergeur choisi.

Les modèles supposent l'implémentation des scripts package : `lint` ESLint, `typecheck` tsc --noEmit, `test:unit` Jest unit, `test:integration` Jest intégration, `test:e2e` Supertest, `build`, `format:check`, `prisma:generate`, `prisma:migrate:deploy`, `openapi:check`. Le dépôt utilise actuellement oxlint : remplacement par ESLint + typescript-eslint à faire au lot socle, règles no-floating-promises et typechecked recommandées, Prettier conservé. Pas de dépendances ajoutées par ce dossier pour prétendre ces scripts présents.

Pipeline proposé : npm ci verrouillé → ESLint/Prettier → typecheck → unit → migrate DB test → intégration + E2E → OpenAPI diff → build → Docker build. PR sans secrets ni push image. Main validé produit image GHCR tag SHA ; déploiement staging via environnement GitHub `staging`, kubeconfig dédié et manifest Deployment existant (choix hébergeur adaptable), migration Job à partir de la même image, rollout vérifié et smoke readiness. Production workflow_dispatch + environnement protégé `production` avec required reviewers et SHA image validée staging ; ce contrôle doit être configuré dans GitHub, YAML seul ne crée pas les reviewers.

Aucune publication/déploiement n'est effectuée ici. Avant activer les modèles : scripts réels, lock, migrations générées et testées, probes implémentées, secrets, registre autorisé, clusters namespaces/Déploiements API-worker et Job migration, action SHAs épinglés, sauvegarde/PITR et stratégie rollback. Déploiement image ancien possible seulement si migration expand reste rétrocompatible ; pas de rollback SQL destructif automatique.

## Seed, import et migration

Seed canonique catégories : burger, pizza, poulet, poisson, grillades, accompagnements, boissons, desserts ; taxonomie éditoriale versionnée, pas d'allégation d'exhaustivité. Communes/quartiers : fichier référentiel curé/importé et vérifié localement ; ne pas inventer coordonnées ou découpage administratif. V1 commune/neighborhood texte contrôlé par référentiel en service, pas tables géographiques administratives complètes sans besoin. Seed démo crée Restaurant « Démo Menu2Kin Gombe » marqué explicitement fictif, coordonnées choisies comme point de test (pas adresse d'un établissement réel), 1 menu, 2 rubriques et 3 plats dont principal portion 1, partage portion 3 et accompagnement exclu budget.

Implémenter `prisma/seed.ts` idempotent : upsert catégories/slugs et UUID fixtures stables, transaction par restaurant, aucun admin/password automatique, pas de média tiers non autorisé ; mode demo exige NODE_ENV development/test + `ALLOW_DEMO_SEED=true`, refuse production. Réexécution ne réécrit pas les prix édités sur base réelle ; fixtures limitées IDs namespace démo. Les tests créent leurs fixtures, pas dépendance au seed global. Un fixture JSON concret est fourni dans deployment/seed-demo.json.

CSV futur : colonnes externalId, restaurantExternalId, menuExternalId, menuCategoryExternalId, name, priceCdf, priceUsd, servesPeople, isMainDish, availability ; aucune formule Excel exécutée, parser strict UTF-8, limites lignes/fichier et erreurs par ligne. Dry-run produit rapport des changements ; import validé via même DTO/services/audit, transaction par restaurant avec batch 100, reprise par importId/externalId. Si imports récurrents sont adoptés, ajouter ImportRun/ExternalReference à ce moment, pas avant. Pas de endpoint upload CSV non borné V1.

Migration initiale : extension SQL avant tables ; générer DDL Prisma vers migration core ; compléter invariants/indexes SQL après tables ; tester install from zero dans DB et shadow DB supportant extensions. Écrire migration_lock.toml provider postgresql. Champs geography et search gérés explicitement ; inspection du diff empêche leur retrait. `prisma migrate deploy` uniquement en Job unique orchestré ; `db push` réservé expériences jetables hors workflow.

Évolution expand/backfill/contract : ajouter nullable/default compatible, déployer double lecture/écriture si nécessaire, backfill en lots hors longue TX, ajouter CHECK NOT VALID puis VALIDATE, créer index CONCURRENTLY dans migration dédiée hors transaction, basculer lectures, supprimer ancien champ après fenêtre compatibilité clients/déploiements. Revoir locks et durée sur clone synthétique volumineux ; pas rename/drop en même temps que code qui en dépend. Sauvegarde/PITR vérifiés ; DDL PostGIS sous rôle migration, application sans DDL.

## Feuille de route technique

1. **Socle** : dépendances compatibles/lock, ESLint strict, env schema, Prisma migration réelle PostGIS, probes, logs, erreurs, Swagger, CI locale. Critère : base vierge migrée, build/test et Docker démarrent.
2. **Catalogue éditorial** : restaurants/horaires, menus/rubriques/plats/catégories, publication et médias sécurisés, RBAC admin/MFA, audit, fixtures. Critère : tout catalogue administrable et non-public isolé.
3. **Découverte** : recherche, geo, budget exact, daily-menu, liens stables, pagination/ETags. Critère : corpus local + cas frontière et charge p95 mesurée.
4. **Identités et engagement** : OTP fournisseur validé, Google, sessions, likes/favoris/avis/modération, compteur concurrent. Critère : tests race/IDOR et prévention spam.
5. **Jobs et instrumentation** : outbox, tendances, analytics consentis, inbox/FCM, réconciliation et runbooks. Critère : panne provider sans perte DB, replay sans doubles effets métier.
6. **Lancement contrôlé** : staging, smoke providers, audit droits/secrets, restauration PITR, tests charge, validation prix/portions de démo remplacés par données réelles. Critère : SLO observés, alertes et responsables d'astreinte, aucun compte admin partagé.

Pas de calendrier promis sans effectif/qualité données/provider connus. Étapes peuvent chevaucher en équipe, contrats d'abord.

V2 FoodVideo et médias spécifiques avec modération propre ; V3 Comment et RestaurantOwner/RestaurantMembership pour comptes restaurants, permissions bornées restaurant et workflows éditoriaux ; V4 Reservation module avec créneaux/idempotence ; V5 Order/OrderItem qui snapshotte nom/prix/monnaie et ne dépend jamais des prix modifiables Dish ; V6 Payment ledger/idempotence/webhooks propres ; V7 Delivery zones/routes/états séparés. Ne pas réutiliser Review pour commentaires, Share pour commandes ou RestaurantService pour une transaction livraison. Les UUID stables et FK catalogue permettent ces ajouts ; plats soft-deleted ne détruiront pas l'historique d'OrderItem futur.

Scale : vertical PostgreSQL + index d'abord ; 2 API stateless derrière LB, workers distincts, pool borné ; Redis séparé, Meili si seuils de pertinence/latence atteints ; réplicas lecture uniquement pour lectures tolérant retard, jamais auth/budget/admin ; partition analytics après volume constaté. Extraire un service seulement quand autonomie d'équipe, charge et frontières métier le justifient, pas comme échéance automatique.
