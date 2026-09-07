# Catalogue des modules

Statut : architecture proposée. Tous les chemins métier sont préfixés `/api/v1` ; les sondes restent à la racine. Les endpoints sont spécifiés dans [03-api.md](03-api.md). Les repositories éventuels sont indiqués dans Database ; les DTOs dans DTOs.

## MODULE app

**Responsibility:** Composer les processus HTTP et worker.

**Entities:** Aucune.

**Controller:** Aucun.

**Endpoints:** —.

**Services:** AppModule, WorkerModule.

**DTOs:** —.

**Business rules:** Un bootstrap par processus ; shutdown gracieux.

**Database:** Aucune écriture.

**Cache:** Aucun.

**Events/jobs:** Démarrage/arrêt.

**Security:** Configuration valide avant écoute.

**Tests:** Bootstrap, fermeture du pool.

**Dependencies:** config, common, modules métier.

## MODULE config

**Responsibility:** Valider les variables et exposer une configuration typée.

**Entities:** Environment.

**Controller:** Aucun.

**Endpoints:** —.

**Services:** ConfigurationService.

**DTOs:** EnvironmentSchema.

**Business rules:** Refuser secrets par défaut en production et paramètres inconnus critiques.

**Database:** Aucune.

**Cache:** Aucun.

**Events/jobs:** —.

**Security:** Secret manager, pas de journal des valeurs.

**Tests:** Variables manquantes, invalides, environnements.

**Dependencies:** —.

## MODULE common

**Responsibility:** Infrastructure et contrats transversaux uniquement.

**Entities:** Cursor, ApiError, OutboxEvent.

**Controller:** Aucun.

**Endpoints:** —.

**Services:** PrismaService, CacheService, OutboxService, TransactionService.

**DTOs:** PageQuery, ApiErrorDto.

**Business rules:** Aucune règle métier dans les helpers.

**Database:** OutboxEvent ; clients PostgreSQL/Redis.

**Cache:** Client typé, timeout, fallback.

**Events/jobs:** Relay outbox.

**Security:** Guards, redaction, validation, correlation ID.

**Tests:** Curseur falsifié, exception Prisma, timeout cache.

**Dependencies:** config.

## MODULE auth

**Responsibility:** Identité, OTP, sessions et rotation.

**Entities:** User, Session, RefreshToken, OtpChallenge.

**Controller:** AuthController.

**Endpoints:** POST /auth/otp/request, /auth/otp/verify, /auth/google, /auth/refresh, /auth/logout ; GET/DELETE /auth/sessions.

**Services:** AuthService, OtpService, SessionService, PhoneChangeService.

**DTOs:** RequestOtpDto, VerifyOtpDto, GoogleLoginDto, RefreshDto.

**Business rules:** OTP 5 min/5 essais ; refresh 30 jours absolus ; JWT 10 min ; replay révoque la famille.

**Database:** AuthRepository ; verrous session et challenge.

**Cache:** Quotas partagés ; pas de secret OTP dans cache.

**Events/jobs:** SessionRevoked ; nettoyage expirés.

**Security:** Google iss/aud/exp/sub/nonce ; MFA admin ; pas de liaison par email.

**Tests:** OTP race, replay refresh, suspension, changement téléphone.

**Dependencies:** common, config.

## MODULE users

**Responsibility:** Profil, préférences et suppression de compte.

**Entities:** User, UserPreference.

**Controller:** UsersController.

**Endpoints:** GET/PATCH/DELETE /users/me ; POST /users/me/phone-change/{request,confirm}.

**Services:** UsersService.

**DTOs:** UpdateProfileDto, UpdatePreferencesDto, PhoneChangeDto.

**Business rules:** Identité depuis le token ; téléphone uniquement via réauth et OTP lié au compte.

**Database:** PrismaService propriétaire User/Preference.

**Cache:** No-store.

**Events/jobs:** UserDeleted, PreferencesChanged ; purge.

