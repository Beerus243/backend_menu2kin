# API NestJS ↔ Flutter : intégration initiale

Le backend expose un **catalogue de démonstration en lecture**, issu des huit fixtures Flutter. Aucune base PostgreSQL n'est encore raccordée. Les restaurants/prix/notes sont fictifs ; `meta.source="demo"` le signale. Le démarrage avec NODE_ENV=production est refusé tant que ce catalogue n'est pas remplacé.

## Démarrer

Backend, depuis backend_menu2kin :

```bash
npm ci
npm run start:dev
```

API : `http://localhost:3000/api/v1`. Swagger réel : `http://localhost:3000/api/docs` ; JSON : `/api/docs-json`. Sonde : `/health`. HOST vaut 0.0.0.0 et PORT 3000 par défaut. CORS autorise `http://localhost:8080` ; plusieurs origines explicites via `CORS_ORIGINS` séparées par virgule.

Flutter, depuis le projet voisin menu2kin :

```bash
# Émulateur Android : le poste hôte est accessible à 10.0.2.2
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# Flutter desktop / simulateur iOS sur le même poste
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1

# Flutter web avec origine CORS locale fixée
flutter run -d chrome --web-port=8080 --dart-define=API_BASE_URL=http://localhost:3000/api/v1
```

Sur un téléphone physique : employer l'adresse IP LAN du poste, même réseau, port 3000 accessible. Le manifeste Android debug autorise HTTP local ; release exige HTTPS côté configuration Dart. La permission INTERNET est déclarée pour l'application Android. Les restrictions iOS/macOS de transport ou de sandbox peuvent nécessiter une configuration locale selon la cible ; seul le chemin Dart HTTP a été testé ici, pas un lancement sur chaque appareil.

Sans API_BASE_URL : mode démo local existant conservé. Avec API_BASE_URL : RemoteCatalogRepository lit l'API ; aucune erreur réseau n'est remplacée par des fixtures. Redémarrer/recompiler après modification d'un dart-define. Ne pas ajouter `/dishes` dans l'URL de base : le client ajoute le chemin relatif et conserve `/api/v1`.

## Routes implémentées

| Méthode | Chemin sous /api/v1 | Fonction |
|---|---|---|
| GET | /dishes | Catalogue paginé, filtres |
| GET | /dishes/:id | Détail d'un plat |
| GET | /restaurants | Restaurants issus du catalogue |
| GET | /restaurants/:id | Détail minimal |
| GET | /restaurants/:id/dishes | Plats de l'établissement |
| GET | /categories | Catégories présentes |
| GET | /areas | Quartiers/communes de la démo |
| GET | /search | Recherche de plats avec texte restaurant/quartier |
| POST | /budget/search | Quantités d'un plat selon portions et budget |

Filtres dishes/search : q (120 caractères), category, area, restaurantId, maxPrice (FC entiers), available=true|false. Tous les endpoints paginés acceptent limit 1..50 (20 par défaut), offset 0..1000 (0 par défaut). Ordre stable des fixtures ; pas de promesse de cursor snapshot d'une base vivante. Filtres/params inconnus rejetés, booléens stricts, valeurs invalides HTTP 400.

```json
{
  "data": [
    {
      "id": "poulet-braise",
      "name": "Poulet braisé",
      "category": "Poulet",
      "price": 12000,
      "priceCdf": "12000.00",
      "currency": "CDF",
      "restaurantId": "chez-mama-rose",
      "restaurant": "Chez Mama Rose",
      "area": "Bandalungwa",
      "image": "chicken",
      "description": "Description de démonstration",
      "servings": 1,
      "available": true,
      "open": true,
      "daily": true,
      "rating": 4.9,
      "reviewCount": 63,
      "likes": 186
    }
  ],
  "meta": { "source": "demo", "offset": 0, "limit": 20, "hasNextPage": false, "nextOffset": null }
}
```

