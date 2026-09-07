# API, import admin et exploitation proposés

Toutes les routes de cette page sont **proposées**, absentes du Swagger actif. Préfixe `/api/v1`. JWT + admin actif + permissions `osm:read`, `osm:ingest`, `restaurants:write`, `restaurants:review` selon action ; MFA admin cible. Ne jamais accepter createdBy/source/licence arbitraires depuis le client. DTO whitelist stricts et commandes idempotentes, If-Match pour modifications.

## API admin

Erreurs communes : 400 validation, 401 non authentifié, 403 permission, 429 limite locale. Limites ci-dessous par acteur ; caps globaux par fournisseur en plus. « local » signifie staging/PostgreSQL, pas API principale OSM.

| METHOD PATH | AUTH | INPUT | OUTPUT | ERRORS en plus | RATE LIMIT proposé | EXTERNAL CALLS | DATABASE EFFECTS |
|---|---|---|---|---|---|---|---|
| GET `/admin/osm/candidates` | osm:read | zoneId, q?, status?, cursor?, limit≤50 | candidats, fraîcheur, licence | 404 zone | 30/min | 0 | aucun |
| GET `/admin/osm/elements/:type/:id` | osm:read | type enum, ID decimal string | dernière version locale + liens | 404 non ingéré | 30/min | 0 | aucun |
| POST `/admin/osm/discovery-jobs` | osm:ingest | zoneId/version OU cercle borné, source=EXTRACT/OVERPASS, Idempotency-Key | 202 jobId | 409,422 zone | 2/min | asynchrone 0 si snapshot réutilisé ; sinon 1 acquisition bornée + retries comptés | job puis staging |
| GET `/admin/osm/jobs/:id` | osm:read | UUID | progression, compteurs, snapshot, erreurs codées | 404 | 30/min | 0 | aucun |
| POST `/admin/osm/duplicate-checks` | restaurants:write | candidateId/version | EXACT_MATCH/POSSIBLE_MATCH/NO_MATCH ou NEEDS_REVIEW + raisons | 404,409,422 | 20/min | 0 | aucun |
| POST `/admin/osm/imports` | restaurants:write | candidateId/version, décision/motif, existingRestaurantId?, Idempotency-Key | draft UUID, référence existante ou NEEDS_DATA | 404,409,422 | 10/min | 0 | transaction restaurant/référence/provenance/audit |
| POST `/admin/osm/import-batches` | restaurants:write | ≤100 candidateIds uniques, décisions explicites, Idempotency-Key | 202 jobId | 404,409,422 | 2/min | 0 | job + résultats individuels persistants |
| POST `/admin/osm/jobs/:id/cancel` | osm:ingest ou responsable batch | expectedVersion | arrêt demandé | 404,409 | 5/min | 0 | état ; imports déjà validés conservés |
| POST `/admin/restaurants/:id/osm-refresh-previews` | restaurants:write | sourceRecordId lié, expectedVersion | diff local/source + version + origine | 404,409 | 10/min | 0 (snapshot local) | audit/preview versionnée |
| POST `/admin/restaurants/:id/osm-refresh-decisions` | restaurants:write | previewVersion, champs, KEEP/ACCEPT, If-Match | restaurant + nouvelle version | 404,409,422 verrou/source | 10/min | 0 | valeurs choisies/provenance/audit transactionnels |
| POST `/admin/restaurants/:id/submit-review` | restaurants:write | expectedVersion | PENDING_REVIEW | 404,409,422 | 5/min | 0 | statut/audit |
| POST `/admin/restaurants/:id/publish` | restaurants:review | expectedVersion | PUBLISHED | 404,409,422 | 5/min | 0 | statut après invariants |

Pourquoi ces noms : recherche admin locale distincte de l'acquisition réseau, jobs longs explicites, pas de GET provoquant un import, pas de refresh caché derrière un affichage. Le refresh externe d'une zone est une discovery-job, pas N appels Details. Les modifications de champs manuels passent par commandes Restaurant normales, provenance et droits contrôlés. Aucune route publique d'upload OSM.

Enveloppes : `{data, meta:{snapshotAt, attribution, nextCursor?}}` ; erreur `{error:{code,message,requestId,retryable}}`. Réponses de batch utilisent résultat par item. Les chiffres d'exemple du prompt ne sont pas une mesure de Kinshasa.

## API publique pour Flutter et MapLibre

Propositions complémentaires au catalogue existant :

