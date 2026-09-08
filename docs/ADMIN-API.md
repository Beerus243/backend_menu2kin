# Menu2Kin - Dernieres modifications et API admin

Date : 2026-09-08

Ce document decrit les fonctionnalites ajoutees recemment au backend NestJS.

## 1. Dernieres modifications

### Authentification

Le backend expose maintenant une authentification par telephone et mot de passe :

- mot de passe hash avec `scrypt` ;
- access token JWT valable 15 minutes ;
- refresh token opaque valable 30 jours ;
- rotation du refresh token ;
- invalidation lors de la deconnexion.

Endpoints :

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
```

### Import OpenStreetMap

L'import accepte un export JSON Overpass deja obtenu. Le backend ne scrape pas les
sites web des restaurants, ne visite pas les URLs trouvees dans OSM et ne copie
pas automatiquement les photos, menus ou prix.

Les donnees absentes restent vides. Chaque restaurant conserve :

- la reference OSM (`osmType`, `osmId`) ;
- la date du snapshot ;
- la source `OSM` ;
- la licence `ODbL-1.0` ;
- la provenance de chaque information ;
- les coordonnees GPS lorsque disponibles.

### Restaurants editables

Les champs suivants peuvent etre completes manuellement :

- nom ;
- zone/quartier ;
- adresse ;
- telephone ;
- site web ;
- type de cuisine ;
- latitude et longitude ;
- statut editorial ;
- verification par l'equipe.

Les restaurants importes sont crees en `DRAFT`. Ils ne sont pas visibles dans
l'API publique avant publication.

## 2. Configuration locale

Dans un fichier `.env` local :

```env
NODE_ENV=development
CATALOG_SOURCE=postgres
DATABASE_URL=postgresql://menu2kin:local_development_only@127.0.0.1:55432/menu2kin
ADMIN_API_KEY=change-this-local-secret
JWT_SECRET=change-this-jwt-secret
```

Demarrer la base et appliquer les migrations :

```bash
docker compose up -d db
npm run db:migrate
npm run start:dev
```

La cle admin doit etre envoyee avec chaque endpoint admin :

```http
x-admin-key: change-this-local-secret
```

> `x-admin-key` est une protection temporaire de developpement. Avant toute
> exposition Internet, elle doit etre remplacee par JWT, RBAC, MFA et audit.

## 3. Endpoints admin

Toutes les routes ci-dessous utilisent le prefixe :

```text
/api/v1
```

### 3.1 Importer un export OSM

```http
POST /api/v1/admin/osm/imports
```

Headers :

```http
Content-Type: application/json
x-admin-key: $ADMIN_API_KEY
```

Body :

```json
{
  "payload": {
    "version": 0.6,
    "generator": "Overpass API",
    "elements": [
      {
        "type": "node",
        "id": 123456789,
        "version": 4,
        "lat": -4.321,
        "lon": 15.301,
        "tags": {
          "amenity": "restaurant",
          "name": "Restaurant Exemple",
          "addr:street": "Avenue Exemple",
          "addr:city": "Kinshasa",
          "cuisine": "congolese;grill"
        }
      }
    ]
  },
  "actor": "admin-menu2kin",
  "area": "Gombe",
  "snapshotAt": "2026-09-08T08:00:00Z",
  "bbox": [15.25, -4.35, 15.35, -4.25]
}
```

Contraintes principales :

- maximum 100 candidats par import ;
- fichier/export limite a 5 Mo pour la commande CLI ;
- bbox maximum de 0.5 degre ;
- `snapshotAt` doit etre une date UTC passee ;
- seuls `restaurant`, `fast_food` et `cafe` sont retenus ;
- les doublons probables sont envoyes en revue ;
- aucune fusion automatique ;
- les points approximatifs restent a verifier.

Resultat indicatif :

```json
{
  "replayed": false,
  "result": {
    "total": 1,
    "created": 1,
    "items": [
      {
        "source": "node/123456789",
        "outcome": "DRAFT_CREATED",
        "restaurantId": "uuid-du-restaurant"
      }
    ]
  }
}
```

Valeurs possibles de `outcome` :

- `DRAFT_CREATED` : brouillon cree ;
- `EXACT_MATCH` : element OSM deja lie ;
- `NEEDS_DATA` : informations indispensables absentes ;
- `NEEDS_REVIEW` : doublon ou qualite a verifier ;
- `OUTSIDE_ZONE` : point hors bbox ;
- `STALE_SOURCE` : snapshot OSM plus ancien.

### 3.2 Lister les restaurants admin

```http
GET /api/v1/admin/restaurants
```

Exemples :

```text
GET /api/v1/admin/restaurants?status=DRAFT
GET /api/v1/admin/restaurants?status=PUBLISHED&limit=50&offset=0
```

Parametres :

| Parametre | Valeurs | Defaut |
|---|---|---:|
| `status` | `DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `HIDDEN`, `ARCHIVED` | tous |
| `limit` | 1 a 100 | 20 |
| `offset` | 0 a 10000 | 0 |