**Security:** Propriétaire ; révocation immédiate des sessions à suppression.

**Tests:** IDOR, champs privés absents, purge, collision téléphone.

**Dependencies:** auth, common.

## MODULE restaurants

**Responsibility:** Catalogue restaurant, état et horaires.

**Entities:** Restaurant, RestaurantContact, RestaurantOpeningHour, RestaurantOpeningException, RestaurantService.

**Controller:** RestaurantsController ; écritures via AdminCatalogController.

**Endpoints:** GET /restaurants, /restaurants/{slug}, /restaurants/{id}/menus ; /admin/restaurants.

**Services:** RestaurantsService, OpeningHoursPolicy.

**DTOs:** RestaurantQueryDto, CreateRestaurantDto, UpdateRestaurantDto, OpeningHoursDto.

**Business rules:** Statuts distincts ; coordonnées obligatoires ; exceptions prioritaires ; slug stable.

**Database:** RestaurantsRepository ; trigger geography ; contacts/horaires en transaction.

**Cache:** Liste 30 s, détail ETag, revalidation visibilité.

**Events/jobs:** RestaurantChanged, RestaurantRemoved.

**Security:** Publication contrôlée, coordonnées validées.

**Tests:** Coordonnées, midnight, états, soft delete, version conflict.

**Dependencies:** common, media.

## MODULE menus

**Responsibility:** Gestion publication/ordre des menus.

**Entities:** Menu.

**Controller:** MenusController ; AdminCatalogController.

**Endpoints:** GET /menus/{slug} ; /admin/menus.

**Services:** MenusService, PublicationPolicy.

**DTOs:** CreateMenuDto, UpdateMenuDto, PublishDto.

**Business rules:** Publication exige rubrique visible et plat publiable ; retrait masque descendants à la lecture.

**Database:** MenusRepository ; transaction publication + audit/outbox.

**Cache:** ETag version, invalidation restaurant.

**Events/jobs:** MenuPublished, MenuChanged.

**Security:** EDITOR contenu ; ADMIN retrait définitif.

**Tests:** Publication concurrente, héritage visibilité, FK.

**Dependencies:** restaurants, dishes, common.

## MODULE menu-categories

**Responsibility:** Rubriques propres à un menu.

**Entities:** MenuCategory.

**Controller:** AdminCatalogController.

**Endpoints:** /admin/menu-categories.

**Services:** MenuCategoriesService.

**DTOs:** CreateMenuCategoryDto, UpdateMenuCategoryDto.

**Business rules:** Position >= 0 ; restaurant dérivé du menu ; pas de suppression si plats actifs sans retrait explicite.

**Database:** PrismaService ; FK composite.

**Cache:** Hérite cache menu.

**Events/jobs:** MenuChanged.

**Security:** EDITOR ; aucune réaffectation inter-restaurant.

**Tests:** Ordre stable, visibilité, mauvaise parenté.

**Dependencies:** menus, common.

## MODULE dishes

**Responsibility:** Plat central, prix et publication.

**Entities:** Dish, DishMedia, DishFoodCategory, Money.

**Controller:** DishesController ; AdminCatalogController.

**Endpoints:** GET /dishes, /dishes/{slug} ; /admin/dishes.

**Services:** DishesService, VisibilityPolicy, Money.

**DTOs:** DishQueryDto, CreateDishDto, UpdateDishDto.

**Business rules:** Montants exacts ; prix vérifié explicite ; portion déclarée ; association rubrique du restaurant.

**Database:** DishesRepository ; SQL prix et FK composite.

**Cache:** Détail ETag ; listes courtes, revalidation.

**Events/jobs:** DishPublished, DishPriceChanged, DishAvailabilityChanged.

**Security:** EDITOR ; audit prix obligatoire.

**Tests:** Bornes Decimal, chaîne publication, photos, changement prix concurrent.

**Dependencies:** restaurants, categories, media, common.

## MODULE categories

