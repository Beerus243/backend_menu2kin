> **État actuel du code :** une première API mobile de démonstration a été implémentée après ce dossier. Voir [le contrat réellement disponible](../INTEGRATION-FLUTTER.md). Les indications ci-dessous décrivent le livrable d’architecture initial, pas toutes les fonctionnalités du serveur actuel.

# Menu2Kin — dossier d'architecture backend V1

Statut : **ARCHITECTURE PROPOSÉE**, 7 septembre 2026. Aucun endpoint métier n'est implémenté par ce dossier. Le dépôt conserve son squelette NestJS. Les SQL, schéma et configurations sont des artefacts de conception à intégrer et tester avant production. Aucun frontend n'est conçu.

**CODE PRODUCTION :** aucun nouveau service métier revendiqué. **CODE EXEMPLE :** calcul budget isolé et testé. **FUTURE FEATURE :** V2–V7 décrites sans implémentation.

Lire dans cet ordre :

1. [Décisions et architecture](01-architecture.md) : challenge produit, domaines, ERD, algorithmes, invariants et arbitrages.
2. [Catalogue des modules](02-modules.md) : responsabilités, dépendances, DTOs, sécurité et tests de chaque module.
3. [Contrat REST](03-api.md) : conventions, structures exactes, endpoints publics, personnels et admin.
4. [Exploitation et livraison](04-operations.md) : sécurité, cache, jobs, monitoring, tests, migration, seed et feuille de route.
5. [Schéma Prisma complet](database/schema.prisma), [extensions](database/00-extensions.sql), [DDL initial généré](database/01-core.sql), [configuration Prisma](database/prisma.config.ts), [invariants et index SQL](database/02-invariants.sql), [requête géographique](database/nearby.sql).
6. [OpenAPI](contracts/openapi.json) : contrat de conception importable, sans serveur métier associé.
7. [Budget TypeScript](examples/budget.ts) et son test : exemple exécutable isolé, pas un service branché à NestJS.
8. [Dockerfile](deployment/Dockerfile), [Compose](deployment/compose.yaml), [CI](deployment/ci.yml), [variables](deployment/.env.example) : modèles d'intégration, activation après les prérequis documentés.
9. [Validation effectuée](validation/RESULTS.md) et [traçabilité des 44 livrables](05-coverage.md).

Les noms du schéma constituent le vocabulaire canonique. SearchEvent, ViewEvent et InteractionEvent sont des variantes typées de `AnalyticsEvent`, sans trois tables concurrentes. `Device` remplit le rôle de DeviceToken. `AdminUser` est un profil RBAC rattaché à User, sans second système de mots de passe. Les futures commandes/paiements/livraisons n'ont aucune table V1.