- GET `/restaurants/nearby?lat=&lon=&radiusMeters=2000&limit=20` : lieux PUBLISHED, UUID, coordonnées, distanceMeters, attributions.
- GET `/dishes/nearby?lat=&lon=&radiusMeters=5000` : plats publiés/disponibles et menus/restaurant visibles ; prix inchangés selon contrat CDF existant.
- GET `/map/pois?bbox=west,south,east,north&zoom=` : FeatureCollection bornée, coordonnées GeoJSON **[longitude,latitude]**, UUID stable dans feature.id, propriétés alimentaires autorisées et attributions en metadata.
- GET `/geo/areas?parentId=` : zones locales avec licence et type ; aucun Nominatim implicite.

Validation stricte, 60/min par acteur/IP comme départ, plafonds globaux et pagination stable. GET public n'active jamais ingestion, géocodage ou Places. Ne pas exposer les téléphones/candidats non revus ni les attributs internes de jobs. Attribution POI et attribution fond de carte toutes deux nécessaires. L'API catalogue Flutter déjà consommée reste compatible ; l'ajout de ces routes attend l'implémentation DB.

## Batch et queue minimale

Un batch de 100 imports locaux et un parsing PBF ne doivent pas vivre dans la requête HTTP. V1 : **IngestionJob durable PostgreSQL + worker unique**, même codebase, processus séparé ; prise de lease transactionnelle (SKIP LOCKED), heartbeat, reprise sur lease expirée. Cela évite d'ajouter BullMQ/Redis uniquement pour quelques jobs par semaine. Une simple liste en mémoire n'est pas une queue durable.

États : QUEUED→RUNNING→COMPLETED/PARTIAL/FAILED/CANCELLED. Chaque item se termine NEW_DRAFT/EXACT_MATCH/NEEDS_REVIEW/REJECTED/FAILED ; la somme des états terminaux = processed, et processed≤totalKnown. Total est inconnu pendant parsing tant que le décompte source n'est pas fini. Déduire les compteurs de lignes uniques ou les incrémenter dans la transaction item, jamais deux fois sur retry. Si l'admin annule, terminer proprement l'item courant ; pas de suppression des drafts déjà créés.

Retry au niveau item ou acquisition : maximum 3 tentatives, erreurs transitoires seulement, backoff 5/20/60 s + jitter et Retry-After s'il fourni (attendre au moins ce délai). Les workers libèrent leur lease de travail en attente longue ou planifient nextAttemptAt ; pas de boucle bloquante en controller. Les données invalides et conflits admin ne sont pas retentés automatiquement. Rejouer une tâche ne crée pas de doublon grâce aux contraintes/idempotence DB.

BullMQ devient utile si de nombreux jobs, concurrence par source et planification dépassent ce worker simple. Redis peut déjà servir le cache/limiteur général plus tard, mais n'est pas un prérequis du noyau OSM. Un verrou/compteur PostgreSQL global suffit aux faibles volumes externes retenus ; ne jamais limiter seulement par processus lors d'un déploiement multi-instance.

## Fournisseurs, throttling, erreurs et cache

Overpass exploratoire : plafond produit proposé 1 requête active/projet, intervalle minimal 10 s, 20 acquisitions/jour, réponse ≤5 Mo, timeout 30 s ; pas de requête QL fournie par l'utilisateur, filtre/type/zone construits côté serveur. Ces chiffres ne donnent aucune garantie de service. Zone refusée ou charge trop grande ⇒ extraire le fichier local, pas multiplier automatiquement les sous-requêtes pour contourner une limite.

Réutiliser la réponse d'une requête identique pour un snapshot pendant 24 h (choix de fraîcheur local), conserver fetchedAt/sourceTimestamp ; ce n'est pas une durée légale maximale OSM. Coalescer les acquisitions simultanées. PBF : ne télécharger qu'une version nouvelle, HTTP conditionnel si supporté, hash local et date du snapshot ; garder les deux derniers fichiers opérationnels selon place disponible et la durée nécessaire aux obligations d'export/reproduction. La couche source normalisée peut rester durable, avec politique de correction et minimisation.

| Échec | Erreur backend proposée | Effet |
|---|---|---|
| 429 fournisseur | EXTERNAL_RATE_LIMITED (503 pour consultation synchrone future) | prochain essai différé ; jamais rotation furtive d'IP |
| 502/503/504 réseau fournisseur | SOURCE_UNAVAILABLE | job différé, staging précédent disponible avec date |
| timeout | SOURCE_TIMEOUT | acquisition incomplète, aucune suppression |
| HTTP 200 avec remark, JSON invalide, taille excessive | SOURCE_INCOMPLETE / INVALID_SOURCE_DATA | ne pas valider snapshot ; diagnostic sans payload sensible |
| PBF corrompu/géométrie invalide | INVALID_EXTRACT / GEOMETRY_REVIEW | quarantaine et compteurs ; aucun point fictif |
| conflit version/idempotence | VERSION_CONFLICT, 409 | réafficher version actuelle |
| quota local | LOCAL_RATE_LIMITED, 429 | Retry-After et budget explicite |

