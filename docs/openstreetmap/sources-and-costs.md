# Sources, cartographie et coûts

## Comparaison des moyens d'ingestion

Les fréquences recommandées ci-dessous sont celles du projet, pas des engagements de disponibilité fournisseur.

| Solution | Coût/volume | Simplicité et fraîcheur | Limites / entretien | Pertinence Kinshasa |
|---|---|---|---|---|
| Overpass public | pas de facturation par POI ; petites réponses ciblées | très simple pour explorer une zone ; retard de réplication variable | service partagé, erreurs/quotas ; pas de SLA | pilote ponctuel, pas de dépendance d'exploitation |
| Extrait OSM régional fourni autrement | transfert et stockage local | vérifier format, snapshot, source et licence | qualité et fréquence propres au fournisseur | acceptable si provenance, géométrie et complétude traçables |
| Geofabrik PBF RDC | téléchargement public ; ordre de grandeur observé environ 400 Mo compressés, variable | extrait régional et updates disponibles | parser en streaming, mémoire/temporaire bien plus grands que le fichier | **choix V1 reproductible**, découpage Kinshasa local |
| Planet OSM | fichier mondial très volumineux + traitement coûteux | snapshots et diffs | disproportionné pour une ville | exclu V1 |
| Overpass/Nominatim propres | infrastructure et opérations | maîtrise du service et synchronisation | import/index/repliques à gérer | trop lourd avant besoin mesuré |

L'extrait **Congo (Democratic Republic/Kinshasa)** existe ; ne pas le confondre avec Congo-Brazzaville. Les nombres de POI, coordonnées de limites et `admin_level` locaux ne sont pas inférés du nom du fichier. Aucun téléchargement PBF effectué ici. [Geofabrik RDC](https://download.geofabrik.de/africa/congo-democratic-republic.html), [Planet](https://planet.openstreetmap.org/).

Pour l'instance overpass-api.de, le guide donne environ 10 000 requêtes/jour et 1 Go/jour comme ordre de grandeur de prudence, pas comme droit garanti ni cible à atteindre. Menu2Kin se place très en dessous avec des demandes admin limitées. Préférer le fichier régional lorsque l'exploration devient systématique. [Overpass Commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).

**Rythme recommandé :** snapshot initial contrôlé, puis actualisation hebdomadaire manuelle au début. La date de téléchargement n'est pas la date d'observation terrain. À volumétrie éditoriale basse, pas de nightly ni réplication minute. Après mesures, un téléchargement hebdomadaire automatisé peut alimenter le staging sans publier ni modifier automatiquement les restaurants.

## Adresse, communes et géocodage

OSM fournit tags d'adresse et limites quand présents. Le registre `GeoArea` local conserve géométrie, type interne COMMUNE/NEIGHBORHOOD/EDITORIAL_ZONE, parent et provenance. Ne pas supposer que toute commune porte le même niveau OSM ou que les quartiers sont complets. Vérifier les polygones et leur concordance avec les réalités locales ; enregistrer les zones éditoriales de l'équipe comme telles.

