# Menu2Kin — Google Places API (New)

> Le [dossier OSM](../openstreetmap/README.md) devient la cible recommandée pour la découverte à Kinshasa. Ce dossier conserve les règles du fournisseur Google, désormais entièrement optionnel.

Dossier établi le **7 septembre 2026**, compte de facturation **RDC / hors EEE**, confirmé par l'utilisateur. Périmètre backend uniquement. Les restrictions et prix doivent être revérifiés à l'activation et si les conditions du compte changent ; ce dossier n'est pas une autorisation juridique d'importer du contenu Google.

**Décision principale :** discovery Google à la demande, contenu Google transitoire attribué, référence Place ID conservée, données durables obtenues indépendamment. L'app publique utilise exclusivement les données Menu2Kin.

- [Architecture, frontière des données et matrice des champs](architecture.md)
- [Contrats admin, field masks et erreurs](api.md)
- [Données, import, doublons, refresh et SQL proposé](data.md)
- [Sécurité, quotas, exploitation, tests et feuille de route](operations.md)
- [Sources officielles consultées](sources.md)
- [Validation et état réel de l'implémentation](validation.md)

## Livré et proposé

**CODE EXÉCUTABLE TESTÉ :** `src/google-places/` contient un module NestJS injectable, client Text Search / Nearby Search / Place Details, masques fixes, transport substituable, mapping de réponses, timeouts/limite de taille, erreurs expurgées, logs structurés, projection persistable limitée au Place ID. Il n'est pas importé dans AppModule et n'a aucun controller HTTP.

**ARCHITECTURE PROPOSÉE :** endpoints admin protégés, import durable, PostgreSQL/Prisma/PostGIS, provenance et droits éditoriaux, déduplication et validation humaine. Ils ne sont pas annoncés comme implémentés. Le catalogue de démonstration actuel reste indépendant de Google. Les contraintes SQL proposées ne sont pas des migrations actives.

**FUTURE FEATURE :** autocomplete, affichage Google public, photos Google, synchronisation sous licence supplémentaire, batch, restaurant claims, API partenaire, NokiMenu, vidéo, réservation, commandes. Aucune de ces fonctionnalités n'est activée.

## Couverture des 21 livrables

| Livrables demandés | Document |
|---|---|
| 1 Architecture générale ; 2 Architecture NestJS ; 3 module ; 4 data flow ; 5 admin import flow | architecture.md, data.md |
| 6 Duplicate detection ; 7 provenance ; 8 refresh ; 9 PostgreSQL ; 10 PostGIS | data.md, schema-additions.sql |
| 11 Redis/cache ; 15 sécurité ; 16 rate limits ; 17 coûts ; 18 observabilité ; 19 tests ; 20 Docker/env ; 21 évolution | operations.md |
| 12 Contrat API ; 13 field masks ; 14 error handling | api.md |

La suite du dossier général [architecture Menu2Kin](../architecture/README.md) reste applicable aux domaines menus/plats/prix/likes/favoris/avis. Ce complément ne les remplace pas.