Le modèle Flutter actuel attend `price` entier FC, restaurant et category sous forme de texte, image sous forme de clé asset locale. Ces champs sont maintenus pour permettre l'intégration immédiate ; `priceCdf` est la chaîne monétaire canonique. Aucun calcul monétaire flottant : prix fixtures FC entiers, calcul budget en centimes BigInt, HALF_UP pour prix/personne. Le DTO mobile n'accepte pas encore les fractions de FC. Changer cela nécessitera d'adapter le modèle Dart avant d'introduire des prix fractionnaires.

Flutter lit toutes les pages jusqu'à hasNextPage=false (borne offset 1000) pour alimenter ses écrans existants. Ce choix convient à la démo ; un catalogue important nécessitera pagination et recherche serveur à la demande dans le mobile. Une pagination incohérente ou dépassant la borne est refusée, jamais masquée par une liste partielle présentée comme complète.

Budget : POST JSON `{"budget":30000,"people":2,"area":"Bandalungwa"}`. Réponse paginée avec items contenant dish/quantity/unitPrice/lineTotal, total/remainingBudget/pricePerPerson en strings à deux décimales. Exemple poulet : quantity=2, total="24000.00", remainingBudget="6000.00". people 1..20, budget 1..10000000 FC entiers. Plats fermés, indisponibles, desserts et portions inconnues exclus ; V1 répète un même plat, pas de combinaison avancée. Le calcul budget existant dans les écrans Flutter reste local et propose aussi certaines combinaisons : l'API budget est prête à consommer, mais ce parcours n'a pas encore été basculé vers cet endpoint.

Erreur : `{"error":{"code":"RESOURCE_NOT_FOUND","message":"Plat introuvable","details":[],"requestId":"UUID"}}`. Validation : code VALIDATION_ERROR, details liste des messages de champs. Swagger décrit les DTOs et enveloppes réelles. En-têtes Helmet, CORS allowlist, requestId généré, no-store et limite corps JSON 64 KiB. Pas d'authentification ni de protection distribuée anti-abuse dans cette démo ; aucune écriture utilisateur n'est exposée.

## Tests

```bash
# Backend
npm run typecheck
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand

# Flutter, depuis ../menu2kin
flutter test --no-pub

# NestJS doit tourner sur le port 3000 pour ce test HTTP réel
flutter test --no-pub test/live_api_test.dart --dart-define=RUN_API_TESTS=true --dart-define=API_BASE_URL=http://127.0.0.1:3000/api/v1
```

Le test live est ignoré dans la suite Flutter normale ; il ne doit pas donner un faux succès quand aucune API n'est lancée. Il vérifie que les fixtures HTTP NestJS sont réellement désérialisées par RemoteCatalogRepository et Dish.fromJson.

## Écart explicite avec l'architecture cible

Le dossier architecture décrit la cible complète ; son OpenAPI 95 opérations **n'est pas le contrat du serveur actuel**. La source fiable du serveur implémenté est `/api/docs-json`. Cette livraison est un contrat d'intégration mobile 0.1 : IDs slugs hérités du prototype, réponses plates, offset, taxonomies textuelles et fixtures en mémoire. Avant mise en service : PostgreSQL/PostGIS/Prisma, UUID stables avec compatibilité des liens, modèle média réel, DTO catalogue cible et adaptateur Flutter, auth/session, écriture likes/favoris/avis persistée, menus du jour datés et jobs. Les actions personnelles du prototype restent locales ; elles ne sont pas synchronisées par cette livraison.

## Validation de cette livraison

- Backend : lint, Prettier, typage application/tests et build réussis ; 1 test unitaire et 21 tests HTTP réussis.
- Flutter : 17 tests réussis dans la suite locale, test live ignoré par défaut ; test live lancé séparément et réussi contre NestJS sur localhost:3000.
- Audit npm après retrait des plugins inutilisés @nestjs/mau et @nestjs/observe : zéro vulnérabilité signalée au moment du contrôle. Lockfile fourni pour installations reproductibles.
- Pas de test sur téléphone/émulateur réel, pas de base de données ni de déploiement. Le serveur temporaire de validation a été arrêté ; le démarrer avec npm run start:dev pour utiliser l'application connectée.