### 3.3 Lire un restaurant admin

```http
GET /api/v1/admin/restaurants/:id
```

Cette route retourne aussi les derniers enregistrements OSM lies au restaurant,
y compris la date du snapshot et la provenance conservee.

### 3.4 Modifier un restaurant

```http
PATCH /api/v1/admin/restaurants/:id
```

Exemple :

```json
{
  "name": "Restaurant Chez Mama",
  "area": "Gombe",
  "address": "12, Avenue de la Paix, Kinshasa",
  "phone": "+243812345678",
  "website": "https://restaurant.example.cd",
  "cuisine": ["congolaise", "grillades"],
  "latitude": -4.321,
  "longitude": 15.301,
  "verified": true
}
```

Regles :

- latitude et longitude doivent etre envoyees ensemble ;
- latitude doit etre comprise entre -90 et 90 ;
- longitude doit etre comprise entre -180 et 180 ;
- les URLs doivent utiliser `http` ou `https` ;
- les modifications manuelles sont marquees `TEAM` dans la provenance ;
- les champs non fournis ne sont pas effaces ;
- les prix, menus, plats et photos ne sont pas geres par cette route.

Pour effacer un champ optionnel :

```json
{
  "phone": null,
  "website": null
}
```

### 3.5 Publier un restaurant

```http
POST /api/v1/admin/restaurants/:id/publish
```

La publication :

- exige un nom ;
- exige une adresse ;
- passe le restaurant a `PUBLISHED` ;
- le marque `verified: true` ;
- incremente la version ;
- le rend eligible aux endpoints publics PostgreSQL.

Exemple :

```bash
curl -X POST \
  -H "x-admin-key: $ADMIN_API_KEY" \
  http://localhost:3000/api/v1/admin/restaurants/RESTAURANT_UUID/publish
```

## 4. Exemple de workflow complet

1. Recuperer un export Overpass avec les restaurants de la zone choisie.
2. Conserver la date du snapshot et l'attribution OpenStreetMap.
3. Importer l'export avec `POST /admin/osm/imports`.
4. Lister les brouillons avec `GET /admin/restaurants?status=DRAFT`.
5. Examiner les doublons et les points approximatifs.
6. Completer manuellement les informations connues.
7. Ajouter plus tard le menu, les plats, les prix et les photos.
8. Publier uniquement les restaurants verifies.
9. Afficher `© OpenStreetMap contributors` dans les experiences utilisant les donnees OSM.

## 5. Ce qui n'est pas encore disponible

Ces endpoints ne sont pas encore implementes :

- creation/modification des menus ;
- creation/modification des plats ;
- ajout des prix ;
- upload et association des photos Cloudinary ;
- interface dashboard admin ;
- RBAC admin complet ;
- MFA admin ;
- import PBF automatique ;
- jobs d'import en arriere-plan ;
- mise a jour automatique des restaurants OSM.

La prochaine tranche doit ajouter les endpoints admin `menus`, `menu-categories`,
`dishes` et `media`, afin de completer manuellement chaque fiche depuis le
dashboard.

## 6. Verification

Commandes validees apres ces modifications :

```bash
npm run lint
npm run typecheck
npm run build
npm test -- --runInBand
npx prisma validate
```

Resultat actuel : build, lint, typecheck et validation Prisma reussis ; 39 tests
Jest passent.
