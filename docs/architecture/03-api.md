# Contrat REST V1 — architecture proposée

Contrat de conception, aucun endpoint métier branché actuellement. [OpenAPI 3.1](contracts/openapi.json) est généré depuis le même inventaire que ce document.

## Conventions globales

- Base `/api/v1`, UUID pour commandes et références, slug immutable pour détails publics. Sondes `/health`, `/readiness`, `/liveness` hors préfixe. Les liens publics `/dish/:slug`, `/restaurant/:slug`, `/menu/:slug` sont résolus par une future page web ; l’API est `/deep-links/:type/:slug`.
- Succès : `{ "data": ... }`. Liste cursor : `{ "data": [], "meta": { "nextCursor": null, "hasNextPage": false } }`. Offset : `{ "data": [], "meta": { "offset": 0, "limit": 20, "hasNextPage": false } }`. Pas de total global coûteux. 204 sans corps. POST idempotents like/favorite répondent 200 pour création et répétition. PUT avis répond 200 dans les deux cas.
- Erreur : `{ "error": { "code": "VALIDATION_ERROR", "message": "Paramètres invalides", "details": [{ "field": "rating", "code": "OUT_OF_RANGE", "message": "Entier de 1 à 5 requis" }], "requestId": "..." } }`. details=[] quand aucune précision publique ; stack/SQL jamais exposés.
- 400 validation/curseur altéré ; 401 identité/session invalide ; 403 permission/consentement ; 404 absent ou non visible ; 409 conflit version/état/clé ; 410 curseur expiré ; 413 corps trop grand ; 428 précondition manquante ; 429 quota avec Retry-After ; 500 interne ; 503 dépendance/timeout. Codes Prisma uniques/FK traduits, aucune erreur technique brute.
- Auth User = Bearer access JWT avec compte ACTIVE et session non révoquée relus. Admin = User + AdminUser.enabled + rôle autorisé + MFA < 12 h, < 5 min pour rôles/suppression compte. Identité anonyme = `X-Anonymous-Token` signé ; consentement explicite via `X-Analytics-Consent: true` et préférence compte si connecté. Header client seul ne supplante pas un refus compte.
- Tous les DTOs ont `additionalProperties: false`. ValidationPipe globale : transform=true, whitelist=true, forbidNonWhitelisted=true, forbidUnknownValues=true, validationError.target/value=false ; conversion implicite désactivée. Parsing numérique explicite et strict, booléens exactement true/false, jamais Boolean("false"). Nested ValidateNested/Type ; limites sur tableaux, profondeur et body 64 KiB. Champs inconnus des query rejetés. Cross-field checks dans services/pipes : prix min<=max, lat/lon couplés, horaires sans chevauchement, Decimal >0, parents cohérents, Patch non vide.
- Formats exacts et limites de **chaque DTO et réponse** dans `components.schemas` OpenAPI. Montants strings `"14000.00"`, dates `YYYY-MM-DD`, instants ISO8601 UTC, coordonnées/distance nombres JSON. Pas de Number pour calcul d’argent. `null` explicite pour absent, omission réservée aux champs optionnels de requête.
- Cursor HMAC signé/base64url : version, ressource, sort, last tuple, filterHash, expiresAt ; TTL 1 h, taille <=2048. UUID tie-break partout. Seek strict, limit+1 ; never offset caché. Requête suivante doit reprendre les mêmes filtres. Catalogue vivant : insertions/suppressions peuvent changer l’ensemble, aucune garantie de snapshot global ; sous tri prix, modifications peuvent déplacer un item et nécessiter rafraîchissement client. Trending snapshot figé. Offset search/geo/budget volontairement borné, résultats vivants.
- HTTP public `max-age=0,must-revalidate` pour catalogue : ETag calculé sur représentation publique et dépendances, invalidation serveur et validation des statuts **avant** 304. No-store pour auth/admin/personnel/budget. Cache applicatif peut stocker IDs/projections, jamais autoriser à lui seul un contenu retiré. Vary: Accept-Encoding ; si langue ajoutée, Vary: Accept-Language. Aucun champ privé ajouté à une réponse cacheable.
- Mutations admin : `If-Match: "v12"` pour version, ou ETag basé sur updatedAt pour tables simples ; PATCH no-op peut garder version mais aucun événement. Rubriques/catégories retournent ETag par header. DELETE admin exige `X-Audit-Reason` 10..500 caractères. PUT premier avis emploie `If-None-Match: *`, remplacement If-Match.
- Les quotas mentionnés sont des valeurs initiales configurables, fenêtrage glissant/token bucket atomique Redis. Toutes les routes protégées peuvent aussi retourner 401/403/429/503. Scope user + IP ; admin jamais exempt de quota.
- Menu expose les rubriques, plats via `GET /dishes?menuCategoryId=...` paginé ; pas de réponse menu sans borne. Maximum 50 rubriques/menu, 100 plats/menu du jour, 10 médias/plat imposés à l’écriture.

