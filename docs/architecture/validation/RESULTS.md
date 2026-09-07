# Validation du dossier — 7 septembre 2026

## Contrôles exécutés

| Contrôle | Outil / version | Résultat |
|---|---|---|
| Schéma Prisma (relations, enums, syntaxe, index déclaratifs) | Prisma CLI 7.10.0, Node 22.23.1 | **Valide**, 31 modèles |
| Format Prisma | prisma format | Réussi |
| DDL initial depuis schéma | prisma migrate diff from-empty/to-schema avec config fournie | **Généré**, 31 tables, FK/indexes/enums dans 01-core.sql |
| Concordance noms modèles / CREATE TABLE | Vérification Python | **31/31**, aucun modèle/table manquant |
| OpenAPI 3.1 | Redocly CLI 2.51.2, règles recommended | **Valide, zéro avertissement**, 95 opérations / 86 schémas |
| Références OpenAPI | Vérification composants référencés | Aucune référence manquante |
| Algorithme budget isolé | Node runner node:test, TypeScript strip types | **7 tests réussis**, zéro échec |
| Compose, CI, release | Parsing PyYAML | Syntaxe valide ; ce n'est pas un test d'exécution GitHub/Docker |
| rollout.sh | bash -n | Syntaxe valide ; aucun déploiement lancé |
| Liens locaux Markdown | Résolution des chemins | Vérifiés |

Cas budget exécutés : budget 30 000 pour deux, égalité et dépassement d'un centime, portion collective, quantité arrondie vers le haut, division HALF_UP, précision cents sans flottants, exclusions accompagnement/non-public/portion inconnue, bornes et formats invalides.

## Limites explicites

- PostgreSQL/PostGIS, psql et Docker ne sont pas disponibles dans cet environnement. SQL extensions/invariants et requêtes géographiques **non exécutés** ; index GiST, triggers, CHECK/exclusion, performances et migrations complètes restent à tester sur une vraie base.
- Le schéma valide et son DDL généré ne constituent pas une validation de production ni une preuve de performance.
- Aucune fonctionnalité métier NestJS n'a été ajoutée à src. Auth/catalogue/admin/reviews/jobs/FCM/Cloudinary/Redis sont des contrats et architectures proposés.
- Les 7 tests couvrent l'exemple budget, pas le futur endpoint ni sa requête SQL. Exécution par suppression des types, **sans typecheck TypeScript du backend**. Les tests applicatifs Jest/Supertest restent à implémenter selon la stratégie fournie.
- Dockerfile/Compose/CI/release sont des modèles, non activés ; ils nécessitent scripts package réels, lock, migrations intégrées, probes, secrets et hébergement définis. Aucun build Docker, push d'image ni déploiement effectué.
- Les téléchargements de validation ont utilisé un cache temporaire `/tmp/menu2kin-npm-cache`, sans modifier package.json ni installer de dépendance applicative dans ce dépôt.

## Reproduction

Depuis la racine, après installation locale des CLI aux versions indiquées :

```bash
prisma validate --schema docs/architecture/database/schema.prisma
redocly lint docs/architecture/contracts/openapi.json
node --experimental-strip-types docs/architecture/examples/budget.test.mjs
bash -n docs/architecture/deployment/rollout.sh
```

Pour la génération SQL, voir [database/README.md](../database/README.md). Le premier essai sans datasource explicite échouait ; la configuration Prisma livrée corrige ce problème. Aucune connexion de production n'a été utilisée.
