# Collecte V1 locale sans abonnement — 10 septembre 2026

## Décision avant implémentation

**Combinaison minimale : OSM pour découvrir, données fournies par les restaurants/équipe pour compléter ; sites web seulement après vérification documentée de leurs droits.** Aucun annuaire commercial automatiquement autorisé. Logiciels locaux et PostgreSQL/PostGIS ; aucun Google, proxy payant, carte bancaire, abonnement cloud ou API payante requis. Électricité, matériel existant et connexion restent des ressources réelles, pas un service offert par cette architecture.

### Vérification réelle Kinshasa

Deux requêtes Overpass ponctuelles ont vérifié le périmètre puis les POI. Province Kinshasa : relation **5646651**, ISO CD-KN, admin_level=4 ; ne pas confondre avec la commune Kinshasa relation 388103 (niveau 7). Snapshot source **2026-09-10T16:43:20Z**, réponse 100 877 octets, sans remark : **316 objets** (222 nœuds, 94 ways), répartis en 200 restaurants, 67 fast-foods, 49 cafés. 271 portent `name`, 127 `addr:street`, 38 un téléphone, 11 un site ; 316 possèdent un point ou centre. C'est un inventaire OSM daté, **pas 316 établissements uniques vérifiés, ni une couverture exhaustive**. Les ways ont des centres approximatifs ; la date OSM ne prouve pas une observation terrain récente.

