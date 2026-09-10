> Document de la première tranche. Pour la collecte Kinshasa, les champs nullables et les routes admin désormais actives, suivre le [guide V1](collection/USAGE.md).

# Première intégration OSM persistante

L'application supporte désormais deux sources explicites : `CATALOG_SOURCE=demo` pour les fixtures existantes, ou `postgres` pour le catalogue PostgreSQL. En mode postgres, aucun fallback fictif. Les formats Dish/Restaurant existants sont conservés ; les restaurants ajoutent coordonnées/adresse, les métadonnées indiquent la source et l'attribution OSM.

## Démarrer la base de développement

Prérequis : Node compatible avec les dépendances du projet, npm et Docker Compose (ou Podman Compose). La base PostGIS est liée uniquement à localhost ; les identifiants ci-dessous sont exclusivement locaux.

```bash
npm ci
docker compose up -d db
export DATABASE_URL='postgresql://menu2kin:local_development_only@127.0.0.1:55432/menu2kin'
npm run db:migrate
npm run build
CATALOG_SOURCE=postgres npm run start:prod
```

Les variables sont fournies au processus ; le projet ne charge pas automatiquement `.env`. Le démarrage Postgres vérifie connexion et PostGIS. Les migrations sont explicites, jamais déclenchées au démarrage de l'API. Sans restaurants vérifiés et publiés, l'API publique renvoie une liste vide.

Le schéma actif se trouve dans `prisma/schema.prisma` : Restaurant, Dish (contrat mobile initial), OsmRecord et OsmImportRun. Il constitue une étape incrémentale ; les 31 modèles du dossier d'architecture général ne sont pas tous installés. Menus complets, comptes/avis et commandes éditoriales arriveront par migrations suivantes, pas en exécutant les SQL proposés en bloc sur cette base.

## Import local OSM

Cette première version accepte un fichier **JSON Overpass déjà exporté**, de 5 Mo maximum et 100 candidats alimentaires maximum. Elle n'appelle ni Overpass, ni Nominatim, ni Google. Le lecteur PBF et les jobs de grande taille restent à implémenter. Ne pas fournir un PBF à cette commande.

Validation seule (ne se connecte pas à la base) :

```bash
npm run osm:import -- --file test/fixtures/osm-synthetic.json --actor developpeur --area 'Zone de test' --snapshot-at 2026-09-07T00:00:00Z --bbox=15.25,-4.35,15.35,-4.25
```

Pour écrire, ajouter explicitement `--apply` avec DATABASE_URL défini :

```bash
npm run osm:import -- --file test/fixtures/osm-synthetic.json --actor developpeur --area 'Zone de test' --snapshot-at 2026-09-07T00:00:00Z --bbox=15.25,-4.35,15.35,-4.25 --apply
```

**Le fichier d'exemple est fictif** : ne pas publier ses fiches. Pour une vraie collecte, utiliser une sélection exportée avec attribution/licence OSM et la date du snapshot. La bbox est une zone éditoriale fournie par l'opérateur, dimensions maximales 0.5 degré ; ce n'est pas une validation de limite administrative Kinshasa/commune. Les polygones locaux vérifiés restent une étape ultérieure. L'argument area nomme cette zone et sa provenance l'indique.

Résultats par objet : DRAFT_CREATED, EXACT_MATCH, NEEDS_DATA, NEEDS_REVIEW, OUTSIDE_ZONE ou STALE_SOURCE. UUID interne distinct de `(osmType,osmId)`. Les champs absents ne sont pas inventés. Les centres approximatifs ways/relations et indices de fermeture restent en revue. Les données source utiles sont conservées ; photos et menus ne sont pas copiés.

Le même contenu normalisé et les mêmes options rejouent le résultat audité. Une contrainte unique et un verrou transactionnel commun protègent les imports concurrents. Le contrôle probable recherche proximité et similarité de nom ; les rapprochements téléphone/site et décisions de liaison humaines restent à étendre. Aucune fusion automatique. Les imports de versions plus anciennes sont ignorés ; les fiches déjà liées ne sont pas écrasées par une nouvelle source.

L'import complet (100 objets au plus) est atomique : erreurs de transaction = aucune création partielle. Les champs manquants/probables produisent des résultats métier explicites et peuvent être conservés en staging. Si le serveur commet mais la réponse CLI est perdue, rejouer la même commande retrouve son résultat.

## Lecture et proximité

```text
GET /api/v1/restaurants
GET /api/v1/restaurants/:id
GET /api/v1/restaurants/nearby?lat=-4.31&lon=15.30&radiusMeters=2000
GET /api/v1/dishes
GET /api/v1/restaurants/:id/dishes
POST /api/v1/budget/search
```