**Responsibility:** Taxonomie alimentaire partagée.

**Entities:** FoodCategory, DishFoodCategory.

**Controller:** CategoriesController ; AdminCatalogController.

**Endpoints:** GET /categories ; /admin/categories.

**Services:** CategoriesService.

**DTOs:** CreateCategoryDto, UpdateCategoryDto.

**Business rules:** Slugs stables, invisible exclu découverte ; catégories utilisées archivées via visible=false.

**Database:** PrismaService ; unique slug ; relation N-N.

**Cache:** cat:v1:{locale}, 3600 s, invalidation mutation.

**Events/jobs:** CategoryChanged.

**Security:** Lecture publique, écriture EDITOR.

**Tests:** Doublon, classement, fallback Redis.

**Dependencies:** common.

## MODULE daily-menu

**Responsibility:** Sélections éditoriales du jour.

**Entities:** DailyMenu, DailyMenuItem.

**Controller:** DailyMenuController ; AdminCatalogController.

**Endpoints:** GET /daily-menus ; /admin/daily-menus.

**Services:** DailyMenuService.

**DTOs:** DailyMenuQueryDto, CreateDailyMenuDto, UpdateDailyMenuDto.

**Business rules:** Un jour/restaurant, références sans copie prix, bornes minuit Kinshasa.

**Database:** PrismaService ; DATE + timestamptz, FK composites.

**Cache:** 30 s au plus, expire au changement de date.

**Events/jobs:** DailyMenuPublished ; push opt-in, archivage.

**Security:** EDITOR ; pas de publication vide.

**Tests:** Minuit UTC/local, expiré sans worker, plat indisponible.

**Dependencies:** dishes, restaurants, common.

## MODULE search

**Responsibility:** Recherche unifiée et autocomplete.

**Entities:** SearchQuery, SearchResult.

**Controller:** SearchController.

**Endpoints:** GET /search, /search/autocomplete.

**Services:** SearchService, SearchPort.

**DTOs:** SearchQueryDto, AutocompleteQueryDto.

**Business rules:** Normalisation, filtres explicites priment, ranking déterministe.

**Database:** PostgresSearchRepository ; Meili adapter phase 2.

**Cache:** Requêtes fréquentes sans geo 30 s ; jamais coordonnées exactes dans clé.

**Events/jobs:** SearchPerformed → analytics consenti.

**Security:** q borné, tri allowlist, timeout SQL, quota.

**Tests:** Accents, pitsa, synonymes, commune, plans EXPLAIN.

**Dependencies:** dishes, restaurants, categories, nearby, common.

## MODULE nearby

**Responsibility:** Lectures spatiales filtrées.

**Entities:** GeoPoint, NearbyResult.

**Controller:** NearbyController.

**Endpoints:** GET /nearby.

**Services:** NearbyService.

**DTOs:** NearbyQueryDto.

**Business rules:** Rayon mètres 100..20000, coordonnées appariées ; pas distance routière.

**Database:** NearbyRepository ; ST_DWithin + GiST.

**Cache:** Pas de cache exact géolocalisé V1.

**Events/jobs:** NearbyViewed si consenti.

**Security:** Public borné 60/min/IP.

**Tests:** Bord rayon, axes inversés, NULL interdit, visibilité.

**Dependencies:** restaurants, dishes, common.

## MODULE budget

**Responsibility:** Propositions sous budget selon portions.

**Entities:** BudgetRequest, BudgetProposal.

**Controller:** BudgetController.

**Endpoints:** POST /budget/search.

**Services:** BudgetService, BudgetEngine.

**DTOs:** BudgetSearchDto, BudgetProposalDto.

**Business rules:** Quantity ceil(people/servesPeople), un plat principal, tout dans un restaurant.

**Database:** BudgetCandidatesRepository ; SQL filtré/ordonné, BigInt ou Decimal.

**Cache:** No-store V1.

**Events/jobs:** BudgetSearched consenti.

