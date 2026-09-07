# Exploitation et évolution

## Redis, quotas et coûts

Aucun cache applicatif de previews Google en V1, ni dans PostgreSQL, Redis, logs, traces, files de jobs ou sauvegardes. Les Place IDs constituent l'exception retenue. Redis sert uniquement les compteurs atomiques de rate limit, réservations de budget et clés d'idempotence liées à des UUID internes. Une clé d'idempotence expire après 24 h selon notre politique ; sa valeur contient le résultat interne ou son ID, pas un snapshot Google. Si Redis est indisponible, fermer les opérations Google payantes ; ne pas contourner les plafonds. Le catalogue public ne dépend pas de ce limiteur.

Plafonds de départ proposés : limites par route dans [api.md](api.md), total 30 requêtes admin Google/minute/acteur, maximum 2 appels simultanés/acteur, 5 simultanés/instance, budget global initial **100 appels fournisseur/jour/projet**. Compteur global partagé entre instances avec réservation atomique avant appel ; inclure pages et échecs facturables potentiels. Configurer aussi les quotas fournisseur par méthode et projet. Ces nombres sont des garde-fous produit à ajuster, pas les quotas Google. Bloquer à épuisement. Une alerte budgétaire cloud seule n'est pas un coupe-circuit.

Coût prévisionnel : `Stext × tarif Text Search(mask) + Snearby × tarif Nearby(mask) + Didentity × tarif Details(identity) + Dcontact × tarif Details(contact)`, avec paliers/franchises réels du compte et taxes si applicables. Mesurer appels par opération et profil, pas uniquement le nombre de restaurants créés. Ne demander contact qu'à la sélection explicite. Un debounce futur côté dashboard peut aider mais ne remplace pas le limiteur serveur ; aucun dashboard livré ici. Pas d'autocomplete V1, son modèle de sessions serait une complexité sans besoin établi.

BullMQ inutile pour une recherche ou un import individuel. Pas d'import massif de Kinshasa et pas de refresh planifié de tout le catalogue. Si un futur besoin autorisé exige des jobs, stocker seulement les IDs internes/Place IDs, garantir quotas, durée bornée, idempotence et audit ; aucune réplication de résultats dans des jobs. Un rafraîchissement d'ID ancien peut être traité séparément des données métier.

## Sécurité et environnement

Clé exclusivement serveur, secrets séparés development/staging/production et projets dédiés. Restreindre la clé à Places API New et, pour un serveur avec sortie IP fixe, aux IP de sortie autorisées. Rotation via gestionnaire de secrets ; aucun secret dans Git, Dockerfile, build args, Swagger, URL ou logs. Le transport livré utilise l'hôte Google fixe, interdit les redirections, valide les IDs, limite à 256 KiB la réponse et à 4 secondes le délai par défaut. Aucun transport HTTP contrôlable par le client public. [Bonnes pratiques Google](https://developers.google.com/maps/api-security-best-practices).

Configuration **future**, non câblée dans AppModule :

```dotenv
GOOGLE_PLACES_ENABLED=false
GOOGLE_MAPS_API_KEY=
GOOGLE_PLACES_TIMEOUT_MS=4000
GOOGLE_PLACES_DAILY_CALL_LIMIT=100
```

Le module livré accepte ces valeurs via `GooglePlacesModule.register({ enabled, apiKey, timeoutMs })` après parsing/validation par la future configuration centrale. Ajouter ces variables seules n'active rien. En développement et CI : transport mock, pas de clé. Staging : activation explicite, quota faible et vrais admins. Production : aucune activation avant persistance, RBAC, limiteur distribué, attribution et revue des conditions applicables. Le backend actuel reste un catalogue de démonstration et refuse déjà son lancement en production.

Docker : réutiliser le service backend de l'architecture générale ; pas de nouveau microservice Places. Injecter la clé à l'exécution depuis un secret, jamais dans une couche image. Autoriser la sortie HTTPS vers Google uniquement pour le backend qui en a besoin. PostgreSQL/PostGIS et Redis suivent la configuration proposée générale, avec volumes/chiffrement/sauvegardes des seules données autorisées. Le SQL de ce dossier est une proposition à adapter et tester sur une base jetable avant toute migration réelle.

