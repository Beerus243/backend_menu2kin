# Sources officielles

Consultées le **7 septembre 2026**. Facturation RDC/hors EEE confirmée par l'utilisateur. Vérifier les versions applicables au contrat réel et toute clause négociée avant activation ; les choix conservateurs du dossier ne constituent pas une licence supplémentaire.

| Source | Point utilisé |
|---|---|
| [Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) | §3.2.3 : extraction, cache et création de contenu ; interdiction explicite de certaines analyses avec coordonnées Places |
| [Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms) | A.3 identifiants ; B.14 Places API Legacy/New : affichage sans carte, restriction cartes non Google, exception temporaire lat/lon de 30 jours consécutifs |
| [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) | conservation Place IDs, Google Maps et attributions tierces, conditions de présentation et confidentialité |
| [Text Search New](https://developers.google.com/maps/documentation/places/web-service/text-search) | POST, biais géographique, pagination, masques et champs |
| [Nearby Search New](https://developers.google.com/maps/documentation/places/web-service/nearby-search) | restriction circulaire, types, maximum de résultats, masques |
| [Place Details New](https://developers.google.com/maps/documentation/places/web-service/place-details) | GET par ID, niveaux de champs, téléphone/horaires, préfixes de masque |
| [Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id) | identifiants susceptibles de changer, recommandation de rafraîchir ceux âgés de plus de 12 mois |
| [Usage and billing](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing) | quotas et facturation selon opération et niveau de champs |
| [Place Photos New](https://developers.google.com/maps/documentation/places/web-service/place-photos) | ressources photos expirables/non cachables et attribution des auteurs |
| [API security best practices](https://developers.google.com/maps/api-security-best-practices) | restrictions de clés et protection des appels serveur |
| [EEA service terms](https://cloud.google.com/terms/maps-platform/eea/maps-service-terms) | régime distinct consulté pour éviter d'appliquer ses règles à un compte RDC |

Ne pas généraliser l'exception de cache lat/lon à une fiche complète ; ne pas confondre conservation d'identifiant et conservation du contenu. L'exception concernant une adresse sélectionnée par un utilisateur pour sa transaction ne sert pas de fondement à un catalogue de POI.

Décisions propres à Menu2Kin, et non exigences chiffrées de Google : absence de cache de contenu V1, limite de rayon 10 km, 10 résultats demandés, timeout 4 s, plafond de réponse 256 KiB, budget initial 100 appels/jour, ID limité défensivement à 512 caractères, clé d'idempotence 24 h et absence de retry automatique.