**Security:** 20 personnes max, plafond/rayon, quota 20/min.

**Tests:** Seuil exact, centimes, portions inconnues, plat accompagnement.

**Dependencies:** dishes, nearby, common.

## MODULE trending

**Responsibility:** Classement explicable.

**Entities:** DishTrend, TrendComponents.

**Controller:** TrendingController.

**Endpoints:** GET /trending.

**Services:** TrendingService.

**DTOs:** TrendingQueryDto.

**Business rules:** Snapshots immuables ; filtre visibilité vivant ; formule versionnée.

**Database:** PrismaService ; fenêtre 7 jours ; snapshot transactionnel.

**Cache:** trend:v1:{snapshot}:{commune}:{cursorHash}, 900 s.

**Events/jobs:** RebuildTrending toutes les 15 min.

**Security:** Quotas public ; pas de compteur client direct.

**Tests:** Reproductibilité, snapshot expiré, anti-abuse.

**Dependencies:** analytics, likes, favorites, shares, reviews, dishes, common.

## MODULE recommendations

**Responsibility:** Assemblage découverte simple.

**Entities:** RecommendationReason.

**Controller:** RecommendationsController.

**Endpoints:** GET /recommendations.

**Services:** RecommendationsService.

**DTOs:** RecommendationQueryDto.

**Business rules:** Tendances locales + éditorial, aucune promesse ML.

**Database:** Aucune table.

**Cache:** 30 s contenu public.

**Events/jobs:** RecommendationViewed consenti.

**Security:** Public, pas de profilage par défaut.

**Tests:** Cold start, diversité de restaurants, raisons.

**Dependencies:** trending, categories, dishes.

## MODULE likes

**Responsibility:** Relation utilisateur/plat et compteur.

**Entities:** Like.

**Controller:** LikesController.

**Endpoints:** POST/DELETE /dishes/{id}/like.

**Services:** LikesService.

**DTOs:** LikeStateDto.

**Business rules:** Insertion/suppression idempotente et delta atomique.

**Database:** PrismaService + raw ciblé RETURNING dans transaction.

**Cache:** Pas de cache personnel.

**Events/jobs:** DishLiked/DishUnliked seulement changement réel.

**Security:** User actif, 60/min ; DELETE retrait même si caché.

**Tests:** Concurrence, retry, compteur jamais négatif.

**Dependencies:** dishes, common.

## MODULE favorites

**Responsibility:** Sauvegarder plats et restaurants sans polymorphisme sans FK.

**Entities:** Favorite.

**Controller:** FavoritesController.

**Endpoints:** POST/DELETE /dishes/{id}/favorite ; /restaurants/{id}/favorite ; GET /users/me/favorites.

**Services:** FavoritesService.

**DTOs:** FavoriteQueryDto, FavoriteStateDto.

**Business rules:** Exactement une cible, unique paire, tombstone privé pour contenu retiré.

**Database:** PrismaService ; CHECK XOR ; compteur Dish atomique.

**Cache:** No-store.

**Events/jobs:** FavoriteAdded/Removed seulement changement réel.

**Security:** User actif et propriété.

**Tests:** XOR, IDOR, concurrence, pagination.

**Dependencies:** dishes, restaurants, common.

## MODULE shares

**Responsibility:** Liens et intention de partage.

**Entities:** Share.

**Controller:** SharesController.

**Endpoints:** POST /shares.

**Services:** SharesService.

**DTOs:** CreateShareDto, ShareResponseDto.

**Business rules:** URL stable ; requestId idempotent/acteur ; qualified après dédup acteur/cible/jour.

**Database:** PrismaService ; transaction événement+compteur ; verrou advisory acteur/cible pour qualification.

**Cache:** Aucun ; idempotence conservée en DB 30 jours.

**Events/jobs:** ShareRecorded.

**Security:** User ou session anonyme signée ; 20/min ; quota qualifié.

**Tests:** Replay requestId, clé réutilisée autre body 409, faux acteur.