## Exemple budget canonique

La réponse expose `data[].items[0].unitPrice="14000.00"`, `quantity=2`, `total="28000.00"`, `budget="30000.00"`, `remainingBudget="2000.00"`, `pricePerPerson="14000.00"`, `people=2`, `currency="CDF"`, `distanceMeters=1250.4`, restaurant et dish typés. Les exemples numériques du cahier des charges sont remplacés par des strings monétaires pour préserver la précision.

## Endpoints

### POST /api/v1/anonymous-sessions

**Purpose:** Créer une identité anonyme signée pour intentions et quotas.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 201 ; data: AnonymousSession.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Token signé 24 h ; aucun droit utilisateur ; ne prouve pas une personne unique..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 10/heure/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/otp/request

**Purpose:** Demander un code téléphone.

**Auth:** Public.

**Query:** Aucune.

**Body:** RequestOtp (components.schemas OpenAPI).

**Response:** 202 ; data: OtpChallenge.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Réponse uniforme, cooldown 60 s, challenge expirant en 300 s..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 3/15 min/téléphone + 10/heure/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/otp/verify

**Purpose:** Consommer un code et ouvrir une session.

**Auth:** Public.

**Query:** Aucune.

**Body:** VerifyOtp (components.schemas OpenAPI).

**Response:** 200 ; data: Tokens.

**Errors:** 400 VALIDATION_ERROR ; 401 INVALID_OTP ; 429 RATE_LIMITED.

**Business rules:** Challenge consommé atomiquement ; account suspendu/supprimé refuse la session..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 5/challenge + 20/heure/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/google

**Purpose:** Connexion Google.

**Auth:** Public.

**Query:** Aucune.

**Body:** GoogleLogin (components.schemas OpenAPI).

**Response:** 200 ; data: Tokens.

**Errors:** 400 VALIDATION_ERROR ; 401 INVALID_IDENTITY.

**Business rules:** Valider issuer/audience/expiration/nonce/sub ; aucune fusion par email ou téléphone non prouvé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/heure/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/admin/exchange

**Purpose:** Échanger une identité MFA du fournisseur admin.

**Auth:** Public.

**Query:** Aucune.

**Body:** AdminLogin (components.schemas OpenAPI).

**Response:** 200 ; data: Tokens.

**Errors:** 401 INVALID_IDENTITY ; 403 ADMIN_ACCESS_DENIED.

**Business rules:** Issuer admin séparé configuré, acr/amr MFA attestés ; utilisateur AdminUser déjà provisionné ; ne jamais croire un booléen MFA client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 10/heure/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/refresh

**Purpose:** Rotation du refresh opaque.

**Auth:** Public.

**Query:** Aucune.

**Body:** Refresh (components.schemas OpenAPI).

**Response:** 200 ; data: Tokens.

**Errors:** 401 INVALID_REFRESH ; 401 SESSION_REVOKED ; 429 RATE_LIMITED.

**Business rules:** Verrou session ; replay connu révoque famille ; expiration absolue 30 jours..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/IP.

**Analytics:** Aucun.

### POST /api/v1/auth/logout

**Purpose:** Révoquer la session courante.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Idempotent ; vider association device de cette installation si prouvée ; client efface tokens..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/user.

