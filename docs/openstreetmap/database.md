# Modèle PostgreSQL/PostGIS proposé

Complément au [schéma général](../architecture/database/README.md). Pas une migration exécutée : la base n'est pas raccordée au catalogue actuel. Réutiliser Restaurant, Dish, Menu, contacts et horaires existants ; ne pas créer un second domaine alimentaire.

## Tables et contraintes

| Table | Champs essentiels | Contraintes/index |
|---|---|---|
| OsmSourceRecord | UUID, osmType, osmId BIGINT, osmVersion?, sourceTimestamp?, snapshotAt, fetchedAt, normalized JSONB whitelist, sourceState, licence, sourceUrl, geometryMethod | UNIQUE(type,id), ID>0, version>0 si présente ; pas de JSON Google ; index snapshotAt |
| OsmCandidate | UUID, sourceRecordId, candidateVersion, ingestJobId, status, qualityFlags, selectedRestaurantId?, reviewedBy?, reviewedAt? | sourceRecordId unique pour état courant, FK job/source ; index status/job |
| RestaurantOsmReference | UUID, restaurantId, sourceRecordId, linkedAt, linkedBy, lastReviewedVersion? | sourceRecordId UNIQUE, FKs ; restaurantId non unique (plusieurs objets par lieu) |
| IngestionJob | UUID, sourceKind, sourceSnapshot/hash, zoneId/version, filterVersion, state, counters, cursor, leaseUntil, attempts, createdBy, timestamps | clé d'idempotence scoped unique ; index state/leaseUntil ; état borné |
| IngestionItem | jobId, sourceRecordId, outcome, restaurantId?, errorCode? | UNIQUE(jobId,sourceRecordId) ; compteurs recomputables |
| GeoArea | UUID, parentId?, kind, name, geometry(MultiPolygon,4326), source/licence/version, verifiedAt | GiST geometry ; index parentId ; géométrie valide/SRID contrôlé |
| Restaurant | existant + contentStatus, fieldProvenance JSONB validé, données dérivées identifiables | version existante ; filtres de publication ; coordonnées synchronisées |

Pour le volume V1, OsmSourceRecord et OsmCandidate peuvent être **une seule table physique** si les responsabilités et champs restent distincts ; ce n'est pas une obligation de créer huit tables supplémentaires. IngestionItem sert quand on active le batch durable. L'audit général existant est réutilisé.

La couche dérivée OSM inclut les normalisations/corrections qui relèvent de l'ODbL ; son export ne doit pas être limité aux tags originaux si les valeurs publiques dérivées diffèrent. Les colonnes canoniques copiées d'OSM doivent pouvoir être retracées et exportées dans ce périmètre. FKs ou séparation de schémas ne suffisent pas à qualifier juridiquement l'ensemble ; voir [compliance](compliance.md).

## Identifiants et Prisma

Prisma : UUID String @db.Uuid pour les clés internes ; osmId BigInt @db.BigInt et conversion explicite `.toString()` pour JSON. UNIQUE `[osmType, osmId]`, jamais osmId seul. Geography et polygones restent Unsupported dans le modèle cible, gérés par migrations SQL et requêtes paramétrées. Le schéma existant utilise Decimal(9,6) pour lat/lon : conserver la stratégie pour la compatibilité, sans prétendre cette précision de stockage égale à la précision terrain.

Restaurant.address/name sont actuellement obligatoires dans le schéma proposé général ; les valeurs manquantes restent en candidat. Ne pas relâcher silencieusement les invariants publics. Une migration alternative vers drafts incomplets demanderait contraintes conditionnelles et adaptation de tous les lecteurs, hors noyau livré.

## Coordonnées et indexes

Une seule autorité d'écriture des coordonnées : latitude/longitude + trigger SQL existant vers `location geography(Point,4326)` ; ne pas autoriser un client à modifier séparément location. SRID 4326, longitude d'abord dans ST_MakePoint. Pour les distances, geography en mètres. Pour les communes et bbox, geometry 4326 avec index adapté. Une entrée relevée remplace le point approximatif uniquement via commande avec provenance.

Indexes cibles, SQL illustratif à adapter à la migration et aux noms exacts :

