# Exécuter la V1 et compléter les restaurants

## Collecte déjà réalisée sur cette machine

Le 10 septembre 2026, le snapshot OSM `2026-09-10T16:43:20Z` a donné :

| Résultat | Nombre |
|---|---:|
| Sources OSM conservées | 316 |
| Restaurants créés en DRAFT | 249 |
| Doublons possibles laissés en revue, aucune fusion | 22 |
| Candidats sans nom, à compléter | 45 |
| Restaurants vérifiés / publiés | 0 |
| Plats / prix / photos importés | 0 |

150 des 249 brouillons n'ont pas d'adresse renseignée. Les centres de ways sont approximatifs ; contrôler le GPS sur le terrain avant vérification. Ces chiffres ne mesurent pas la totalité des restaurants de Kinshasa. Attribution : [© OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright).

Conteneur local dédié **menu2kin-collection-db**, volume persistant **menu2kin_collection_data**, port localhost **55439**, base **menu2kin_collection**. La base **menu2kin_test** du même conteneur sert uniquement aux fixtures de tests. Aucune base préexistante n'a été modifiée. Redémarrage : `podman start menu2kin-collection-db`.

La configuration locale `.env.collection.local` contient une clé admin générée aléatoirement ; elle est ignorée par Git, permissions 0600. Elle est propre à cette machine. Le backend ne charge pas automatiquement les fichiers env :

```bash
npm run build
node --env-file=.env.collection.local dist/main.js
```

API : http://localhost:3000/api/v1 ; Swagger : http://localhost:3000/api/docs. Le serveur reste lié à localhost dans cette configuration. L'API publique masque tous ces brouillons ; utiliser les routes admin pour les examiner. Un téléphone physique nécessitera une configuration réseau de développement adaptée.

Vérifier les comptes ou rejouer sans réseau :

```bash
node --env-file=.env.collection.local dist/ingestion/cli/quality-check.js
node --env-file=.env.collection.local dist/ingestion/cli/import-osm.js --area=kinshasa --offline --dry-run
```

Le cache réel se trouve dans `data/osm/kinshasa.json`, ignoré par Git. Ne pas confondre ce cache avec les fixtures fictives versionnées. Le rejeu `--apply` du même import a été vérifié : `replayed: true`, toujours 249 brouillons. Les compteurs d'un rejeu décrivent le **résultat original**, pas de nouvelles créations.

## Démarrer sur une autre machine

Prérequis : Node 22.12+, npm, PostgreSQL/PostGIS local ou Docker Engine/Podman. Aucun compte payant requis. Le Compose existant utilise le port 55432, distinct de la collecte ci-dessus.

```bash
npm ci
docker compose up -d db
export DATABASE_URL='postgresql://menu2kin:local_development_only@127.0.0.1:55432/menu2kin'
npm run db:migrate
npm run build
npm run import:osm -- --area=kinshasa --dry-run
npm run import:osm -- --area=kinshasa --apply
npm run quality:check
```

**L'écriture exige `--apply`. Sans option, l'import simule.** Même le dry-run nécessite une base migrée : il vérifie les doublons existants dans une transaction PostgreSQL READ ONLY. Il peut écrire le cache local et les logs, jamais les tables. L'ancienne commande `osm:import` est conservée pour compatibilité ; utiliser désormais `import:osm` pour la collecte et le vrai dry-run SQL.

Zones prédéfinies : kinshasa, gombe, limete, ngaliema, kintambo, bandalungwa, lemba. Les communes doivent correspondre à une seule relation administrative OSM : sinon l'import échoue, sans choisir une zone au hasard. La couverture de ces communes n'a pas été mesurée individuellement dans cette session.

Un export local peut remplacer la requête : `--file /chemin/export.json --snapshot-at 2026-09-10T16:43:20Z --bbox 15,-5,17,-3`. Le fichier doit être un JSON Overpass complet, pas un PBF ; ordre bbox ouest,sud,est,nord. La zone d'import est une étiquette éditoriale, pas une commune devinée. `--offline` requiert le cache existant ; aucune nouvelle requête. `--actor` identifie l'opérateur CLI.