**Analytics:** Aucun.

### GET /api/v1/auth/sessions

**Purpose:** Lister ses sessions actives.

**Auth:** User.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Session[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** Aucun.

### DELETE /api/v1/auth/sessions/{id}

**Purpose:** Révoquer une session personnelle.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND.

**Business rules:** Propriété obligatoire ; révocation de toutes ses valeurs refresh..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/user.

**Analytics:** Aucun.

### GET /api/v1/users/me

**Purpose:** Lire son profil.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: User.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/user.

**Analytics:** Aucun.

### PATCH /api/v1/users/me

**Purpose:** Modifier nom et préférences.

**Auth:** User.

**Query:** Aucune.

**Body:** ProfilePatch (components.schemas OpenAPI).

**Response:** 200 ; data: User.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Champs inconnus refusés ; au moins une propriété ; aucun rôle/statut/téléphone dans ce DTO..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/user.

**Analytics:** Aucun.

### DELETE /api/v1/users/me

**Purpose:** Demander suppression et révoquer immédiatement.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 202 ; data: Ack.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Réauth < 5 min ; soft delete immédiat, anonymisation/purge asynchrone documentée..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 3/jour/user.

**Analytics:** Aucun.

### POST /api/v1/users/me/phone-change/request

**Purpose:** Prouver le nouveau téléphone.

**Auth:** User.

**Query:** Aucune.

**Body:** RequestOtp (components.schemas OpenAPI).

**Response:** 202 ; data: OtpChallenge.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Réauth < 5 min, challenge PHONE_CHANGE lié userId ; ancien téléphone conservé jusqu’au succès..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 3/15 min/user + téléphone.

**Analytics:** Aucun.

### POST /api/v1/users/me/phone-change/confirm

**Purpose:** Appliquer un téléphone vérifié.

**Auth:** User.

**Query:** Aucune.

**Body:** VerifyOtp (components.schemas OpenAPI).

**Response:** 200 ; data: Tokens.

**Errors:** 401 INVALID_OTP ; 409 PHONE_IN_USE.

**Business rules:** Transaction téléphone unique + consommation OTP + révocation des anciennes sessions + nouvelle session..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 5/challenge.

**Analytics:** Aucun.

### GET /api/v1/restaurants

**Purpose:** Lister les restaurants.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque, commune, neighborhood, status=ACTIVE|TEMPORARILY_CLOSED, openNow, sort=recent.

**Body:** Aucun.

**Response:** 200 ; data: RestaurantSummary[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** ACTIVE par défaut ; visibilité relue ; tri createdAt DESC,id DESC..

**Pagination:** Cursor.

**Caching:** public max-age=0, ETag ; cache serveur IDs 30 s.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/restaurants/{slug}

**Purpose:** Lire un restaurant public.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Restaurant.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** TEMPORARILY_CLOSED/PERMANENTLY_CLOSED accessibles avec statut ; DRAFT/INACTIVE/deleted ⇒ 404..

**Pagination:** Aucune.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/restaurants/{id}/menus

**Purpose:** Lister les menus publiés du restaurant.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Menu[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Retour rubriques sans tous les plats ; plats paginés via /dishes?menuCategoryId= ; ordre position,id..

**Pagination:** Cursor.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/menus/{slug}

**Purpose:** Lire un menu public et ses rubriques.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Menu.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Max 50 rubriques ; toutes publiables ; aucun arbre illimité de plats..

**Pagination:** Aucune.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/dishes

**Purpose:** Lister les plats.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque, restaurantId, menuCategoryId, categoryId, minPriceCdf, maxPriceCdf, availability, sort=recent|priceAsc.

**Body:** Aucun.

**Response:** 200 ; data: Dish[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Tri recent (createdAt,id) ou priceAsc (priceCdf,id), filtres liés au curseur ; visibilité ancêtres..

**Pagination:** Cursor.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/dishes/{slug}

**Purpose:** Lire un plat et ses prix.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Dish.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Sans likedByMe dans réponse publique ; état personnel via favoris/likes personnels..

**Pagination:** Aucune.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Vue qualifiée via endpoint analytics consenti.

### GET /api/v1/users/me/likes

**Purpose:** Lister les plats aimés.

**Auth:** User.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Dish[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Contenus retirés omis ; curseur avance sur relations, pas taille résultats visibles..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/user.

**Analytics:** Aucun.

### GET /api/v1/categories

**Purpose:** Lister les catégories visibles.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Category[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Liste bornée 500, sans curseur.

**Caching:** public max-age=60 ; Redis 3600 s.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/daily-menus

**Purpose:** Menus actuels de Kinshasa.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque, restaurantId, commune.

**Body:** Aucun.

**Response:** 200 ; data: DailyMenu[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Date courante seulement, now dans intervalle ; filtres items disponibles et visibilité ; max 100 items..

**Pagination:** Cursor.

**Caching:** public max-age=0, ETag ; serveur min(30s, expiration).

**Rate limit:** 120/min/IP.

**Analytics:** DAILY_MENU_VIEW via analytics consenti.

### GET /api/v1/search

**Purpose:** Rechercher plats/restaurants/catégories.

**Auth:** Public.

**Query:** limit=20 (1..50), offset=0 (0..1000), q (2..120), type=dish|restaurant|category|all, commune, categoryId, maxPriceCdf, latitude [-90,90], longitude [-180,180], radiusMeters [100,20000] ; coordonnées appariées.

**Body:** Aucun.

**Response:** 200 ; data: SearchResult.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Sections indépendantes ; meta.sections contient hasNextPage par section ; normalisation/synonymes versionnés..

**Pagination:** Offset par section, borné à 1000.

**Caching:** Redis 30 s uniquement sans geo ; HTTP no-store.

**Rate limit:** 60/min/IP.

**Analytics:** SEARCH côté serveur si consentement.

### GET /api/v1/search/autocomplete

**Purpose:** Proposer des termes et ressources.

**Auth:** Public.

**Query:** q (2..80), limit=10 (1..10).

**Body:** Aucun.

**Response:** 200 ; data: Suggestion[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Préfixe puis fuzzy, q=1 refusé..

**Pagination:** Liste bornée 10, sans curseur.

**Caching:** Redis 30 s sans coordonnées.

**Rate limit:** 60/min/IP.

**Analytics:** Aucun.

### GET /api/v1/nearby

**Purpose:** Restaurants ou plats dans le rayon.

**Auth:** Public.

**Query:** limit=20 (1..50), offset=0 (0..1000), latitude [-90,90], longitude [-180,180], radiusMeters [100,20000] ; coordonnées appariées, type=restaurant|dish, maxPriceCdf, openNow.

**Body:** Aucun.

**Response:** 200 ; data: NearbyResult[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Coordonnées/rayon requis ; ST_DWithin, tri distance brute puis id ; max 50..

**Pagination:** Offset.

**Caching:** no-store.

**Rate limit:** 60/min/IP.

**Analytics:** Aucun.

### POST /api/v1/budget/search

**Purpose:** Proposer des quantités de plat sous budget.

**Auth:** Public.

**Query:** Aucune.

**Body:** BudgetSearch (components.schemas OpenAPI).

**Response:** 200 ; data: BudgetProposal[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Montants string CDF, portions connues, plat principal, total exact ≤ budget ; min budget 1.00 max 10000000.00 contrôlés en service..

**Pagination:** Offset dans le body, limite 20.

**Caching:** no-store.

**Rate limit:** 20/min/IP.

**Analytics:** BUDGET_SEARCH consenti, montant bucketisé.

### GET /api/v1/trending

**Purpose:** Lire un classement figé.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque, commune.

**Body:** Aucun.

**Response:** 200 ; data: TrendingDish[].

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE ; 410 CURSOR_EXPIRED.

**Business rules:** Même snapshot jusqu’à fin pagination ; les retraits ne sont jamais servis..

**Pagination:** Cursor snapshot (1 h).

**Caching:** Redis 900 s ; revalidation DB, HTTP max-age=0.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/recommendations

**Purpose:** Suggestions éditoriales et tendances locales.

**Auth:** Public.

**Query:** commune, limit=20 (1..20).

**Body:** Aucun.

**Response:** 200 ; data: Recommendation[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Sans personnalisation comportementale V1 ; max 3 plats par restaurant..

**Pagination:** Liste bornée 20, sans curseur.

**Caching:** Redis 30 s ; HTTP max-age=0.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### POST /api/v1/dishes/{id}/like

**Purpose:** Aimer un plat.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: LikeState.

**Errors:** 401 UNAUTHORIZED ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED.

**Business rules:** Idempotent, compteur exact au commit ; POST exige visibilité, DELETE accepte retrait privé même caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user + 120/min/IP.

**Analytics:** LIKE serveur seulement si relation change.

### POST /api/v1/dishes/{id}/favorite

**Purpose:** Sauvegarder.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: FavoriteState.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Idempotent, cible existante ; DELETE ne révèle aucun contenu caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** FAVORITE serveur seulement si changement.

### POST /api/v1/restaurants/{id}/favorite

**Purpose:** Sauvegarder.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: FavoriteState.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Idempotent, cible existante ; DELETE ne révèle aucun contenu caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** FAVORITE serveur seulement si changement.

### DELETE /api/v1/dishes/{id}/like

**Purpose:** Retirer son like.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: LikeState.

**Errors:** 401 UNAUTHORIZED ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED.

**Business rules:** Idempotent, compteur exact au commit ; POST exige visibilité, DELETE accepte retrait privé même caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user + 120/min/IP.

**Analytics:** LIKE serveur seulement si relation change.

### DELETE /api/v1/dishes/{id}/favorite

**Purpose:** Retirer un favori.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: FavoriteState.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Idempotent, cible existante ; DELETE ne révèle aucun contenu caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** FAVORITE serveur seulement si changement.

### DELETE /api/v1/restaurants/{id}/favorite

**Purpose:** Retirer un favori.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: FavoriteState.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Idempotent, cible existante ; DELETE ne révèle aucun contenu caché..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** FAVORITE serveur seulement si changement.

### GET /api/v1/users/me/favorites

**Purpose:** Lire ses favoris.

**Auth:** User.

**Query:** limit=20 (1..50), cursor opaque, type=dish|restaurant.

**Body:** Aucun.

**Response:** 200 ; data: Favorite[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Tombstones pour ressources retirées ; tri createdAt DESC,id DESC..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/user.

**Analytics:** Aucun.

### POST /api/v1/shares

**Purpose:** Enregistrer une intention et retourner le lien.

**Auth:** Public + Anonymous ou User.

**Query:** Aucune.

**Body:** ShareWrite (components.schemas OpenAPI).

**Response:** 200 ; data: ShareResult.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 IDEMPOTENCY_CONFLICT ; 429 RATE_LIMITED.

**Business rules:** Idempotence actorHash/requestId 30 jours ; même clé autre body 409 ; qualifié max une cible/jour/acteur ; compteur dans transaction..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/acteur + 60/min/IP.

**Analytics:** SHARE serveur seulement, pas preuve envoi.

### GET /api/v1/restaurants/{id}/reviews

**Purpose:** Lire les avis publiés.

**Auth:** Public.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Review[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** PUBLISHED seulement ; tri publishedAt DESC,id DESC ; moyenne restaurant déjà agrégée..

**Pagination:** Cursor.

**Caching:** public max-age=0, ETag ; serveur 30 s.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### PUT /api/v1/restaurants/{id}/reviews/me

**Purpose:** Créer ou remplacer son avis restaurant.

**Auth:** User.

**Query:** Aucune.

**Body:** ReviewWrite (components.schemas OpenAPI).

**Response:** 200 ; data: Review.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 REVIEW_LOCKED ; 409 VERSION_CONFLICT.

**Business rules:** Une paire user/restaurant ; état PENDING ; If-Match version existante, If-None-Match:* pour création ; HIDDEN/FLAGGED refusés..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 5 créations/heure/user, 20 modifications/heure/user.

**Analytics:** REVIEW_CREATED serveur si première création.

### DELETE /api/v1/reviews/{id}

**Purpose:** Supprimer son avis.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Propriétaire, soft delete idempotent et retrait agrégat transactionnel ; contenu caché supprimable par auteur..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/heure/user.

**Analytics:** Aucun.

### GET /api/v1/users/me/reviews

**Purpose:** Lire ses avis et leur état.

**Auth:** User.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Review[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/user.

**Analytics:** Aucun.

### POST /api/v1/reviews/{id}/reports

**Purpose:** Signaler un avis.

**Auth:** User.

**Query:** Aucune.

**Body:** ReportWrite (components.schemas OpenAPI).

**Response:** 200 ; data: Report.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Unique reporter/review, upsert idempotent ; pas de masquage automatique ; son propre avis non signalable..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 10/jour/user.

**Analytics:** Aucun.

### GET /api/v1/notifications

**Purpose:** Lire son inbox.

**Auth:** User.

**Query:** limit=20 (1..50), cursor opaque.

**Body:** Aucun.

**Response:** 200 ; data: Notification[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/user.

**Analytics:** Aucun.

### PATCH /api/v1/notifications/{id}

**Purpose:** Marquer comme lue.

**Auth:** User.

**Query:** Aucune.

**Body:** NotificationRead (components.schemas OpenAPI).

**Response:** 200 ; data: Notification.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Owner only ; readAt premier instant de lecture conservé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/user.

**Analytics:** Aucun.

### PUT /api/v1/notifications/devices/{installationId}

**Purpose:** Enregistrer ou renouveler un device FCM.

**Auth:** User.

**Query:** Aucune.

**Body:** DeviceWrite (components.schemas OpenAPI).

**Response:** 200 ; data: DeviceResult.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Token chiffré, pas dans réponse ; preuve d’installation et réauth requises pour transfert compte, sinon 409..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 10/heure/user.

**Analytics:** Aucun.

### DELETE /api/v1/notifications/devices/{installationId}

**Purpose:** Désactiver son appareil.

**Auth:** User.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Propriété obligatoire ; DELETE idempotent ; ne pas désactiver appareil d’un autre compte..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/user.

**Analytics:** Aucun.

### POST /api/v1/analytics/events

**Purpose:** Collecter les interactions client autorisées.

**Auth:** Public + Anonymous ou User.

**Query:** Aucune.

**Body:** AnalyticsBatch (components.schemas OpenAPI).

**Response:** 202 ; data: Ack.

**Errors:** 400 VALIDATION_ERROR ; 403 CONSENT_REQUIRED ; 429 RATE_LIMITED.

**Business rules:** Consentement vérifié côté serveur ; champs metadata allowlist par kind, pas de likes/shares/reviews client ; id unique, acteur calculé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/acteur ; 20 événements/batch.

**Analytics:** Aucun.

### GET /api/v1/deep-links/{type}/{slug}

**Purpose:** Résoudre une ressource publique.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: DeepLink.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** type dish/restaurant/menu ; URL canonique PUBLIC_BASE_URL ; pas d’open redirect..

**Pagination:** Aucune.

**Caching:** public max-age=0, ETag.

**Rate limit:** 120/min/IP.

**Analytics:** Aucun.

### GET /api/v1/admin/restaurants

**Purpose:** Lister le catalogue éditorial restaurants.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminRestaurant[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/restaurants/{id}

**Purpose:** Lire une ressource éditoriale restaurants.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminRestaurant.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/restaurants

**Purpose:** Créer restaurants.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** RestaurantWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminRestaurant.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/restaurants/{id}

**Purpose:** Modifier restaurants.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** RestaurantPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminRestaurant.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/restaurants/{id}

**Purpose:** Retirer restaurants.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/menus

**Purpose:** Lister le catalogue éditorial menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminMenu[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/menus/{id}

**Purpose:** Lire une ressource éditoriale menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminMenu.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/menus

**Purpose:** Créer menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** MenuWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminMenu.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/menus/{id}

**Purpose:** Modifier menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** MenuPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminMenu.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/menus/{id}

**Purpose:** Retirer menus.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/menus/{id}/publication

**Purpose:** Changer état de publication menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Publish (components.schemas OpenAPI).

**Response:** 200 ; data: AdminMenu.

**Errors:** 409 PUBLICATION_INVALID ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match, préconditions de publication, audit/outbox ; pas d’envoi push dans la transaction..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/menu-categories

**Purpose:** Lister le catalogue éditorial menu-categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminMenuCategory[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/menu-categories/{id}

**Purpose:** Lire une ressource éditoriale menu-categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminMenuCategory.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/menu-categories

**Purpose:** Créer menu-categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** MenuCategoryWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminMenuCategory.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/menu-categories/{id}

**Purpose:** Modifier menu-categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** MenuCategoryPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminMenuCategory.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/menu-categories/{id}

**Purpose:** Retirer menu-categories.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/dishes

**Purpose:** Lister le catalogue éditorial dishes.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminDish[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/dishes/{id}

**Purpose:** Lire une ressource éditoriale dishes.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminDish.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/dishes

**Purpose:** Créer dishes.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** DishWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminDish.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/dishes/{id}

**Purpose:** Modifier dishes.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** DishPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminDish.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/dishes/{id}

**Purpose:** Retirer dishes.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/dishes/{id}/publication

**Purpose:** Changer état de publication dishes.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Publish (components.schemas OpenAPI).

**Response:** 200 ; data: AdminDish.

**Errors:** 409 PUBLICATION_INVALID ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match, préconditions de publication, audit/outbox ; pas d’envoi push dans la transaction..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/categories

**Purpose:** Lister le catalogue éditorial categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminCategory[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/categories/{id}

**Purpose:** Lire une ressource éditoriale categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminCategory.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/categories

**Purpose:** Créer categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** CategoryWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminCategory.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/categories/{id}

**Purpose:** Modifier categories.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** CategoryPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminCategory.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/categories/{id}

**Purpose:** Retirer categories.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/daily-menus

**Purpose:** Lister le catalogue éditorial daily-menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status, restaurantId, includeDeleted=false.

**Body:** Aucun.

**Response:** 200 ; data: AdminDailyMenu[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu..

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/daily-menus/{id}

**Purpose:** Lire une ressource éditoriale daily-menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: AdminDailyMenu.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/daily-menus

**Purpose:** Créer daily-menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** DailyMenuWrite (components.schemas OpenAPI).

**Response:** 201 ; data: AdminDailyMenu.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/daily-menus/{id}

**Purpose:** Modifier daily-menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** DailyMenuPatch (components.schemas OpenAPI).

**Response:** 200 ; data: AdminDailyMenu.

**Errors:** 400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/daily-menus/{id}

**Purpose:** Retirer daily-menus.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 204 ; aucun corps.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/daily-menus/{id}/publication

**Purpose:** Changer état de publication daily-menus.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Publish (components.schemas OpenAPI).

**Response:** 200 ; data: AdminDailyMenu.

**Errors:** 409 PUBLICATION_INVALID ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match, préconditions de publication, audit/outbox ; pas d’envoi push dans la transaction..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/reviews

**Purpose:** File des avis à modérer.

**Auth:** Admin: MODERATOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status=PENDING|PUBLISHED|FLAGGED|HIDDEN|DELETED.

**Body:** Aucun.

**Response:** 200 ; data: Review[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/reviews/{id}

**Purpose:** Modérer un avis.

**Auth:** Admin: MODERATOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** ModerateReview (components.schemas OpenAPI).

**Response:** 200 ; data: Review.

**Errors:** 409 INVALID_TRANSITION ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED.

**Business rules:** If-Match, transitions fermées, raison, verrou restaurant puis review et agrégats dans transaction..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/reports

**Purpose:** File des signalements.

**Auth:** Admin: MODERATOR|ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status=OPEN|DISMISSED|ACTIONED.

**Body:** Aucun.

**Response:** 200 ; data: Report[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 120/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/reports/{id}

**Purpose:** Clore un signalement.

**Auth:** Admin: MODERATOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** ResolveReport (components.schemas OpenAPI).

**Response:** 200 ; data: Report.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Transition OPEN seulement, CAS statut en DB ; audit raison, ne change pas implicitement Review..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/users

**Purpose:** Lister les comptes.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, status=ACTIVE|SUSPENDED|DELETED.

**Body:** Aucun.

**Response:** 200 ; data: AdminUser[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### PATCH /api/v1/admin/users/{id}/status

**Purpose:** Suspendre ou réactiver.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** UserStatus (components.schemas OpenAPI).

**Response:** 200 ; data: AdminUser.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Ne pas modifier supérieur/soi-même/dernier superadmin ; suspension révoque sessions et déclenche retrait avis ; compte supprimé terminal..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### PUT /api/v1/admin/users/{id}/role

**Purpose:** Attribuer/retirer rôle admin.

**Auth:** Admin: SUPER_ADMIN.

**Query:** Aucune.

**Body:** AdminRole (components.schemas OpenAPI).

**Response:** 200 ; data: AdminUser.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** MFA < 5 min, verrou des superadmins ; interdire de retirer le dernier actif ; révocation sessions cible, audit..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 10/heure/admin.

**Analytics:** Aucun.

### GET /api/v1/admin/audit-logs

**Purpose:** Lire l’audit expurgé.

**Auth:** Admin: ADMIN|SUPER_ADMIN.

**Query:** limit=20 (1..50), cursor opaque, resourceType, resourceId, actorId.

**Body:** Aucun.

**Response:** 200 ; data: AuditLog[].

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Conventions globales ; validation, visibilité et propriété appliquées.

**Pagination:** Cursor.

**Caching:** no-store.

**Rate limit:** 60/min/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/media/uploads

**Purpose:** Créer une intention upload signée.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** UploadRequest (components.schemas OpenAPI).

**Response:** 201 ; data: Upload.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Preset restrictif, publicId réservé, overwrite=false, expiry intention 10 min ; signature fournisseur peut rester valide plus longtemps..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/heure/admin.

**Analytics:** Aucun.

### POST /api/v1/admin/media/{id}/confirm

**Purpose:** Vérifier un fichier Cloudinary.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** UploadConfirm (components.schemas OpenAPI).

**Response:** 200 ; data: Media.

**Errors:** 400 VALIDATION_ERROR ; 429 RATE_LIMITED.

**Business rules:** Metadata provider obligatoire, JPEG/PNG/WebP, <=8 MiB, 1..6000px et <=24 MP ; rejeter ressources expirées ; idempotent READY..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 30/min/admin.

**Analytics:** Aucun.

### DELETE /api/v1/admin/media/{id}

**Purpose:** Supprimer un média sans référence.

**Auth:** Admin: EDITOR|ADMIN|SUPER_ADMIN.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 202 ; data: Ack.

**Errors:** 404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE.

**Business rules:** 409 si encore associé ; DELETING + outbox ; worker provider puis DELETED..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** 20/min/admin.

**Analytics:** Aucun.

### GET /liveness

**Purpose:** Vérifier le processus vivant.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Health.

**Errors:** 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Sondes hors /api/v1 ; aucune URL interne/secret/version package en réponse..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** Quota proxy ; probes internes exemptées.

**Analytics:** Aucun.

### GET /readiness

**Purpose:** Vérifier disponibilité DB et quotas Redis.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Health.

**Errors:** 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Sondes hors /api/v1 ; aucune URL interne/secret/version package en réponse..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** Quota proxy ; probes internes exemptées.

**Analytics:** Aucun.

### GET /health

**Purpose:** Résumé de santé minimal.

**Auth:** Public.

**Query:** Aucune.

**Body:** Aucun.

**Response:** 200 ; data: Health.

**Errors:** 503 DEPENDENCY_UNAVAILABLE.

**Business rules:** Sondes hors /api/v1 ; aucune URL interne/secret/version package en réponse..

**Pagination:** Aucune.

**Caching:** no-store.

**Rate limit:** Quota proxy ; probes internes exemptées.

**Analytics:** Aucun.