L'admin RBAC, les commandes persistantes et le contrôleur HTTP ne sont pas encore implémentés. Une clé Google fonctionnelle ne remplace pas ces prérequis. Désactiver la capture automatique des bodies Google dans APM/Sentry/proxy ; les headers sensibles et tokens sont filtrés. Les réponses previews nécessitent Google Maps et les attributions tierces dans le futur consommateur admin, même si privé.

## Observabilité et dégradation

Implémenté dans le client : `google_request`, `google_success`, `google_error`, avec opération, durée et code d'erreur sûr, sans query, coordonnées, réponse, clé ou token. Les réponses sont mappées et validées avant de compter un succès.

À ajouter dans les use cases : `google_import`, `google_refresh`, `google_duplicate_detected` avec requestId, actorId, referenceId/restaurantId, résultat et durée. Pas de valeurs Google avant/après dans l'audit. Métriques : appels par opération/profil, latence p50/p95, taux d'échec, 429 externes, rejets locaux, budget restant, doublons exacts/probables, temps référence→brouillon→publication. Limiter les labels à des enums, pas d'ID individuel. Alerte sur refus clé immédiat, dépassement de budget ou hausse persistante des erreurs. Ne pas confondre logs structurés livrés et instrumentation métrique encore à ajouter.

| Défaillance | Admin Google | Catalogue public et édition propre |
|---|---|---|
| timeout/panne/quota/clé invalide | erreur contrôlée, sélection possible plus tard | continuent avec PostgreSQL dans l'architecture cible |
| Place ID disparu | référence marquée invalide après vérification | restaurant conservé, pas de dépublication automatique |
| Redis indisponible | appels Google bloqués | lecture publique indépendante du limiteur Google |
| donnée Google différente | preview de différence, aucune écriture canonique | donnée Menu2Kin inchangée jusqu'à collecte indépendante |

Aujourd'hui, la lecture publique utilise les fixtures locales ; l'indépendance à Google existe déjà, la persistance PostgreSQL est encore proposée.

## Tests

Les tests du client injectent `fetch` : aucune dépendance Internet, aucune clé réelle. Vérifier masques, corps Text/Nearby, profil contact, mapping/attributions, champs absents, forme invalide, projection Place ID seule, erreur réseau, timeout, JSON invalide, taille excessive, codes 400/401/403/404/429/503, désactivation, absence de retry et absence de fuite de secrets. Le test Nest vérifie le câblage DI.

Avant exposition HTTP, ajouter des tests d'intégration avec PostgreSQL/PostGIS et Redis jetables : import deux fois, course simultanée sur placeId unique, rollback, liaison conflictuelle, provenance obligatoire, données inconnues refusées, recherche de doublons uniquement sur faits indépendants, concurrence d'édition, échéance idempotence et budget atomique. Vérifier aucune donnée Google dans tables/logs/jobs après refresh, y compris sur échec de transaction.

E2E futurs Supertest : 401 anonyme, 403 utilisateur non admin, recherche admin mockée, sélection, NEEDS_INDEPENDENT_DATA, création DRAFT après collecte, contrôle doublons, ajout menu/plats/prix/photos autorisées, revue/publication, public accessible pendant panne Google. Rafraîchissement ne doit modifier aucun champ canonique, y compris téléphone modifié manuellement. Tester quotas locaux et externes distinctement. Ces tests de workflows ne sont pas revendiqués comme livrés.

## Déploiement progressif

1. Terminer authentification admin, persistance et contrats internes ; appliquer provenance et statuts sur les données existantes après audit.
2. Ajouter les use cases, quotas, présentation admin et tests ci-dessus ; revue de l'attribution et des conditions au moment de l'activation.
3. Pilote Gombe : recherches volontaires et sélection individuelle, collecte terrain/restaurant, enrichissement alimentaire puis publication. Aucun objectif d'exhaustivité Google.
4. Mesurer doublons, coût par référence utile, délai de publication et fraîcheur des prix ; étendre à Limete puis Ngaliema selon capacité éditoriale.
5. Plus tard : claim vérifié, comptes restaurants, soumissions versionnées, API partenaires avec droits explicites ; étudier NokiMenu seulement avec contrat et API disponibles. Vidéos, réservations et commandes restent des domaines futurs séparés. Aucun de ces domaines n'est implémenté ici.

Le principal gain de vitesse est de retrouver et identifier un établissement avant la collecte ; il ne supprime pas le travail nécessaire pour disposer de menus, prix, disponibilités et photos fiables et autorisés.
