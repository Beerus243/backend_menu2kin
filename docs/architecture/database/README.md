# Schéma et SQL — architecture proposée

Schéma validé et DDL généré avec **Prisma CLI 7.10.0**, Node 22.23.1. Aucun de ces SQL n'a été exécuté sur PostgreSQL dans cette session.

Ordre d'intégration sur une base vierge :

1. `00-extensions.sql` : PostGIS, pg_trgm, unaccent, btree_gist, via rôle migration.
2. `01-core.sql` : DDL généré depuis schema.prisma, 31 tables, enums, FK/index uniques.
3. `02-invariants.sql` : geography synchronisée/NOT NULL/GiST, contraintes CHECK/exclusion, documents de recherche, audit append-only.

Copier chaque fichier dans une migration Prisma ordonnée avec migration_lock.toml `provider = "postgresql"`. Les fichiers ne sont pas des scripts réexécutables arbitrairement : suivi d'exécution par migrate deploy. Avant production : vrai test de création vierge et de migration upgrade, transactions explicites par migration initiale, sauvegarde et permissions DB minimales. Le rôle runtime n'a pas les droits DDL/TRUNCATE.

`prisma.config.ts` est proposé pour Prisma 7. Dans le dossier actuel, schema et migrations sont relatifs à ce fichier. À la racine finale, remplacer par `schema: 'prisma/schema.prisma'` et `migrations.path: 'prisma/migrations'`. Le client généré cible `../src/generated/prisma` relativement au schéma ; ainsi le schéma final dans prisma génère sous src et le build Nest inclut le client. L'application utilisera `@prisma/client`, `@prisma/adapter-pg`, `pg` et le client généré, versions compatibles verrouillées ; le CLI migration utilise DIRECT_DATABASE_URL.

Commandes de conception (depuis la racine, CLI installé) :

```bash
prisma validate --schema docs/architecture/database/schema.prisma
prisma migrate diff --from-empty --to-schema docs/architecture/database/schema.prisma --config docs/architecture/database/prisma.config.ts --script --output docs/architecture/database/01-core.sql
```

La deuxième commande nécessite DATABASE_URL ou DIRECT_DATABASE_URL configurée ; from-empty/to-schema génère le DDL sans ouvrir de connexion. Une URL locale fictive a suffi lors de la validation. Le CLI sans config échouait avec `--datasource <JSON>` manquant ; la configuration fournie résout ce point.

Attention aux éléments gérés par SQL : `location` nullable dans Prisma pour permettre insert Client, NOT NULL côté SQL avec trigger ; search_text/search_vector ajoutés hors schéma ; index spécialisés, CHECK et exclusion non représentés intégralement. Ne pas accepter automatiquement un futur diff/introspection qui effacerait ces éléments. En équipe, conserver ces SQL comme source versionnée et ajouter des tests pg_catalog et d'insertion aux migrations. L'usage d'Unsupported est une décision explicite, pas une prétention de support natif des requêtes géographiques Prisma.

`nearby.sql` est une requête paramétrée d'exemple, sans pagination complète ; la spécification de pagination API se trouve dans 03-api.md. Pas de concaténation de coordonnées ou filtre utilisateur dans SQL.

Les UUID `@default(uuid())` et `@updatedAt` sont générés par Prisma, pas tous par PostgreSQL : les écritures raw SQL doivent fournir UUID/timestamps requis et incrémenter version selon le service métier. Tous les montants saisis sont validés AVANT l'écriture NUMERIC pour éviter un arrondi implicite du SGBD.