**Dependencies:** deep-links, dishes, restaurants, menus, common.

## MODULE reviews

**Responsibility:** Avis uniques et agrégats cohérents.

**Entities:** Review, ReviewPolicy.

**Controller:** ReviewsController.

**Endpoints:** GET /restaurants/{id}/reviews ; PUT /restaurants/{id}/reviews/me ; DELETE /reviews/{id} ; GET /users/me/reviews.

**Services:** ReviewsService, RatingService.

**DTOs:** UpsertReviewDto, ReviewQueryDto.

**Business rules:** Un avis restaurant/user ; edits PENDING ; agrégats publiés seulement.

**Database:** ReviewsRepository ; verrou restaurant puis review.

**Cache:** Public 30 s ; personnel no-store.

**Events/jobs:** ReviewCreated/Changed.

**Security:** User actif ; auteur ; 5 créations/heure, 20 edits/heure.

**Tests:** Transitions, races, histogramme, auteur suspendu.

**Dependencies:** restaurants, common.

## MODULE notifications

**Responsibility:** Inbox et push FCM.

**Entities:** Notification, Device.

**Controller:** NotificationsController.

**Endpoints:** GET /notifications ; PATCH /notifications/{id} ; PUT/DELETE /notifications/devices/{installationId}.

**Services:** NotificationsService, FcmAdapter.

**DTOs:** RegisterDeviceDto, ReadNotificationDto.

**Business rules:** Opt-in ; événement/user unique ; tokens expirés désactivés ; recontrôler visibilité avant push.

**Database:** PrismaService ; tokens chiffrés ; ownership device.

**Cache:** No-store.

**Events/jobs:** DeliverNotification queue.

**Security:** User actif ; token jamais retourné ; transfert device vérifié.

**Tests:** Token rotation, logout device, retry provider, 404 contenu.

**Dependencies:** users, common.

## MODULE analytics

**Responsibility:** Mesurer avec minimisation et événements typés.

**Entities:** AnalyticsEvent (SearchEvent/ViewEvent/InteractionEvent logiques).

**Controller:** AnalyticsController.

**Endpoints:** POST /analytics/events.

**Services:** AnalyticsService.

**DTOs:** AnalyticsBatchDto.

**Business rules:** Schémas metadata par type, batch <=20, événements métier produits serveur uniquement.

**Database:** PrismaService ; rétention bruts 30 jours.

**Cache:** Dédup courte Redis ; agrégats durables.

**Events/jobs:** AggregateAnalytics ; purge.

**Security:** Consentement ; actorHash serveur ; interdiction PII/GPS précis.

**Tests:** Payload interdit, fake like, événement dupliqué, consentement absent.

**Dependencies:** common.

## MODULE media

**Responsibility:** Uploads directs signés et lifecycle.

**Entities:** MediaAsset, DishMedia.

**Controller:** AdminCatalogController.

**Endpoints:** POST /admin/media/uploads ; POST /admin/media/{id}/confirm ; DELETE /admin/media/{id}.

**Services:** MediaService, CloudinaryAdapter.

**DTOs:** CreateUploadDto, ConfirmUploadDto.

**Business rules:** PublicId aléatoire imposé, formats JPEG/PNG/WebP, max 8 MiB, confirmation API provider.

**Database:** PrismaService ; état PENDING→READY→DELETING→DELETED.

**Cache:** CDN Cloudinary URLs versionnées.

**Events/jobs:** DeleteMedia, CleanupPendingUploads.

**Security:** EDITOR ; signature limitée, pas URL import libre (SSRF).

**Tests:** Usurpation asset, PDF, taille, références restantes.

**Dependencies:** common.

## MODULE deep-links

**Responsibility:** Résoudre les URLs stables et metadata publiques.

**Entities:** PublicResourceMetadata.

**Controller:** DeepLinksController.

**Endpoints:** GET /deep-links/{type}/{slug}.

