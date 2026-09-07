# Menu2Kin — architecture OSM pour Kinshasa

> **Mise en œuvre commencée :** voir le [guide de l’intégration persistante](../OSM-INTEGRATION.md). Les mentions « proposé » ci-dessous décrivent le dossier de conception initial ; le guide distingue les éléments désormais raccordés.

Décision du 7 septembre 2026, backend uniquement. **Recommandation : extrait PBF RDC Geofabrik → découpage Kinshasa local → candidats OSM → déduplication et revue admin → PostgreSQL/PostGIS → API alimentaire propre.** Overpass facilite un pilote ponctuel ; ni Overpass ni Nominatim ne servent les recherches des utilisateurs. MapLibre affiche les POI de notre API sur un fond de carte dont l'hébergement reste un choix séparé.

C'est une architecture à coût d'ingestion fournisseur faible, pas une promesse de zéro coût : serveur, sauvegarde, tuiles et travail éditorial restent nécessaires. La couverture réelle des restaurants à Kinshasa doit être mesurée ; aucun comptage de restaurants réels n'a été effectué dans ce livrable.

## Lecture et état du livrable

1. [Conditions vérifiées et OpenStreetMap Compliance](compliance.md)
2. [Sources, cartographie et coûts comparés](sources-and-costs.md)
3. [Architecture, matrice, ingestion, provenance et synchronisation](architecture.md)
4. [PostgreSQL/PostGIS et requêtes proposées](database.md)
5. [API admin et publique, exploitation et tests](api-and-operations.md)
6. [Validation du code livré](validation.md)

**Implémenté ici :** noyau TypeScript hors ligne `src/osm/domain/` : identité composite sûre, adaptation de réponses Overpass, normalisation, avertissements qualité, classification des doublons à partir de critères fournis, politique de proposition de refresh ; tests sans Internet. Il n'effectue aucun appel réseau ni écriture DB.

**Conçu, non activé :** pipeline PBF, worker, tables et API admin, import et refresh persistants, requêtes PostGIS, quotas, export ODbL, MapLibre et fournisseur de tuiles. Le catalogue NestJS actuel utilise encore des fixtures. Aucun frontend modifié. Le module Google existant reste non monté et optionnel ; ses restrictions ne sont pas celles d'OSM.

Ce dossier devient la référence pour **le choix de la source de découverte**. Le [dossier général](../architecture/README.md) continue de définir menus, plats, prix, avis et autres domaines. Le [dossier Google](../google-places/README.md) conserve sa valeur pour un éventuel adaptateur Google, sans faire de Google un prérequis.

| Livrables obligatoires | Emplacement |
|---|---|
| 1 architecture ; 2 NestJS ; 3 module ; 4 pipeline ; 5 mapping ; 6 doublons ; 7 provenance ; 8 sync | architecture.md |
| 9 PostgreSQL ; 10 PostGIS ; 11 recherche | database.md |
| 12 MapLibre ; 13 tuiles ; 21 coûts | sources-and-costs.md |
| 14 workflow ; 15 batch ; 16 limites ; 17 cache ; 18 sécurité ; 19 observabilité ; 20 tests | api-and-operations.md |
| 22 compliance | compliance.md |
| 23 montée en charge ; 24 multi-source | architecture.md, api-and-operations.md |

## Réponse à la question finale

Pour Menu2Kin, le meilleur compromis est **une base locale alimentée par des extraits OSM régionaux et enrichie par l'équipe**, avec une petite chaîne d'import reproductible, des droits de réutilisation tracés et une validation humaine. PostgreSQL assure proximité et recherche alimentaire. Une carte MapLibre avec offre commerciale de tuiles plafonnée réduit l'entretien initial ; des tuiles régionales auto-hébergées deviennent une alternative si leur coût total est meilleur.

```text
OPEN DATA
↓
OSM INGESTION
↓
NORMALIZATION
↓
DEDUPLICATION
↓
ADMIN REVIEW
↓
MENU2KIN DATABASE
↓
POSTGIS
↓
NESTJS API
↓
FLUTTER
↓
MAPLIBRE + FOOD DISCOVERY
```

Les appels d'ingestion ne croissent pas avec les recherches mobiles. Les UUID et références uniques limitent les doublons ; les versions et contrôles humains limitent les écrasements. L'ajout terrain compense la couverture OSM. Les licences restent attachées aux données réutilisées : Menu2Kin devient l'autorité éditoriale du produit sans devenir propriétaire exclusif des données ouvertes.
