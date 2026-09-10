# Menu2Kin Backend

API NestJS intégrable au projet Flutter voisin `../menu2kin`.

**État actuel :** catalogue demo ou PostgreSQL/PostGIS, collecte OSM Kinshasa, parser JSON-LD local pour sources autorisées, dry-run sans écriture, déduplication et saisie admin versionnée. Les routes admin utilisent une clé opérateur serveur ; ne pas embarquer cette clé dans Flutter. Photos/adresses inconnues sont `null`, les plats sans prix restent hors catalogue public.

Voir le [guide V1 exécutable](docs/collection/USAGE.md) et la [recherche des sources, licences et architecture](docs/collection/README.md). Les formulaires dashboard, l’authentification admin multi-utilisateur et les menus complets restent à intégrer.

## Démarrage local

Node.js 22.12+ compatible avec NestJS 12 (validation effectuée avec Node 22.23.1).

```bash
npm ci
npm run start:dev
```

- API : http://localhost:3000/api/v1/dishes
- Swagger : http://localhost:3000/api/docs
- OpenAPI JSON : http://localhost:3000/api/docs-json
- Santé : http://localhost:3000/health

Variables optionnelles : PORT (3000), HOST (0.0.0.0), CORS_ORIGINS (http://localhost:8080). Les fournir au processus ; `.env.example` est un aide-mémoire, le chargement automatique d'un `.env` n'est pas activé.

Flutter sur émulateur Android :

```bash
cd ../menu2kin
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1
```

Sans API_BASE_URL, Flutter garde son mode démo local. Avec cette variable, les échecs réseau sont affichés et ne déclenchent pas de fallback fictif. Le catalogue est connecté ; les actions utilisateur et le calcul budget de l'écran existant restent locaux.

Voir le [guide d'intégration](docs/INTEGRATION-FLUTTER.md) pour téléphone physique, Flutter web, les routes, les formats JSON, les limites et le test HTTP réel.

## Vérifications

```bash
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Jest utilise le mode ESM nécessaire à NestJS 12 sous Node 22. Les tests HTTP ouvrent des ports locaux. Aucune base ni clé de service externe n'est requise pour cette première intégration.

## Architecture cible

Le [dossier d'architecture](docs/architecture/README.md) décrit la cible PostgreSQL/PostGIS/Prisma/Redis, les domaines et contrats futurs. Son OpenAPI de conception est distinct du serveur actuel. Les routes réellement implémentées sont documentées par Swagger et le guide d'intégration.

## Google Places — architecture backend

Voir le [dossier Google Places](docs/google-places/README.md) : frontière des données, contrats admin proposés, provenance, doublons, quotas et sources officielles pour la facturation RDC/hors EEE. Le client NestJS isolé dans `src/google-places/` est testé mais non monté dans AppModule ; aucune route admin Google ni persistance d’import n’est activée.

## OpenStreetMap — source de découverte recommandée

Le [dossier OSM pour Kinshasa](docs/openstreetmap/README.md) décrit la nouvelle cible : extraits régionaux, ingestion locale, attribution ODbL, revue admin et recherche PostGIS. Google reste optionnel. L’import JSON OSM local, la persistance et la proximité sont implémentés et testés ; les routes admin, le lecteur PBF et MapLibre restent à développer.