Nominatim public désactivé, pas de code l'appelant. Fallback géographique = données locales et saisie vérifiée, pas bascule automatique vers un endpoint public. Cache des tuiles suit le contrat du fournisseur choisi, jamais la politique de cache des POI par analogie. Recherche publique éventuellement cachée brièvement dans Redis avec invalidation publication/modification ; ne pas mettre les coordonnées des utilisateurs dans des logs ou clés durables inutilement.

## Sécurité, Docker et observabilité

Worker non root, ressources CPU/RAM/disque/temps bornées, répertoire temporaire propre au job ; outils PBF versionnés et image verrouillée lors de l'implémentation. Pas d'exécution shell construite depuis la query admin ; spawn avec arguments fixes et fichiers internes. Protection contre archive démesurée, symlink/path traversal et URL d'entrée SSRF. Aucune visite automatique des websites/images référencés. Logs sans tag dump, payload, position utilisateur ou numéro de téléphone.

Configuration proposée, **non câblée actuellement** :

```dotenv
OSM_INGESTION_ENABLED=false
OSM_SOURCE_MODE=LOCAL_EXTRACT
OSM_OVERPASS_ENABLED=false
OSM_MAX_BATCH_ITEMS=100
OSM_MAX_ACTIVE_EXTERNAL_REQUESTS=1
OSM_MAX_DAILY_EXTERNAL_REQUESTS=20
```

OSM n'exige pas une clé pour lire un fichier local. Un User-Agent explicite avec contact réel est requis pour les services qui le demandent ; ne pas fournir un faux contact. URL fournisseur et dossier d'extraits viennent de configuration opérateur validée, pas d'un endpoint admin ouvert. API DB et worker partagent PostgreSQL/PostGIS, réseau privé et sauvegardes ; pas de cluster Big Data. Les secrets DB et éventuels tokens de tuiles restent distincts, à privilèges limités.

Événements structurés proposés : osm_import_started/completed, records_imported, duplicates, failures avec jobId, actorId, sourceKind, nombre et durée. Métriques : osm_import_count (documenter unité jobs/records), osm_import_error, osm_duplicate_count, osm_refresh_count, osm_request_latency, snapshot_age, rejected_geometry_count, job_queue_age. Labels à faible cardinalité, pas un osmId par série. Alertes : acquisition échouée répétée, âge source excessif, hausse brutale de disparitions, worker sans heartbeat et stockage proche limite.

## Tests sans Internet

**Livrés :** parser/normalizer, IDs composites/grands IDs, champs absents, tags invalides, URLs dangereuses, résultat partiel, coordonnées hors limites, centre approximatif, indices lifecycle, doublon exact/probable, protection des champs manuels et proposition sans application automatique.

**À implémenter avec les composants concernés :**

| Niveau | Cas exigés avant activation |
|---|---|
| transport mock | timeout/429/5xx, borne taille, redirect/SSRF, retry/backoff, coalescing et compteur global |
| PBF local fixture | node/way/relation, membres manquants, multipolygone traversant bbox, frontières, extraction vide et corrompue |
| PostgreSQL réel jetable | import répété/concurrent, même numéro node/way distinct, transaction rollback, contraintes source, lock/version, provenance, export ODbL complet |
| PostGIS réel jetable | 1999/2001 m avec tolérance numérique, ordre lon/lat, distance métrique, lieux de l'autre rive hors zone, limite commune, plat restaurant draft invisible, index sur volume réaliste |
| jobs | crash/reprise, lease expirée, pas de double compte, cancel, partial, dernier snapshot incomplet sans suppression |
| refresh | champ manuel préservé, absence non effaçante, version ancienne refusée, occupant changé à revoir, acceptation OSM et provenance conservée |
| E2E Supertest | 401/403, limites, sélection→draft→menu/plat/prix→revue→publication, conflits 409, pipeline externe en panne et catalogue public toujours accessible |
| geo fallback | résolution locale sans Internet, inconnue explicite, aucun appel Nominatim caché |

Le noyau livré n'exécute pas SQL, imports persistants, transport ou compteurs : leurs tests ne sont pas revendiqués comme réussis. Les fixtures de domaine sont synthétiques, pas des lieux Kinshasa présentés comme réels.

## Suite de l'implémentation

D'abord PostgreSQL/PostGIS + Prisma et auth admin du dossier général ; puis tables source/jobs et import depuis fichier local avec ces tests. Valider un polygone pilote et auditer quelques candidats terrain pour mesurer la couverture. Ajouter la publication et l'export/licence, ensuite le contrat de carte. Diff-based update, Meilisearch, BullMQ, sources partenaires et claim seulement lorsque les besoins mesurés le justifient. Aucun abonnement, acquisition de données réelle ou migration de production effectué ici.