Requête : relation 5646651 → map_to_area → nwr amenity restaurant/fast_food/cafe → out body center. Pas d'identité de contributeur téléchargée, pas d'extraction d'avis/photos, pas d'appel Details par POI. [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [référence OSM](https://www.openstreetmap.org/relation/5646651).

### Sources et matrice de conformité

| SOURCE | DATA / couverture | LICENCE | FETCH | STORE / DISPLAY | ATTRIBUTION | COMMERCIAL | LIMITE / compte |
|---|---|---|---|---|---|---|---|
| OSM / Overpass | couverture mesurée ci-dessus ; métadonnées POI incomplètes | ODbL | oui, usage ponctuel borné | oui selon ODbL | contributeurs OSM + licence | oui sous conditions | instance partagée sans SLA ; pas de compte requis |
| Geofabrik RDC | extrait national disponible, comprend Kinshasa ; source OSM commune | ODbL | téléchargement de snapshot | mêmes droits OSM | OSM et référence fournisseur | oui sous conditions | transfert/stockage local ; pas d'abonnement ; pas de lecteur PBF livré par cette tranche |
| GeoNames | noms de localités ; couverture POI alimentaire non démontrée | CC-BY selon export | téléchargement local possible | sous licence et attribution | GeoNames | oui | pas notre source restaurant, API publique non activée |
| Go Africa Online | fiches Kinshasa présentes mais qualité variable, y compris ambiguïtés de pays sur certaines pages | droits réservés/CGU | **non pour notre scraper sans convention** | extraction/republication non autorisée par défaut | ne suffit pas à autoriser | licence écrite requise | automatisation explicitement interdite |
| Kanya, Le Gabriel (sites identifiés) | présence Kinshasa indiquée par leurs pages indexées ; contenu structuré exact non audité | autorisation non établie | **désactivé** | **non autorisé par défaut** | à définir avec ayant droit | non établi | robots/CGU non vérifiables avec les lectures tentées ; aucune approbation inférée |
| Site fourni/autorisé par un restaurant | établissement donné ; JSON-LD éventuellement disponible | permission écrite ou licence compatible, par source | seulement périmètre approuvé et robots respecté | selon droits explicitement enregistrés | propre à la source | doit être expressément couvert | aucun coût logiciel ; pas de login contourné |
| Google/Tripadvisor/réseaux sociaux | non retenus | hors périmètre | non | pas d'avis/notes/photos importés | — | — | aucune extraction |

Sources : [OSM copyright](https://www.openstreetmap.org/copyright), [Geofabrik RDC](https://download.geofabrik.de/africa/congo-democratic-republic.html), [GeoNames](https://www.geonames.org/export/), [CGU Go Africa Online](https://www.goafricaonline.com/page/cgu), [Kanya](https://kanyarestaurant.com/), [Le Gabriel](https://restaurantlegabriel.com/). Les pages de sites servent ici à qualifier des pistes, pas à alimenter une base sous licence inventée. Les résultats Google de recherche documentaire ne sont jamais une source de POI du collecteur.

## Architecture et pipeline exact

SOURCE → FETCH → PARSE → NORMALIZE → VALIDATE → DEDUPLICATE → ENRICH → QUALITY SCORE → DRAFT → ADMIN REVIEW → PUBLISH.

- Source : registre local avec statut, licence/permission, périmètre et date de revue. OSM actif ; sites désactivés tant que leurs conditions ne sont pas satisfaites.
- Fetch : fichier local ou requête OSM bornée ; cache de snapshot, timeout, retry limité, pas de contournement.
- Parse : adaptateur OSM ; Cheerio pour JSON-LD local autorisé (Restaurant/FoodEstablishment/LocalBusiness). Aucun script exécuté, aucun lien automatiquement suivi.
- Normalize/validate : noms distincts d'une clé de recherche, contacts/URLs contrôlés, coordonnées finies, null pour absence ; cuisine indicative ≠ plat.
- Dedupe : identité de source, nom/geo, téléphone valide/site, ambiguïtés conservées ; aucune fusion probable automatique.
- Enrich : métadonnées locales/provenance, pas de reverse-geocoding de tous les POI ; points existants prioritaires, correction humaine ensuite.
- Quality : complétude vérifiable, pas probabilité d'exactitude. 20 nom, 35 point, 15 adresse, 10 téléphone valide, 10 horaires, 5 site, 5 cuisine. Les centres approximatifs perdent 15 points du critère geo. Aucun bonus « source fiable » ni seuil auto-publish.
- Draft : stockage source et restaurant si identité/point suffisants ; nom inconnu reste candidat. Photos/prix absents restent null ; aucune création automatique de menu/plat.
- Review/publish : édition humaine versionnée, provenance préservée, GPS vérifié explicitement. La publication n'est pas une preuve de présence OSM ni de licence des photos.

Monolithe NestJS : `osm` garde sa normalisation ; `ingestion/domain` porte JSON-LD/qualité, `ingestion/infrastructure` la collecte contrôlée, `admin` les commandes protégées, `database` Prisma. Pas de modules globaux mapper/normalizer séparés artificiellement, pas de microservices. Nouveau SourceRecord pour sites ; pas de faux osmId pour une page web.

## Géocodage, tuiles et coût/licence des composants

| Composant | Solution / licence | Logiciel / API obligatoires | Local / limites |
|---|---|---|---|
| Runtime/API | Node.js MIT, NestJS MIT | 0 | machine existante ; charge limitée |
| SQL/GIS | PostgreSQL licence PostgreSQL, PostGIS GPL | 0 | disque/RAM/backups à prévoir |
| ORM | Prisma Apache-2.0 | 0, produits cloud non requis | migrations locales |
| HTML | Cheerio MIT | 0 | HTML statique, aucune permission de contenu conférée |
| JS | Playwright Apache-2.0 | 0 | **non activé V1**, seulement site autorisé nécessitant JS, navigateur lourd |
| Recherche | PostgreSQL full text/trigram | 0 | pas de moteur commercial ; Meilisearch facultatif futur |
| Queue | exécution locale séquentielle + runs DB | 0 | pas de Redis/BullMQ nécessaires à ces lots |
| Géocodage | coordonnées source + équipe | 0 | pas d'invention à partir d'une adresse incomplète |
| Nominatim local | GPL, données ODbL | 0 logiciel | import/indexation et RAM ; précision dépend des adresses OSM ; public limité 1 req/s/app, pas d'autocomplete ni inventaire POI |
| Photon local | Apache-2.0, données OSM | 0 logiciel | moteur de recherche supplémentaire, pas plus de couverture que ses sources ; serveur démo non retenu |
| Pelias local | MIT (composants à auditer), sources distinctes | 0 logiciel | plus lourd, imports/indexes multiples ; pas pertinent V1 |
| Carte | MapLibre BSD-2-Clause | 0 logiciel | renderer ≠ hébergeur de tuiles |
| Tuiles locales | Martin MIT + archive régionale légalement obtenue/générée | 0 logiciel/API | stockage et génération ; styles/glyphes/sprites et leurs licences à fournir ; pas de tuiles publiques aspirées |
| Conteneurs | Podman libre / Docker Engine libre | 0 obligatoire | Docker Desktop a ses propres conditions ; ne pas en faire une dépendance payante |

Sources : [Cheerio](https://github.com/cheeriojs/cheerio/blob/main/LICENSE), [Playwright](https://github.com/microsoft/playwright/blob/main/LICENSE), [PostgreSQL](https://www.postgresql.org/about/licence/), [PostGIS](https://postgis.net/documentation/faq/), [Nominatim local](https://nominatim.org/release-docs/latest/admin/Installation/), [politique publique Nominatim](https://operations.osmfoundation.org/policies/nominatim/), [Photon](https://github.com/komoot/photon), [Pelias](https://github.com/pelias/pelias), [MapLibre](https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md), [Martin](https://github.com/maplibre/martin).

Aucune offre MapTiler/Stadia n'est requise par cette V1 : la recommandation commerciale du dossier OSM initial est remplacée par le fonctionnement local. La carte reste facultative pour le pipeline et la recherche alimentaire. Les [tuiles publiques OSM](https://operations.osmfoundation.org/policies/tiles/) ne constituent ni un serveur illimité ni une source de téléchargement offline : attribution, identification et cache prescrits, pas de préchargement massif.

## Sécurité, conformité et exploitation

ODbL autorise l'usage commercial sous obligations, notamment attribution et partage applicable à la base dérivée utilisée publiquement. Les données OSM ne deviennent pas propriétaires par validation admin. Ne pas présumer que des tables séparées isolent juridiquement tous les enrichissements ; conserver une couche exportable et sa licence. Menus/prix/photos collectés indépendamment restent tracés séparément. [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).

Robots.txt ne remplace pas une autorisation de stockage/republication. Un site interdit est désactivé même si robots permet une URL ; un robots inaccessible ne donne pas autorisation tacite. Parser des fichiers locaux autorisés est distinct de lancer un crawler réseau. Pas de CAPTCHA, proxy tournant, paywall, login ou anti-bot contourné. [RFC robots](https://www.rfc-editor.org/rfc/rfc9309).

Le collecteur OSM fixe hôte/types/zone, une requête active locale, cache 24 h, timeout borné, refus des réponses partielles. Retry réseau/429/5xx limité, attente backoff et Retry-After ; pas de rotation d'instances. Aucun site librement fourni par une route publique n'est fetché. Le parser JSON-LD ne récupère pas les contextes @context distants, photos, menus ou sameAs.

Staging persistant, UUID métier, clés source uniques, verrou commun création, transactions bornées et idempotence. Dernière observation source ≠ dernière vérification terrain. Mise à jour source ne remplace pas une valeur manuelle ; disparition ⇒ revue, pas suppression. SourceRecord/ImportRun suffisent au départ ; BullMQ seulement pour volumes/jobs longs réellement mesurés.

Logs CLI OSM : startedAt/finishedAt, source, cache hit, pagesFetched, found/created/duplicates/needsData/needsReview et erreurs sûres. Ne pas loguer clé admin, HTML brut ou contacts inutiles. Tests locaux JSON/HTML et PostGIS jetable, tests de concurrence/dry-run/nulls/401/validation/retour public. Les snapshots réels servent à la mesure et à la collecte locale, pas aux tests unitaires réseau.

## Feuille de route et couverture des livrables

Cette tranche : collecte OSM Kinshasa, parsing JSON-LD autorisé, dry-run lisant la DB sans écritures, drafts manquants, endpoints admin/manual, qualité, déduplication, logs, tests. Ensuite sources écrites autorisées au cas par cas, géométries d'entrée/polygones plus précises, droits par éditeur, formulaires dashboard et menus complets. Pas de 500 domaines, ni de pipeline Planet/minutely prématuré.

Les 24 livrables sont couverts par ce dossier, le [guide exécutable](USAGE.md), les [données/PostGIS existants](../openstreetmap/database.md) et les tests. Le guide distingue fonctions livrées, options non activées et limites vérifiées.
