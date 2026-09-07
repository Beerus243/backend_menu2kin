# Données, import contrôlé, déduplication et refresh

## Pourquoi une référence avant le Restaurant Draft

Le schéma cible existant exige name/address/latitude/longitude pour Restaurant. Avec seulement un Place ID autorisé à persister, créer immédiatement ce Restaurant obligerait à recopier Google ou inventer des valeurs. **Ne pas insérer 0,0 ni un faux nom.**

Une seule table supplémentaire `RestaurantGoogleReference` sert à la fois de piste sélectionnée et de lien à un restaurant existant : UUID interne, googlePlaceId unique, restaurantId nullable, createdById, createdAt, lastCheckedAt, invalidSince. Elle contient zéro nom, adresse, téléphone, horaire, photo, note ou snapshot Google. Si restaurantId est null, le statut de workflow affiché par l'API est `NEEDS_INDEPENDENT_DATA`, pas un restaurant public incomplet.

Un restaurant peut avoir plusieurs références Google historiques ; cela couvre IDs remplacés et lieux apparentés après décision humaine. Un Place ID ne peut pointer que vers un restaurant. Pas besoin de multiplier Restaurant.googlePlaceId, googleSyncedAt et d'une table de copie Google : la table de références est propriétaire de ces valeurs. Le public ne la joint pas pour servir des champs métier.

Le [SQL proposé](schema-additions.sql) s'applique au schéma cible PostgreSQL décrit dans docs/architecture/database, pas au catalogue mémoire actuel. Aucun SQL n'est exécuté par ce livrable.

## Provenance minimale et états indépendants

Ajouter à Restaurant :

- `contentStatus` : DRAFT, PENDING_REVIEW, PUBLISHED, HIDDEN, ARCHIVED.
- `fieldProvenance` : JSONB strictement validé, limité aux groupes name/address/geo/contact/openingHours ; source, verifiedById, verifiedAt, evidenceRef. Les valeurs résident dans les colonnes/tables métier, pas dans ce JSON.

Sources canoniques admises : `TEAM_FIELD_VISIT`, `RESTAURANT_PROVIDED`, `AUTHORIZED_PARTNER`. `ADMIN` n'est pas une provenance suffisante : il désigne celui qui saisit, pas l'origine du fait. `GOOGLE` est autorisé dans le modèle externe transitoire, jamais comme preuve que le champ canonique est librement réutilisable. Un futur contrat autorisant explicitement une autre utilisation nécessiterait une nouvelle policy versionnée, pas un flag arbitraire « legal=true » fourni par l'admin.

Exemple de métadonnées Menu2Kin :

```json
{
  "name": {"source":"RESTAURANT_PROVIDED","verifiedById":"UUID-admin","verifiedAt":"2026-09-07T15:00:00Z","evidenceRef":"internal-evidence-42"},
  "geo": {"source":"TEAM_FIELD_VISIT","verifiedById":"UUID-admin","verifiedAt":"2026-09-07T15:00:00Z","evidenceRef":"internal-survey-8"}
}
```

`manualOverride` global est supprimé du design : il ne dit pas quel champ est protégé, et tous les champs canoniques sont déjà protégés de Google. `lastSyncedAt` est remplacé par reference.lastCheckedAt : il exprime un contrôle externe, pas une synchronisation de toute la fiche. L'audit Menu2Kin conserve les modifications propres, leurs preuves et acteurs.

Restaurant.status existant garde son sens opérationnel (ACTIVE, INACTIVE, TEMPORARILY_CLOSED, PERMANENTLY_CLOSED ; DRAFT hérité à déprécier lors migration). Une publication ne change pas l'état opérationnel. verificationStatus conserve VERIFIED/UNVERIFIED jusqu'à ce qu'un protocole de vérification plus détaillé soit nécessaire. Aucun état GOOGLE_IMPORTED dans les états métier.

Transitions éditoriales : DRAFT→PENDING_REVIEW après champs requis/provenances valides ; reviewer ADMIN/SUPER_ADMIN autorise PENDING_REVIEW→PUBLISHED ou retour DRAFT avec motif ; PUBLISHED→HIDDEN/ARCHIVED ; HIDDEN→PENDING_REVIEW ; ARCHIVED→DRAFT si réouverture explicitement approuvée. L'éditeur ne publie pas seul un import. Publication V1 exige au moins un menu/plat/prix autorisé publié, identité/coordonnées indépendantes et contrôles éditoriaux complets. La collecte seule ne rend pas automatiquement verificationStatus VERIFIED.

## Import d'une référence