Une requête active par cache local, au moins 60 secondes entre collectes, cache 24 h, timeout HTTP 45 s, 3 tentatives maximum, backoff 10 puis 20 s augmenté selon Retry-After ; une attente demandée de plus de 60 s arrête l'opération à relancer plus tard. Refus des réponses partielles et >5 Mio, maximum 1 000 POI par import. Le verrou `.collector.lock` n'est pas effacé automatiquement après crash : vérifier qu'aucun collecteur ne tourne avant de retirer un verrou orphelin. Déployer plusieurs machines demanderait une coordination partagée supplémentaire.

## Endpoints de saisie et de validation

Toutes les routes ci-dessous sont sous `/api/v1/admin` avec `x-admin-key: <ADMIN_API_KEY>`. Clé serveur d'au moins 32 caractères ; absente/faible ⇒ accès fermé. Générer avec `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Ne pas ajouter ce secret au code Flutter, au bundle JavaScript du dashboard ni à Git : passer par le serveur du dashboard et une session admin. V1 = opérateur local unique, pas encore RBAC multi-utilisateur. Limite globale par processus : 100 requêtes admin authentifiées/minute.

| Méthode / route | Fonction |
|---|---|
| POST `/osm/imports` | JSON Overpass + area, snapshotAt, bbox ; dryRun=true par défaut |
| GET `/osm/candidates?limit=20&offset=0` | Sources, coordonnées, qualité et restaurant lié ; osmId chaîne décimale |
| POST `/osm/candidates/:id/link` | Lier explicitement un candidat à un restaurant existant : `{restaurantId}` ; aucun champ copié, aucune fusion |
| POST `/websites/imports` | HTML local fourni dans le corps + sourceKey, sourceUrl, area ; dryRun=true |
| GET `/websites/candidates` | Sources web enregistrées |
| GET `/restaurants?status=DRAFT&limit=20&offset=0` | Brouillons et score de complétude |
| POST `/restaurants` | Créer manuellement nom, zone, GPS et evidenceRef ; adresse/contact facultatifs |
| GET `/restaurants/:id` | Fiche avec provenance et sources |
| PATCH `/restaurants/:id` | Correction avec expectedVersion ; adresse, téléphone, site, photo, horaires, cuisine, GPS, open, vérification |
| POST `/restaurants/:id/publish` | expectedVersion ; exige vérification humaine préalable |
| GET/POST `/restaurants/:id/dishes` | Consulter/créer des plats brouillons, prix et photo facultatifs |
| PATCH `/dishes/:id` | expectedVersion ; compléter prix CDF entier, image, description, portions, available/daily et statut |

Exemple de création restaurant (données fictives à remplacer) :

```json
{"name":"Nom relevé sur place","area":"Gombe","latitude":-4.31,"longitude":15.3,"evidenceRef":"fiche-terrain-001"}
```

Pour vérifier après contrôle humain : `PATCH {"expectedVersion":1,"verified":true,"evidenceRef":"controle-gps-001"}`, puis `POST .../publish {"expectedVersion":2}`. Une édition sensible invalide la vérification précédente sauf nouvelle attestation explicite. Un conflit de version retourne 409 : recharger la fiche. Un doublon de création retourne 409 et candidateIds ; examiner puis lier la source si c'est bien le même établissement. Une chaîne similaire ne prouve pas un doublon.

Un plat créé sans prix/image conserve `null`. Publier un plat exige un prix et un restaurant vérifié publié ; aucune photo obligatoire. Une photo fournie exige `imageRightsRef` pour le plat, `evidenceRef` pour le restaurant. Ces références enregistrent l'attestation de l'opérateur, elles ne valident pas automatiquement une licence. Les URLs médias ne sont pas téléchargées. Pas de téléversement de fichiers livré ici.