GeoNames peut compléter les noms de localités et alias à partir d'un téléchargement pays ; ce n'est ni un inventaire de restaurants ni une garantie de polygones fins. Données CC-BY avec attribution, usage commercial admis ; qualité non garantie. Ajouter sa licence séparément et vérifier la compatibilité du mélange retenu. Aucun service GeoNames en ligne requis V1. [GeoNames](https://www.geonames.org/export/).

Géocodage V1 : sélectionner une zone locale, saisir ou vérifier le point, exploiter les tags d'adresse disponibles. L'adresse manquante reste inconnue ; on ne lance pas un reverse-geocode par POI. Si un futur besoin de recherche d'adresse est démontré, comparer fournisseur contractuel et instance locale avant activation. L'échec d'un géocodeur ne doit bloquer ni coordonnées déjà connues ni édition manuelle.

## MapLibre et fonds de carte

MapLibre est un moteur de rendu, pas un fournisseur de POI ou de tuiles. Un plugin Flutter du projet permet les couches vectorielles/raster et GeoJSON ; les variantes de packages et leurs fonctions doivent être vérifiées sur Android/iOS avant sélection définitive. Prévoir un test technique distinct, aucune modification Flutter dans ce livrable. Les serveurs de démonstration ne sont pas des fonds de production. [Projet Flutter MapLibre GL](https://github.com/maplibre/flutter-maplibre-gl).

| Fond | Coût vérifié / limites | Décision |
|---|---|---|
| raster public OSM | gratuit à l'accès, capacité limitée, règles de cache et interdiction offline/préchargement | écarté comme dépendance commerciale principale |
| MapTiler Cloud | Free destiné aux tests/usages personnels ou non commerciaux ; Flex affiché 30 USD/mois hors TVA + dépassements | solution gérée possible ; avec SDK tiers, surveiller requêtes de tuiles et non seulement sessions |
| Stadia Maps | Free 200 000 crédits/mois, usage commercial interdit ; Starter affiché 20 USD/mois, 1 million de crédits + dépassements | **point de départ commercial à évaluer**, plafond et conditions des styles à vérifier |
| tuiles propres régionales | coût de génération, stockage, trafic, styles, polices et maintenance | alternative d'indépendance lorsque budget total et compétences la justifient |

Tarifs consultés le 7 septembre 2026, non garantis : [MapTiler](https://www.maptiler.com/cloud/pricing/), [Stadia Maps](https://stadiamaps.com/pricing/). Les crédits ne sont pas nécessairement des vues de carte ; calculer la consommation avec le style et le renderer choisis. Aucun abonnement souscrit.

Pour l'auto-hébergement, une archive vectorielle régionale et un serveur de tuiles compatible MapLibre évitent un pipeline mondial. Publier des versions immuables, fournir styles/glyphes/sprites, CDN/cache et politique de renouvellement. PMTiles est une option seulement après validation de sa prise en charge sur les plateformes Flutter retenues ; MBTiles avec serveur HTTP est une autre voie. Auditer les licences de chaque ressource et les droits offline. N'aspirer aucune tuile publique pour fabriquer l'archive.

Le contrat backend renvoie les POI Menu2Kin en JSON ou GeoJSON (UUID, lon/lat, statut public, attribution), pas des résultats Places. Les tuiles sont téléchargées auprès du fournisseur autorisé. La configuration du style est remplaçable sans changer les données métier. Si le fond tombe, liste, recherche et distances continuent ; si Internet est totalement absent côté téléphone, seules les fonctions explicitement mises en cache/offline peuvent fonctionner. Ne pas confondre indépendance du backend et fonctionnement intégral hors réseau mobile.

## Coût total comparé

| Poste | Google Places | OSM + ingestion locale | Fournisseur ouvert géré |
|---|---|---|---|
| découverte | facturation selon SKU/champs et volume | pas de redevance par POI sous ODbL ; CPU/transfert | offre contractuelle selon appels/extraits |
| stockage | contenu soumis aux règles Google | PostgreSQL + snapshots + export licence | mêmes besoins locaux si stockage autorisé |
| cartographie | contrat de carte distinct et restrictions d'association | fournisseur de tuiles ou hébergement propre | quota et dépassements |
| géocodage | API potentiellement facturée | pas nécessaire V1 ; instance propre coûteuse si ajoutée | coût par usage/plan |
| recherche alimentaire | toujours notre base | PostgreSQL local | toujours notre base |
| entretien | clé/quota/contrat + données propres | parsing, snapshots, QA, conformité + données propres | moins d'infrastructure, dépendance fournisseur |

Ne pas comparer uniquement le prix d'un appel. Budget mensuel = serveur DB/API + backups + stockage snapshots/exports + trafic + tuiles + temps d'exploitation + travail de collecte. Aucun tarif serveur inventé : il dépend du fournisseur et des volumes non fournis. Pour le pilote, un seul petit environnement peut héberger API et DB avec sauvegarde séparée ; cela réduit le coût mais n'est pas de la haute disponibilité. Mesurer RAM, durée des imports, Go servis, vues de carte, coût par restaurant effectivement publié et temps de correction.

Pour Google, le [dossier existant](../google-places/README.md) reste applicable ; aucun mélange des valeurs Google avec les exports ODbL. L'économie OSM n'est pas conditionnée à une couverture exhaustive : prévoir un budget de collecte terrain.