`POST /api/v1/admin/google-places/imports`, JSON minimal `{ "googlePlaceId": "..." }`, Idempotency-Key requis.

1. Auth/MFA/permission, validation, puis lookup unique Place ID avant tout appel Google.
2. Déjà lié : retour EXACT_MATCH avec UUID du restaurant, zéro appel fournisseur. Piste déjà présente : retourner la même référence, zéro duplication.
3. Nouveau : Place Details identity une seule fois après quota ; valider le modèle externe. Le client n'est jamais une preuve d'authenticité du payload fournisseur.
4. Préparer seulement `googlePlaceId`. Recherche de correspondances possibles selon la policy ci-dessous ; aucune copie de la preview dans DB/audit/outbox.
5. Transaction : verrou de commande/idempotence, recheck unique, insert référence, audit des IDs/acteur et outbox si nécessaire. Aucun appel HTTP dans la transaction.
6. Retour `NEEDS_INDEPENDENT_DATA` + UUID de référence ; preview éventuelle en réponse no-store seulement. Le restaurant n'existe pas encore.
7. L'équipe collecte les informations indépendantes puis appelle `POST /admin/restaurant-drafts` avec la référence et les données prouvées. Validation des champs/prix/médias existante, déduplication, transaction Restaurant DRAFT + provenance + liaison + audit. Retour UUID interne. Aucune donnée Google brute n'est acceptée dans ce DTO.

Le résultat JSON d'idempotence stocké ne contient que le type de résultat et les UUID/Place ID. Pas de replay de snapshot Google. Une erreur Google ne produit aucune écriture et ne réserve pas un résultat succès. Une transaction perdante sur la contrainte unique retourne la référence existante. Même Idempotency-Key avec body différent ⇒409 ; portée admin + commande, rétention 24 h. Au-delà, la contrainte Place ID garde l'idempotence métier.

Un retry après panne Google peut fonctionner plus tard ; pas d'invention d'une fiche à partir d'un résultat cache périmé. Chaque nouveau Details peut être facturé, d'où le lookup local avant appel.

## Déduplication

**EXACT_MATCH** : référence Place ID déjà liée au même restaurant ; résultat certain sur la référence, pas preuve de qualité de la fiche. Si référence non liée, retourner la piste existante (`REFERENCE_EXISTS`). Deux Place IDs distincts peuvent représenter un même restaurant ; ne jamais supposer l'inverse.

**PROBABLE_MATCH** : candidat sur des données d'identité **indépendantes** fournies lors de la collecte. Préfiltre SQL : distance ≤250 m via ST_DWithin sur geography Menu2Kin ; autres branches téléphone E.164 égal (même s'il est loin) et similarités nom/adresse (≥0.9/≥0.8), union de ≤20 candidats. Similarité nom via pg_trgm/unaccent stocké Menu2Kin. Proposition : nom ≥0.65 et distance ≤250 m, ou nom ≥0.9 et adresse ≥0.8, ou téléphone égal. Score explicable 45 % nom +25 % proximité +20 % adresse +10 % téléphone ; valeurs absentes ne comptent pas et les règles déclencheuses restent exposées. Score sert uniquement au classement, aucune fusion automatique. Le service limite l'exécution et renvoie un contrôle requis plutôt que tronquer silencieusement une ambiguïté.

**NO_MATCH** : aucun candidat sur la fenêtre et l'identité indépendante suffisante (nom + coordonnées, ou nom + adresse + téléphone). Ce résultat ne prouve pas l'absence universelle d'un doublon.

**INSUFFICIENT_DATA** : seulement Place ID inconnu, sans données indépendantes pour tester les autres critères. Nécessaire pour ne pas présenter un manque d'information comme NO_MATCH. C'est l'issue normale de l'import initial.

Exemple « Restaurant Mama » / « Restaurant Mama Kinshasa », distance 120 m : probable candidat si les noms/coordonnées comparés sont issus des collectes autorisées. Le même calcul sur un payload Google, sa persistance ou son indexation est **une option non activée** à faire examiner selon les restrictions d'usage/création de contenu ; la seule exception de cache ne suffit pas à la justifier. Aucun point-in-polygon sur les coordonnées Google pour déduire automatiquement une commune.

Décision admin : `LINK_EXISTING` avec restaurantId, version et motif, ou `CREATE_NEW` avec preuves indépendantes et justification si candidats probables. Le serveur recalcule les candidats à la confirmation, ne croit pas un client envoyant NO_MATCH. Verrou transactionnel sur la référence ; CAS restaurant.version ; jamais de fusion de menus/avis par ce workflow. Un candidat avec autre succursale/étage ou téléphone central partagé doit rester distinct si l'équipe le confirme.

