# Traçabilité des 44 livrables

Chaque ligne pointe vers le livrable concret ou la décision détaillée. Le statut général reste architecture proposée ; seul l’exemple budget est exécuté isolément.

| N° | Livrable | Artefact / contenu |
|---:|---|---|
| 1 | Architecture globale | [Étape 2 — monolithe modulaire](01-architecture.md) |
| 2 | Diagramme d’architecture | [flowchart Mermaid](01-architecture.md) |
| 3 | Architecture NestJS | [Séparation des modules complexes/simples](01-architecture.md) |
| 4 | Arborescence complète | [Arborescence cible](01-architecture.md) |
| 5 | Modules | [28 fiches de modules](02-modules.md) |
| 6 | Responsabilités | [Responsibility/Dependencies](02-modules.md) |
| 7 | Domain model | [Domaine et états](01-architecture.md) |
| 8 | ERD | [ERD Mermaid](01-architecture.md) |
| 9 | Schéma Prisma complet | [31 modèles, relations/enums/index](database/schema.prisma) |
| 10 | Index PostgreSQL | [Index et maintenance ; SQL adjacent](04-operations.md) |
| 11 | Stratégie PostGIS | [Recherche et géographie ; database/nearby.sql](01-architecture.md) |
| 12 | Stratégie Redis | [Redis et cohérence du cache](04-operations.md) |
| 13 | Stratégie recherche | [FTS/trigram, synonymes, seuils Meili](01-architecture.md) |
| 14 | Algorithme budget | [Exemple exécutable et stratégie SQL dans architecture](examples/budget.ts) |
| 15 | Ranking/trending | [Formule, snapshots et signaux qualifiés](01-architecture.md) |
| 16 | API REST complète | [95 opérations ; OpenAPI importable](03-api.md) |
| 17 | DTOs | [86 schémas requêtes/réponses, validation Nest spécifiée](contracts/openapi.json) |
| 18 | Response format | [Conventions globales et schémas](03-api.md) |
| 19 | Error handling | [Codes, HTTP, erreurs de validation](03-api.md) |
| 20 | Auth architecture | [Authentification, sessions, OTP, Google, MFA](04-operations.md) |
| 21 | RBAC | [Matrice des permissions](04-operations.md) |
| 22 | Admin architecture | [MODULE admin + endpoints admin](02-modules.md) |
| 23 | Review/moderation | [RULE REVIEW/MODERATION/RATINGS](01-architecture.md) |
| 24 | Likes/favorites/shares | [Règles et contraintes SQL](01-architecture.md) |
| 25 | Daily menu | [RULE DAILY_MENU + bornes SQL](01-architecture.md) |
| 26 | Notifications | [Async et notifications](04-operations.md) |
| 27 | Analytics | [Analytics et minimisation](04-operations.md) |
| 28 | Deep links | [Médias et liens publics](04-operations.md) |
| 29 | Media architecture | [Flux Cloudinary signé et confirmation](04-operations.md) |
| 30 | Jobs/queues | [Outbox, BullMQ, retry et DLQ](04-operations.md) |
| 31 | Cache strategy | [Clés, TTL, invalidation, fallback](04-operations.md) |
| 32 | Security architecture | [Identité, HTTP, secrets, permissions](04-operations.md) |
| 33 | Rate limiting | [Quota par endpoint + Redis partagé](03-api.md) |
| 34 | Anti-abuse | [Dédup, burst, signaux qualifiés](04-operations.md) |
| 35 | Observability | [Logs, Sentry, métriques, probes](04-operations.md) |
| 36 | Testing strategy | [Unitaires/intégration/E2E/charge](04-operations.md) |
| 37 | Docker | [Compose et contextes documentés](deployment/Dockerfile) |
| 38 | CI/CD | [release.yml et rollout.sh ; modèles non actifs](deployment/ci.yml) |
| 39 | Environment configuration | [Variables sans vrais secrets](deployment/.env.example) |
| 40 | Seed | [Fixture fictive et stratégie upsert/import](deployment/seed-demo.json) |
| 41 | Migration strategy | [Extensions/core/invariants, expand/backfill/contract](04-operations.md) |
| 42 | Scalability strategy | [Objectifs à mesurer, pool, replicas et index](04-operations.md) |
| 43 | Future evolution | [V2–V7 sans tables prématurées](04-operations.md) |
| 44 | Technical roadmap | [Six lots avec critères de sortie](04-operations.md) |