**Services:** DeepLinksService.

**DTOs:** ResolveLinkDto.

**Business rules:** types dish/restaurant/menu ; 404 contenu retiré ; aucune redirection URL libre.

**Database:** Lecture services catalogue.

**Cache:** ETag, visibilité revalidée.

**Events/jobs:** ShareResolved consenti.

**Security:** Public, slug strict, texte échappé par consommateur.

**Tests:** Slug retiré, collisions intertype, metadata safe.

**Dependencies:** dishes, restaurants, menus.

## MODULE admin

**Responsibility:** Façade sécurisée pour commandes métier et audit.

**Entities:** AdminUser, AuditLog.

**Controller:** AdminCatalogController, AdminReviewsController, AdminUsersController.

**Endpoints:** /admin/restaurants, menus, menu-categories, dishes, categories, daily-menus, reviews, users, audit-logs.

**Services:** Services métier existants ; AdminAccessService pour RBAC.

**DTOs:** AdminListDto, AdminRoleDto, UserStatusDto.

**Business rules:** Pas de second CRUD Prisma ; If-Match/version ; champs allowlist.

**Database:** AdminUser/AuditLog uniquement ; services propriétaires du reste.

**Cache:** No-store.

**Events/jobs:** AdminRoleChanged ; audit/outbox.

**Security:** MFA récent, permissions par action ; dernier super admin protégé.

**Tests:** Matrice rôles, mass assignment, version, rôle révoqué.

**Dependencies:** auth, catalogue, reviews, moderation, media, users, common.

## MODULE moderation

**Responsibility:** Signalements et décisions traçables.

**Entities:** ReviewReport.

**Controller:** ModerationController ; AdminReviewsController.

**Endpoints:** POST /reviews/{id}/reports ; GET/PATCH /admin/reports/{id}.

**Services:** ModerationService.

**DTOs:** ReportReviewDto, ModerateReviewDto, ResolveReportDto.

**Business rules:** Unique rapporteur/avis ; transitions explicites ; raison obligatoire.

**Database:** PrismaService + ReviewsService pour statut/agrégat.

**Cache:** No-store.

**Events/jobs:** ReviewReported, ReviewModerated.

**Security:** Signalement User, décision MODERATOR/ADMIN.

**Tests:** Brigading, double décision, audit, autorisation.

**Dependencies:** reviews, common.

## MODULE jobs

**Responsibility:** Effets différés et reconstruction des projections.

**Entities:** OutboxEvent, JobEnvelope.

**Controller:** Aucun public.

**Endpoints:** —.

**Services:** OutboxRelay, TrendingProcessor, NotificationsProcessor, CleanupProcessor, ReconcileProcessor.

**DTOs:** JobEnvelope avec eventId/version/correlationId.

**Business rules:** At-least-once, idempotence DB ; backoff borné, DLQ, métriques.

**Database:** OutboxEvent ; SKIP LOCKED, version événement.

**Cache:** BullMQ Redis noeviction.

**Events/jobs:** Trending, notifications, media cleanup, purge, reconciliation ; Meili phase 2.

**Security:** Worker réseau privé, credentials minimum.

**Tests:** Crash enqueue/commit, duplicate, poison message, reprise.

**Dependencies:** common, analytics, trending, notifications, media.

## MODULE health

**Responsibility:** Sondes sans fuite de configuration.

**Entities:** HealthStatus.

**Controller:** HealthController.

**Endpoints:** GET /health, /liveness, /readiness.

**Services:** HealthService.

**DTOs:** HealthResponseDto.

**Business rules:** Liveness locale ; readiness DB + Redis sécurité ; /health résumé minimal.

**Database:** SELECT 1 timeout court.

**Cache:** Ping Redis limiteur/jobs.

**Events/jobs:** —.

**Security:** Détails internes uniquement réseau ops ; quotas proxy.

**Tests:** DB down, cache down tolérable, quota Redis down 503.

**Dependencies:** common.
