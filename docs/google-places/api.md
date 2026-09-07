# Contrat admin proposé — non exposé actuellement

Préfixe `/api/v1`. Auth commune : JWT valide + compte admin actif + permission explicite `places:discover` pour lire Google, `restaurants:write` pour importer/lier/modifier, `restaurants:review` pour publier. L'identité vient du token, jamais du body. Aucun accès anonyme ou Flutter public. Validation whitelist stricte, champs inconnus rejetés. Réponses contenant Google : `Cache-Control: private, no-store`, pas de cache CDN, service worker ou persistance cliente.

## Endpoints

Les limites ci-dessous sont des plafonds **Menu2Kin proposés**, par admin et minute, cumulés avec les limites globales du document exploitation. Chaque appel fournisseur réserve aussi le budget global. `G` = erreurs fournisseur du tableau plus bas ; toutes les routes peuvent retourner 400 validation, 401, 403 et 429 local.

| Méthode et chemin | Permission | Entrée | Sortie | Autres erreurs | Limite | Appels Google | Effets DB |
|---|---|---|---|---|---:|---|---|
| POST `/admin/google-places/search` | discover | query, latitude, longitude, radiusMeters, pageToken? | previews[], nextPageToken? | G | 10/min | 1 Text Search/page demandée | aucun |
| POST `/admin/google-places/nearby-search` | discover | latitude, longitude, radiusMeters | previews[] | G | 10/min | 1 Nearby | aucun |
| GET `/admin/google-places/places/:googlePlaceId` | discover | profile=identity ou contact | preview attribué | G | 20/min | 1 Details | aucun |
| POST `/admin/google-places/imports` | write + discover | googlePlaceId ; Idempotency-Key | référence + outcome EXISTING ou NEEDS_INDEPENDENT_DATA | G,409 | 5/min | 0 si ID connu ; sinon 1 Details | référence ID seule + audit |
| POST `/admin/google-places/duplicate-checks` | write | googlePlaceId?, independentIdentity? + provenance | EXACT_MATCH, PROBABLE_MATCH, NO_MATCH ou INSUFFICIENT_DATA ; candidats internes | 422 | 20/min | 0 | aucun |
| POST `/admin/restaurant-drafts` | write | referenceId?, faits indépendants, provenance ; Idempotency-Key | Restaurant DRAFT, UUID | 409,422 | 5/min | 0 | restaurant + liaison + audit transactionnels |
| POST `/admin/google-place-references/:id/link` | write | restaurantId UUID, expectedVersion, motif | référence liée | 404,409 | 5/min | 0 | liaison et audit transactionnels |
| POST `/admin/restaurants/:id/google-refresh-preview` | write + discover | referenceId, profile | comparaison transitoire, canApplyToCanonical=false | 404,G | 5/min | 1 Details | lastCheckedAt ou invalidSince ; audit sans contenu |
| PATCH `/admin/restaurants/:id` | write | champs propres et provenance ; If-Match | restaurant et nouvelle version | 404,409,422 | 20/min | 0 | modification métier et audit |
| POST `/admin/restaurants/:id/submit-review` | write | expectedVersion | PENDING_REVIEW | 404,409,422 | 5/min | 0 | statut, audit |
| POST `/admin/restaurants/:id/publish` | review | expectedVersion | PUBLISHED | 404,409,422 | 5/min | 0 | statut, audit après vérification et contenu requis |

GET Details est une lecture payante, jamais un endpoint préchargé pour chaque résultat. Les actions d'écriture utilisent POST/PATCH, jamais GET. L'import est nommé au pluriel comme ressource de commande ; il ne promet pas un restaurant complet si seul un Place ID est fourni. Le linking refuse de déplacer silencieusement une référence déjà liée à un autre restaurant.

## DTO et pagination

`query` : chaîne trimée 2–120 caractères ; latitude finie [-90,90] ; longitude [-180,180] ; rayon 100–10 000 mètres, limite produit. `googlePlaceId` : chaîne non vide, caractères alphanumériques/underscore/tiret, plafond défensif interne 512 caractères, pas une limite Google annoncée. `pageToken` opaque 1–4096 caractères, jamais logué. Les UUID internes sont validés séparément. `profile` est une enum fermée ; aucun field mask ou URL fourni par l'appelant.