```sql
-- Certains indexes existent déjà dans le dossier général : ne pas les dupliquer.
CREATE INDEX restaurant_location_gist ON "Restaurant" USING gist (location);
CREATE INDEX restaurant_map_geometry_gist ON "Restaurant" USING gist ((location::geometry));
CREATE INDEX geo_area_boundary_gist ON "GeoArea" USING gist (boundary);
-- normalizedName est une colonne de matching maintenue à l'écriture, à ajouter si retenue.
CREATE INDEX restaurant_name_trgm ON "Restaurant" USING gin ("normalizedName" gin_trgm_ops);
```

GiST geography accélère ST_DWithin ; l'index d'expression geometry sert au viewport. GIN trigram accélère la sélection textuelle approximative ; B-tree sur téléphone E.164/host normalisé sert les égalités. Tous ont un coût en disque/écritures : n'ajouter celui du viewport que lorsque cette route existe. Comparer EXPLAIN (ANALYZE, BUFFERS) avec des volumes réalistes ; une petite table peut légitimement avoir un scan séquentiel. [ST_DWithin](https://postgis.net/docs/ST_DWithin.html).

## Restaurants à moins de 2 km

SQL paramétré proposé (`$1` longitude, `$2` latitude, `$3` rayon en mètres, `$4` limite), non exécuté ici :

```sql
WITH origin AS (
  SELECT ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision),4326)::geography AS p
)
SELECT r.id, r.name, r.latitude, r.longitude,
       ST_Distance(r.location, origin.p) AS "distanceMeters"
FROM "Restaurant" r CROSS JOIN origin
WHERE r."contentStatus" = 'PUBLISHED'
  AND r.status = 'ACTIVE' AND r."deletedAt" IS NULL
  AND ST_DWithin(r.location, origin.p, $3::double precision)
ORDER BY ST_Distance(r.location, origin.p), r.id
LIMIT $4::integer;
```

Valider lat [-90,90], lon [-180,180], rayon 100–10 000, limite 1–50. Filtrer avant calcul/tri exact sur le sous-ensemble. Le rayon est une distance à vol d'oiseau, pas un itinéraire routier ni le temps de marche. Pour nearest sans rayon, choisir un rayon produit explicite ou une stratégie KNN testée ; ne pas lancer une distance exacte sur tout le catalogue.

Plats disponibles à moins de 5 km : réutiliser [nearby.sql général](../architecture/database/nearby.sql) avec rayon 5000 et **ajouter `r.contentStatus='PUBLISHED'`** lorsque le nouveau champ est introduit. Conserver conditions menu et plat publiés, disponibilité, suppressions et budget. Une jointure Restaurant ne doit pas rendre visible le plat d'un restaurant DRAFT. Filtres horaires actuels nécessitent des horaires propres interprétés et des exceptions, pas le tag OSM brut.

Viewport : `location::geometry && ST_MakeEnvelope(west,south,east,north,4326)` puis bornes exactes adaptées ; limiter surface/zoom et nombre de marqueurs (500 proposés). Retourner `truncated=true` ou clusters locaux, pas une impression d'exhaustivité. Commune : ST_Covers(area.boundary, location::geometry), résultat ambigu en revue ; pas de déduction administrative à partir d'addr:district seul.

## Recherche alimentaire et géographie indépendante

Recherche « pizza/poulet braisé/burger » sur Dish, catégories, descriptions et alias Menu2Kin ; cuisine OSM reste un indice secondaire de lieu, jamais une fiche Dish générée. PostgreSQL full text + trigram suffisent au départ ; Meilisearch seulement après mesure de pertinence/latence. Une éventuelle indexation Meilisearch se reconstruit depuis PostgreSQL et conserve filtres de publication/provenance.

Aucune requête publique ne joint un service externe. En panne OSM/Overpass/Nominatim, la DB conserve coordonnées, recherche et fiches ; seuls ingestion/refresh externes sont différés. Une panne de notre PostgreSQL reste une panne du produit : backups, restauration et supervision sont indispensables.

## Migration et exploitation

Ordre : extensions et tables source/jobs → provenance et contentStatus → backfill des états à partir de preuves réelles → lecteurs filtrant publication → commandes admin → pilote d'import → export ODbL validé avant diffusion concernée. Ne jamais publier tous les anciens enregistrements ou déclarer leurs sources arbitrairement. Versionner scripts, rollback applicatif et stratégie de restauration. Tables source/normalisations exportables et données utilisateurs ont des politiques d'accès distinctes.