Deux créations concurrentes avec Place IDs différents ne sont pas arrêtées par l'unique Google : la transaction création de Restaurant prend un verrou advisory commun à la création éditoriale V1 puis refait la recherche, ou isolation serializable avec retry borné. Faible volumétrie admin rend cette sérialisation acceptable. Tous les chemins de création respectent ce protocole. Un near-match humain peut encore être manqué : outil futur de revue, aucun merge automatique destructif.

## Refresh contrôlé et corrections

`POST /admin/restaurants/:id/google-refresh-preview` choisit une référence attachée et un profil identity/contact. Charge le Restaurant et sa version depuis DB, demande Details une fois puis calcule un diff **en mémoire** : field, valeur Menu2Kin/provenance, valeur Google/provenance, `canApplyToCanonical=false`. Absence fournisseur = MISSING, pas ordre d'effacement. La réponse inclut attribution, fetchedAt, restaurantVersion et no-store.

Actions proposées : `KEEP_MENU2KIN` clôt le contrôle sans modifier de champ ; `REQUEST_INDEPENDENT_VERIFICATION` crée une tâche éditoriale contenant uniquement noms de champs/UUID, pas valeurs Google. Le bouton conceptuel « Utiliser Google » **n'est pas une commande de sauvegarde canonique dans la policy V1**. Une correction est une commande d'édition Menu2Kin avec nouvelle preuve indépendante et If-Match ; elle peut aboutir à une valeur identique, sans changer l'origine de la preuve.

Seuls reference.lastCheckedAt et l'audit technique de contrôle réussi sont mis à jour ; pas de sauvegarde du diff ou de ses hashes. Un refresh qui échoue ne modifie ni horodatage de succès ni disponibilité publique. Nom/phone/horaires/coordonnées manuels demeurent identiques avant et après tout appel Google.

Place ID 404 : conserver sa référence historique, marquer invalidSince et demander réidentification humaine ; ne pas archiver Restaurant. Si un ID change ou un `movedPlaceId` est proposé ultérieurement par un profil de maintenance, l'équipe vérifie puis ajoute une nouvelle référence liée au même UUID ou distingue un nouvel établissement. L'ancien ID reste réservé pour déduplication historique. Les Place IDs anciens méritent une vérification ; Google recommande un refresh lorsqu'ils ont plus de douze mois, via un appel ID-only. [Guide Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id). Pas de Details contact annuel massif sous couvert de vérification ID.

## PostGIS, cache et migrations

Latitude/longitude canoniques proviennent des sources M. Le trigger du schéma cible alimente geography(Point,4326) ; GiST + ST_DWithin restent utilisables lorsque Google tombe. Dédoublonnage géographique et moteur public emploient ces coordonnées propres. Le preview Google ne remplit pas cette colonne, même temporairement.

V1 : aucun cache de coordonnées Google. Si une option de cache est approuvée plus tard sous l'accord applicable : stockage isolé, jamais joint au public, collectedAt/expiresAt non prolongés sur lecture, purge avant échéance (marge opérationnelle ≤29 jours retenue), sauvegardes/WAL/replicas et logs inclus dans la stratégie d'effacement. Un TTL Redis sur la clé ne suffit pas si AOF/backups conservent le contenu. Cette complexité justifie de ne pas l'activer.

Migration cible proposée : nouvelle table références + contentStatus + provenance ; ajout expansif ; anciens restaurants mappés vers publication à partir de l'état éditorial réel, **pas publication automatique à partir d'une provenance Google**. La valeur fieldProvenance={} impose un rattrapage des preuves avant nouvelles publications, sans inventer une provenance rétroactive. Requêtes publiques doivent intégrer contentStatus=PUBLISHED puis état opérationnel ; rollout des lecteurs avant activation des commandes admin. Les modifications de coordonnées maintiennent le trigger existant. Aucun changement de FK menus/dishes/reviews.

Prisma cible : `RestaurantGoogleReference.id String @id @default(uuid()) @db.Uuid`, googlePlaceId String @unique @db.VarChar(512), restaurantId String? @db.Uuid, createdById String @db.Uuid ; relations vers Restaurant.id et AdminUser.userId, onDelete Restrict. Ajouter backrefs `googleReferences RestaurantGoogleReference[]` à ces deux modèles, `contentStatus RestaurantContentStatus @default(DRAFT)` et `fieldProvenance Json @default("{}")` à Restaurant. Index `(restaurantId)` et `(lastCheckedAt)` pour lookup/maintenance. Pas de champ Google dans Dish/Review, pas de Google snapshot JSONB.