Text Search utilise un **biais** circulaire : des résultats peuvent être hors rayon. Il convient à « restaurants à Gombe » ; ce n'est pas une garantie administrative de commune. Nearby utilise une **restriction** circulaire et sert la recherche autour d'un point. Tous deux demandent 10 résultats. Seul Text Search expose un nextPageToken ; pas de pagination Nearby, pas de balayage de tuiles pour aspirer une zone. Une page supplémentaire implique un appel volontaire et conserve les paramètres initiaux. Une continuation rejetée est signalée, sans boucler ni inventer une durée de validité du token. Aucun appel Details automatique sur la liste. [Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search).

## Masques fixes du client livré

| Opération | X-Goog-FieldMask | Raison |
|---|---|---|
| Text Search | `places.id,places.displayName,places.formattedAddress,places.location,places.attributions,nextPageToken` | identifier, différencier les résultats dans la preview, attribuer et paginer |
| Nearby Search | `places.id,places.displayName,places.formattedAddress,places.location,places.attributions` | même preview, sans pagination |
| Details identity | `id,displayName,formattedAddress,location,types,attributions` | vérifier la sélection et présenter son contexte ; types ne deviennent pas des catégories culinaires |
| Details contact, explicite | masque identity + `internationalPhoneNumber,regularOpeningHours` | comparaison ponctuelle du contact/horaires uniquement |

`name` est le nom technique de ressource, pas le libellé humain : utiliser `displayName`. Pas de `*`, photos, reviews, rating, editorialSummary, websiteUri ou menu. Les masques de recherche ont le préfixe `places.`, ceux de Details ne l'ont pas. `displayName`/location conduisent au niveau Pro pour les opérations concernées ; téléphone/horaires demandent Enterprise en Details. Le masque minimal visuel n'est donc pas nécessairement le SKU le moins cher. La facturation suit le niveau le plus élevé demandé ; vérifier tarifs et quotas du projet avant activation. [Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details), [facturation](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing).

## Erreurs admin stables

Enveloppe **proposée** : `{ error: { code, message, requestId, retryable } }`. Les codes du client sont déjà implémentés ; le mapping HTTP ci-dessous reste à réaliser dans la présentation admin. Ne pas renvoyer un corps Google brut.

| Situation | Code client | HTTP admin proposé | Comportement |
|---|---|---:|---|
| fonctionnalité désactivée/clé absente | GOOGLE_DISABLED | 503 | recherche désactivée, pas d'appel |
| entrée locale invalide | GOOGLE_INVALID_INPUT | 400 | corriger la demande |
| fournisseur 400 malgré DTO valide | GOOGLE_INVALID_INPUT | 502 | journaliser code/opération, diagnostic serveur ; distinguer au niveau application |
| clé invalide / fournisseur 401 ou 403 | GOOGLE_ACCESS_DENIED | 503 | alerte configuration ; pas de détail secret |
| fournisseur 429 | GOOGLE_QUOTA_EXCEEDED | 503 | message quota externe atteint ; retryable après délai opérationnel |
| limite locale | ADMIN_RATE_LIMITED (application) | 429 | Retry-After calculé par limiteur |
| fournisseur 404 | GOOGLE_NOT_FOUND | 404 | référence éventuellement invalide ; restaurant conservé |
| réseau / panne fournisseur | GOOGLE_UNAVAILABLE | 503 | aucune liste vide simulée |
| délai dépassé | GOOGLE_TIMEOUT | 504 | réessai manuel, aucune boucle automatique |
| JSON, taille ou forme incorrects | GOOGLE_INVALID_RESPONSE | 502 | résultat rejeté |

Le client ne réessaie pas automatiquement. Toute politique future de retry doit compter chaque tentative dans les quotas. Une absence d'optional field est normale ; un ID absent ou un champ présent mal formé est une réponse invalide. L'absence de `places` représente une liste vide dans une réponse Google valide.
