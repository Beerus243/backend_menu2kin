# Validation — 7 septembre 2026

## Code effectivement livré

Deux fichiers `src/osm/domain/osm-candidate.ts` et `osm-candidate.spec.ts`, sans dépendance ajoutée. Fonctions pures de validation/normalisation de JSON Overpass déjà décodé, identité composite et politique de comparaison/refresh. Aucun transport actif, aucune base raccordée, aucune route admin ni intégration Flutter ajoutée.

Le normalizer produit un candidat, jamais une entrée Prisma Restaurant. Un numéro JS déjà hors précision sûre est rejeté. Pour le futur PBF, le parseur devra produire les IDs sous forme de chaînes sans arrondi. La comparaison de doublons reçoit des scores/distances déjà calculés : le lookup PostgreSQL/PostGIS reste à réaliser. La proposition de refresh n'écrit rien et n'est pas un workflow d'approbation persistant.

## Vérifications

- `npm run lint` : réussi.
- `npm run build` : réussi.
- `npm run typecheck` : réussi.
- `tsc --noEmit -p tsconfig.test.json` : réussi.
- `npm test -- --runInBand` : **39 tests réussis**, 3 suites, dont **17 nouveaux cas OSM**.
- Les fixtures sont inventées ; aucun appel Overpass/Nominatim/Google, aucun téléchargement PBF ou de tuiles dans les tests.

Les tests HTTP existants n'ont pas été relancés pour ce complément hors ligne : AppModule, routes et catalogue ne changent pas. Les 21 tests HTTP avaient réussi au livrable précédent ; ce n'est pas une validation des routes OSM proposées.

## Limites et livrables de conception

Les six documents de conception couvrent comparaison, licence, architecture, données, carte, API, exploitation et tests à venir. SQL, tables, worker PBF, imports, géocodage, quotas, exports de base dérivée et contrats admin sont **proposés**, pas implémentés ni déclarés production-ready. Pas de migration exécutée. Aucun chiffre réel de restaurants Kinshasa fourni : la couverture nécessite un pilote sur un extrait daté et des contrôles terrain.

Sources primaires liées près des affirmations, consultées le 7 septembre 2026 : OSM/OSMF, ODbL, Overpass, Geofabrik, Planet, GeoNames, Osmium, PostGIS, dépôt MapLibre et tarifs officiels des fournisseurs de tuiles. Tarifs et politiques à revérifier à l'activation ; les limites et seuils Menu2Kin sont explicitement des choix de conception.