Limite HTTP globale existante : **64 Kio**, y compris JSON échappé. Pour un snapshot entier de Kinshasa, utiliser la CLI (5 Mio). Les statuts publics restent filtrés ; un client Flutter doit gérer `address`, `photo` et `image` nullables. La recherche de budget exclut les plats sans prix. Les formulaires du dashboard et les adaptations visuelles Flutter ne sont pas modifiés dans cette tranche.

## Parser JSON-LD autorisé

Le registre `config/website-sources.json` est vide par défaut. Copier le modèle `.example.json`, renseigner une preuve réelle, une licence/permission, origin/pathPrefix, droits store/display/commercial et une revue datée de moins de 90 jours. `approved:false`, droits incomplets, URL hors périmètre ou revue périmée bloquent l'import.

```bash
npm run import:website -- --file /chemin/page-autorisee.html --source restaurant-partenaire --url https://site-du-partenaire.example/restaurant --area Gombe --dry-run
```

Cette URL est un exemple fictif. **Aucun site restaurant n'a été autorisé ni collecté dans cette session.** La commande lit un fichier HTML obtenu légalement. Elle ne fetch pas le site, n'exécute pas JavaScript et ne récupère pas les contextes JSON-LD, photos ou liens. Pas de crawler réseau HTML/Playwright livré tant qu'aucune source nécessitant ce transport n'est approuvée. Les pages multi-établissements et LocalBusiness ambigus restent en revue ; GPS manquant ⇒ candidat, pas coordonnées inventées. Aucune garantie d'identification parfaite depuis Schema.org.

## Données, provenance et limites

Restaurant = identité éditoriale ; OsmRecord/SourceRecord = observation source ; OsmImportRun = résultat idempotent (nom historique également utilisé pour HTML) ; AdminAudit = acteur/actions/champs modifiés. Les mises à jour source ne remplacent pas les corrections humaines. Prix/photos sont séparés des tags OSM et restent manuels. `snapshotAt` désigne l'état source connu, `updatedAt` la dernière écriture ; la dernière vérification est attestée dans fieldProvenance. Pas encore de planificateur STALE ni de suppression automatique des établissements absents.

Déduplication conservatrice : identité source exacte, téléphone/site identiques, nom normalisé exact ou nom similaire à moins de 250 m. Maximum 21 correspondances proposées ; homonymes/chaînes peuvent produire des faux positifs, toujours en revue. Le score de qualité mesure seulement la complétude. Pas de score probabiliste d'identité ni de fusion automatique.

L'attribution OSM accompagne le catalogue public. Les données OSM enrichies restent soumises aux obligations ODbL applicables : la validation humaine ne transforme pas leur licence. Voir la [matrice de sources et licences](README.md). Les anciens documents d'architecture sont des orientations, pas la liste de fonctions toutes livrées.

## Vérification et exploitation

```bash
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
# DATABASE_URL doit pointer vers une base migrée dont le nom termine par _test.
npm run test:integration
```

Fixtures HTML fictives versionnées dans `src/ingestion/fixtures`, tests sans Internet ; Overpass simulé pour retry/erreurs. Les tests PostGIS nettoient seulement leurs propres enregistrements. Le cache et la base réels sont séparés de ces fixtures.

Les CLI OSM émettent des logs JSON début/fin, cache/requêtes et compteurs ; les résultats par candidat sont retournés et conservés en base pour les imports appliqués. Les erreurs ne divulguent pas la connexion ni les clés. `quality:check` lit les comptes agrégés. Pas encore de tableau de métriques, d'alertes, de rotation de logs ni de sauvegarde automatique : sauvegarder le volume/PostgreSQL avant de dépendre de cette base. Aucun SaaS de monitoring n'est obligatoire.

Validation de cette tranche : build et lint réussis, 46 tests unitaires, 21 tests HTTP demo, 14 tests PostGIS/HTTP réels. Audit npm après correction Multer : 0 vulnérabilité signalée. Le contrôle HTTP sur la vraie collecte confirme 0 restaurant public et des brouillons accessibles via clé admin.