Public : uniquement restaurants PUBLISHED et verified=true ; plats PUBLISHED de ces restaurants. Les brouillons restent invisibles. Proximité en mètres à vol d'oiseau via ST_DWithin et GiST, résultat borné, stable par distance/id. Les coordonnées sont stockées avec un trigger garantissant la cohérence du point PostGIS. En mode demo, nearby répond 503 plutôt que d'inventer des distances.

Les montants du contrat mobile restent des FC entiers, avec `priceCdf` à deux décimales. Les notes/likes sont à zéro tant que le domaine avis/interactions n'est pas raccordé. La recherche PostgreSQL initiale gère les tokens et synonymes existants mais ne prétend pas fournir un moteur de pertinence complet.

## Accès et publication

L'import CLI reste une commande privilégiée réservée à l'opérateur ayant accès au serveur et aux credentials DB. `--actor` sert la traçabilité déclarative, **pas une authentification**. L'API admin minimale ci-dessous exige une clé dédiée, mais cette clé n'est pas encore un vrai système JWT/RBAC/MFA. La revue avancée, l'ajout de menus/plats/prix, la correction des candidats et l'export ODbL restent nécessaires avant un parcours éditorial complet.

### Première API admin de collecte

Le backend expose maintenant un workflow minimal pour le dashboard interne lorsque
`CATALOG_SOURCE=postgres` :

```text
POST  /api/v1/admin/osm/imports
GET   /api/v1/admin/restaurants?status=DRAFT
GET   /api/v1/admin/restaurants/:id
PATCH /api/v1/admin/restaurants/:id
POST  /api/v1/admin/restaurants/:id/publish
```

Ces routes exigent `x-admin-key: $ADMIN_API_KEY`. Cette clé est uniquement un
pont de développement ; elle devra être remplacée par JWT + RBAC + MFA avant
une exposition réseau ou une mise en production.

Le corps de l'import contient un export JSON Overpass déjà obtenu, l'acteur,
la zone éditoriale, la date du snapshot UTC et une bbox limitée. L'API ne
contacte aucun site tiers, ne visite pas les URLs `website` OSM et ne copie
aucune photo ou menu. Les restaurants sont créés en `DRAFT` avec coordonnées,
nom, adresse, téléphone/site/cuisine seulement lorsqu'ils existent dans OSM,
et une provenance `ODbL-1.0`. Les champs manquants restent vides.

L'édition manuelle permet de compléter l'adresse, le téléphone, le site, la
cuisine et les coordonnées. Les prix, photos, menus et plats restent une
étape éditoriale séparée : aucune donnée inventée n'est publiée. La route de
publication vérifie au minimum le nom et l'adresse, conserve le lien OSM et
marque explicitement le restaurant comme vérifié par l'équipe.

La base locale supporte la publication pour tester ses filtres ; aucune commande publique ne permet de contourner la revue. Avant de diffuser des données dérivées OSM, réaliser l'attribution côté consommateur et le mécanisme d'export décrit dans le [dossier licence](openstreetmap/compliance.md). Le backend renvoie les mentions mais cela ne les affiche pas automatiquement dans Flutter.

## Installation reproductible et tests

Le lockfile utilise le mode `legacy-peer-deps` enregistré dans `.npmrc` : `npm ci` le reprend. Les versions corrigées deepmerge-ts et mysql2 sont imposées uniquement dans l’arbre de la CLI Prisma ; génération, migration et compilation ont été vérifiées avec ces overrides. Le client est généré avant build/typecheck/tests et n’est pas commité.

```bash
npm run lint
npm run typecheck
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

La suite DB exige une base dédiée dont le nom finit par `_test`, migrations déjà appliquées :

```bash
DATABASE_URL='postgresql://utilisateur:mot_de_passe@127.0.0.1:port/menu2kin_test' npm run test:integration
```

Elle crée uniquement des fixtures et supprime ses propres enregistrements ; ne pas la lancer sur une base de production. La base de test utilisée pendant l’intégration est séparée de celle du compose de développement.

## Résultat des vérifications du 7 septembre 2026

- Deux migrations appliquées avec succès sur PostgreSQL 17 / PostGIS 3.5 isolé.
- 39 tests unitaires + 21 tests HTTP du catalogue démo + 11 tests d’intégration PostgreSQL/PostGIS réussis (**71 tests**).
- Compilation, typage (tests inclus), lint et vérification à blanc de `npm ci` réussis.
- Audit npm après correction des dépendances : zéro vulnérabilité signalée.
- CLI compilée exécutée en validation seule puis avec écriture sur la base temporaire : 1 DRAFT_CREATED et 1 NEEDS_DATA sur le fichier fictif.
- Le conteneur temporaire et ses données de test sont supprimés après validation. Aucune base existante de l’utilisateur n’a été migrée ; le compose de développement est fourni pour démarrer sa propre base.

Ces contrôles valident cette première tranche, pas l’ensemble des workflows éditoriaux de l’architecture cible.
