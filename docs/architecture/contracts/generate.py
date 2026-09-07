import json
from pathlib import Path
S={}
def obj(props,req=None): return {'type':'object','additionalProperties':False,'properties':props,'required':list(props) if req is None else req}
def st(n=160,**kw): return dict(type='string',maxLength=n,**kw)
def integer(a=0,b=2147483647): return {'type':'integer','minimum':a,'maximum':b}
def arr(t,n=50): return {'type':'array','items':t,'maxItems':n}
def ref(n): return {'$ref':'#/components/schemas/'+n}
def enum(*v): return {'type':'string','enum':list(v)}
def nullable(t): return {'anyOf':[t,{'type':'null'}]}
uuid={'type':'string','format':'uuid'}; dt={'type':'string','format':'date-time'}; date={'type':'string','format':'date'}; boolean={'type':'boolean'}
money=st(15,pattern=r'^(0|[1-9][0-9]{0,11})\.[0-9]{2}$'); slug=st(160,pattern='^[a-z0-9]+(?:-[a-z0-9]+)*$')
S['Money']=money
S['Error']=obj({'error':obj({'code':st(80),'message':st(300),'details':arr(obj({'field':st(100),'code':st(80),'message':st(200)}),30),'requestId':st(100)})})
S['PageMeta']=obj({'nextCursor':nullable(st(2048)),'hasNextPage':boolean})
S['OffsetMeta']=obj({'offset':integer(0,1000),'limit':integer(1,50),'hasNextPage':boolean})
S['Ack']=obj({'accepted':boolean})
S['Image']=obj({'url':{'type':'string','format':'uri'},'width':integer(1,6000),'height':integer(1,6000),'altText':nullable(st(200))})
S['Price']=obj({'currency':enum('CDF'),'amount':ref('Money'),'priceUsd':nullable(ref('Money')),'priceBasis':enum('EDITORIAL'),'priceVerifiedAt':nullable(dt)})
S['RestaurantSummary']=obj({'id':uuid,'slug':slug,'name':st(),'commune':st(100),'neighborhood':nullable(st(100)),'status':enum('ACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED'),'verificationStatus':enum('UNVERIFIED','VERIFIED'),'logo':nullable(ref('Image')),'averageRating':nullable(st(4,pattern=r'^[1-5]\.[0-9]{2}$')),'reviewCount':integer(),'openNow':boolean})
S['Interval']=obj({'opensMinute':integer(0,1439),'closesMinute':integer(1,1440)})
S['OpeningHour']=obj({'weekday':integer(1,7),'opensMinute':integer(0,1439),'closesMinute':integer(1,1440)})
S['OpeningException']=obj({'date':date,'intervals':arr(ref('Interval'),8)})
S['Contact']=obj({'kind':enum('PHONE','WHATSAPP','WEBSITE'),'value':st(300)})
S['Restaurant']=obj({**S['RestaurantSummary']['properties'],'description':nullable(st(4000)),'address':st(300),'latitude':{'type':'number','minimum':-90,'maximum':90},'longitude':{'type':'number','minimum':-180,'maximum':180},'timezone':enum('Africa/Kinshasa'),'contacts':arr(ref('Contact'),10),'phone':nullable(st(16)),'whatsapp':nullable(st(16)),'website':nullable(st(300)),'openingHours':arr(ref('OpeningHour'),56),'openingExceptions':arr(ref('OpeningException'),60),'services':arr(enum('DINE_IN','TAKEAWAY','TERRACE','PARKING','WIFI'),5),'coverImage':nullable(ref('Image')),'ratingDistribution':arr(integer(),5),'version':integer(1),'updatedAt':dt})
S['Dish']=obj({'id':uuid,'slug':slug,'name':st(),'description':nullable(st(2000)),'restaurant':ref('RestaurantSummary'),'menuCategoryId':uuid,'price':ref('Price'),'image':nullable(ref('Image')),'photos':arr(ref('Image'),10),'availability':enum('AVAILABLE','UNAVAILABLE','SEASONAL'),'featured':boolean,'servesPeople':nullable(integer(1,20)),'isMainDish':boolean,'categoryIds':arr(uuid,10),'likeCount':integer(),'favoriteCount':integer(),'shareCount':integer(),'version':integer(1),'updatedAt':dt})
S['Category']=obj({'id':uuid,'slug':slug,'name':st(100),'position':integer()})
S['MenuCategory']=obj({'id':uuid,'menuId':uuid,'restaurantId':uuid,'name':st(100),'position':integer(),'visible':boolean})
S['Menu']=obj({'id':uuid,'restaurantId':uuid,'slug':slug,'name':st(),'position':integer(),'version':integer(1),'categories':arr(ref('MenuCategory'),50),'updatedAt':dt})
S['DailyMenuItem']=obj({'dish':ref('Dish'),'position':integer(),'available':boolean})
S['DailyMenu']=obj({'id':uuid,'restaurantId':uuid,'date':date,'startsAt':dt,'expiresAt':dt,'items':arr(ref('DailyMenuItem'),100),'version':integer(1)})
S['User']=obj({'id':uuid,'displayName':st(80),'phone':nullable(st(16)),'preferences':obj({'locale':enum('fr-CD'),'pushEnabled':boolean,'analyticsEnabled':boolean,'preferredCategories':arr(slug,10)}),'createdAt':dt})
S['Review']=obj({'id':uuid,'restaurantId':uuid,'author':obj({'id':uuid,'displayName':st(80)}),'rating':integer(1,5),'text':nullable(st(2000)),'status':enum('PENDING','PUBLISHED','HIDDEN','FLAGGED','DELETED'),'version':integer(1),'createdAt':dt,'updatedAt':dt,'publishedAt':nullable(dt)})
S['Favorite']=obj({'id':uuid,'type':enum('dish','restaurant'),'resourceId':uuid,'unavailable':boolean,'dish':nullable(ref('Dish')),'restaurant':nullable(ref('RestaurantSummary')),'createdAt':dt})
S['LikeState']=obj({'liked':boolean,'likeCount':integer()})
S['FavoriteState']=obj({'favorited':boolean})
S['ShareResult']=obj({'id':uuid,'url':{'type':'string','format':'uri'},'recorded':boolean})
S['Session']=obj({'id':uuid,'createdAt':dt,'lastSeenAt':dt,'expiresAt':dt,'current':boolean})
S['Tokens']=obj({'accessToken':st(8192),'refreshToken':st(256),'tokenType':enum('Bearer'),'expiresIn':integer(600,600),'sessionId':uuid})
S['OtpChallenge']=obj({'challengeId':uuid,'expiresIn':integer(300,300),'retryAfter':integer(60,60)})
S['AnonymousSession']=obj({'anonymousToken':st(2048),'expiresIn':integer(86400,86400)})
S['BudgetItem']=obj({'dish':ref('Dish'),'quantity':integer(1,20),'unitPrice':ref('Money'),'lineTotal':ref('Money'),'servesPeople':integer(1,20)})
S['BudgetProposal']=obj({'currency':enum('CDF'),'budget':ref('Money'),'people':integer(1,20),'items':arr(ref('BudgetItem'),1),'total':ref('Money'),'pricePerPerson':ref('Money'),'remainingBudget':ref('Money'),'distanceMeters':{'type':'number','minimum':0},'restaurant':ref('RestaurantSummary'),'coverageBasis':enum('EDITORIAL_PORTION')})
S['NearbyResult']=obj({'distanceMeters':{'type':'number','minimum':0},'restaurant':ref('RestaurantSummary'),'dish':nullable(ref('Dish'))})
S['SearchResult']=obj({'dishes':arr(ref('Dish')),'restaurants':arr(ref('RestaurantSummary')),'categories':arr(ref('Category'))})
S['Suggestion']=obj({'type':enum('dish','restaurant','category'),'id':uuid,'label':st(),'slug':slug})
S['TrendingDish']=obj({'dish':ref('Dish'),'score':st(30),'snapshotAt':dt,'reason':enum('LOCAL_TRENDING')})
S['Recommendation']=obj({'dish':ref('Dish'),'reason':enum('LOCAL_TRENDING','EDITORIAL')})
S['Notification']=obj({'id':uuid,'title':st(),'body':st(500),'deepLink':st(300),'readAt':nullable(dt),'createdAt':dt})
S['DeviceResult']=obj({'id':uuid,'installationId':uuid,'platform':enum('ANDROID','IOS'),'enabled':boolean,'lastSeenAt':dt})
S['DeepLink']=obj({'type':enum('dish','restaurant','menu'),'id':uuid,'slug':slug,'canonicalUrl':{'type':'string','format':'uri'},'title':st(),'description':st(500),'image':nullable(ref('Image')),'apiPath':st(300),'status':st(40)})
S['Upload']=obj({'id':uuid,'publicId':st(255),'uploadUrl':{'type':'string','format':'uri'},'apiKey':st(100),'timestamp':integer(),'signature':st(256),'uploadPreset':st(100),'expiresAt':dt})
S['Media']=obj({'id':uuid,'status':enum('PENDING','READY','REJECTED','DELETING','DELETED'),'image':nullable(ref('Image'))})
S['Report']=obj({'id':uuid,'reviewId':uuid,'status':enum('OPEN','DISMISSED','ACTIONED'),'reason':st(500),'createdAt':dt})
S['AdminUser']=obj({'id':uuid,'displayName':st(80),'status':enum('ACTIVE','SUSPENDED','DELETED'),'adminRole':nullable(enum('SUPER_ADMIN','ADMIN','EDITOR','MODERATOR'))})
S['AuditLog']=obj({'id':uuid,'actorId':nullable(uuid),'actorLabel':st(100),'action':st(100),'resourceType':st(40),'resourceId':uuid,'before':nullable({'type':'object'}),'after':nullable({'type':'object'}),'reason':nullable(st(500)),'requestId':st(100),'createdAt':dt})
S['Health']=obj({'status':enum('ok','degraded','unavailable')})
# DTO requests: additionalProperties false, nullable values must be explicit.
S['RequestOtp']=obj({'phone':st(16,pattern=r'^\+[1-9][0-9]{7,14}$')})
S['VerifyOtp']=obj({'challengeId':uuid,'code':st(6,pattern='^[0-9]{6}$')})
S['GoogleLogin']=obj({'idToken':st(8192),'nonce':st(256)})
S['AdminLogin']=obj({'idToken':st(8192),'nonce':st(256)})
S['Refresh']=obj({'refreshToken':st(256,minLength=40)})
S['ProfilePatch']=obj({'displayName':st(80,minLength=1),'preferences':obj({'locale':enum('fr-CD'),'pushEnabled':boolean,'analyticsEnabled':boolean,'preferredCategories':arr(slug,10)},[])},[])
S['ReviewWrite']=obj({'rating':integer(1,5),'text':nullable(st(2000))},['rating'])
S['ShareWrite']=obj({'type':enum('dish','restaurant','menu'),'resourceId':uuid,'requestId':uuid,'platform':enum('WHATSAPP','FACEBOOK','MESSENGER','COPY_LINK','OTHER'),'source':enum('DETAIL','SEARCH','FAVORITES','DAILY_MENU','OTHER')})
S['ReportWrite']=obj({'reason':st(500,minLength=10)})
S['DeviceWrite']=obj({'platform':enum('ANDROID','IOS'),'token':st(4096,minLength=20),'enabled':boolean})
S['NotificationRead']=obj({'read':{'const':True}})
S['BudgetSearch']=obj({'budget':st(11,pattern=r'^(?:[1-9][0-9]{0,6}|10000000)\.[0-9]{2}$'),'people':integer(1,20),'latitude':{'type':'number','minimum':-90,'maximum':90},'longitude':{'type':'number','minimum':-180,'maximum':180},'radiusMeters':integer(100,20000),'categoryId':uuid,'limit':integer(1,20),'offset':integer(0,1000)},['budget','people','latitude','longitude','radiusMeters'])
S['ClientEvent']=obj({'id':uuid,'kind':enum('DISH_VIEW','RESTAURANT_VIEW','DAILY_MENU_VIEW','WHATSAPP_CLICK','PHONE_CLICK','DIRECTIONS_CLICK','SEARCH_FILTER'),'resourceType':enum('dish','restaurant','daily-menu'),'resourceId':uuid,'metadata':obj({'source':enum('DETAIL','SEARCH','FAVORITES','DAILY_MENU','OTHER'),'filterNames':arr(enum('commune','category','price','radius','openNow'),5)},[])},['id','kind','resourceType','resourceId','metadata'])
S['AnalyticsBatch']=obj({'events':arr(ref('ClientEvent'),20)})
S['RestaurantWrite']=obj({'name':st(160,minLength=1),'description':nullable(st(4000)),'address':st(300,minLength=1),'commune':st(100,minLength=1),'neighborhood':nullable(st(100)),'latitude':{'type':'number','minimum':-90,'maximum':90},'longitude':{'type':'number','minimum':-180,'maximum':180},'contacts':arr(ref('Contact'),10),'openingHours':arr(ref('OpeningHour'),56),'openingExceptions':arr(ref('OpeningException'),60),'services':arr(enum('DINE_IN','TAKEAWAY','TERRACE','PARKING','WIFI'),5),'logoId':nullable(uuid),'coverImageId':nullable(uuid),'status':enum('DRAFT','ACTIVE','INACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED'),'verificationStatus':enum('UNVERIFIED','VERIFIED')},['name','address','commune','latitude','longitude'])
S['MenuWrite']=obj({'restaurantId':uuid,'name':st(160,minLength=1),'position':integer(0,10000)},['restaurantId','name'])
S['MenuCategoryWrite']=obj({'menuId':uuid,'name':st(100,minLength=1),'position':integer(0,10000),'visible':boolean},['menuId','name'])
S['DishWrite']=obj({'menuCategoryId':uuid,'name':st(160,minLength=1),'description':nullable(st(2000)),'priceCdf':ref('Money'),'priceUsd':nullable(st(13,pattern=r'^(0|[1-9][0-9]{0,9})\.[0-9]{2}$')),'priceVerifiedAt':nullable(dt),'availability':enum('AVAILABLE','UNAVAILABLE','SEASONAL'),'featured':boolean,'servesPeople':nullable(integer(1,20)),'isMainDish':boolean,'position':integer(0,10000),'categoryIds':arr(uuid,10),'media':arr(obj({'assetId':uuid,'position':integer(0,10000),'altText':nullable(st(200))},['assetId','position']),10)},['menuCategoryId','name','priceCdf'])
S['CategoryWrite']=obj({'name':st(100,minLength=1),'slug':slug,'position':integer(0,10000),'visible':boolean},['name','slug'])
S['DailyMenuWrite']=obj({'restaurantId':uuid,'date':date,'items':arr(obj({'dishId':uuid,'position':integer(0,10000),'available':boolean}),100)},['restaurantId','date','items'])
for n in ['Restaurant','Menu','MenuCategory','Dish','Category','DailyMenu']:
    props=dict(S[n+'Write']['properties'])
    for key in ['restaurantId','menuId','slug','date']: props.pop(key,None)
    S[n+'Patch']=obj(props,[])
# Admin reads include drafts and internal publication fields, without leaking private identities.
for n in ['Restaurant','Menu','Dish','DailyMenu','MenuCategory','Category']:
    props=dict(S[n]['properties'])
    if n in ['Restaurant','Menu','Dish','DailyMenu']:
        props.update({'status':enum('DRAFT','ACTIVE','INACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED') if n=='Restaurant' else enum('DRAFT','PUBLISHED','ARCHIVED'),'deletedAt':nullable(dt)})
    S['Admin'+n]=obj(props)
S['AdminRestaurantSummary']=obj({**S['RestaurantSummary']['properties'],'status':enum('DRAFT','ACTIVE','INACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED')})
S['AdminDish']['properties']['restaurant']=ref('AdminRestaurantSummary')
S['AdminDailyMenuItem']=obj({**S['DailyMenuItem']['properties'],'dish':ref('AdminDish')})
S['AdminDailyMenu']['properties']['items']=arr(ref('AdminDailyMenuItem'),100)
S['Publish']=obj({'status':enum('DRAFT','PUBLISHED','ARCHIVED')})
S['ModerateReview']=obj({'status':enum('PENDING','PUBLISHED','HIDDEN','FLAGGED','DELETED'),'reason':st(500,minLength=10)})
S['ResolveReport']=obj({'status':enum('DISMISSED','ACTIONED'),'reason':st(500,minLength=10)})
S['UserStatus']=obj({'status':enum('ACTIVE','SUSPENDED'),'reason':st(500,minLength=10)})
S['AdminRole']=obj({'role':nullable(enum('SUPER_ADMIN','ADMIN','EDITOR','MODERATOR')),'reason':st(500,minLength=10)})
S['UploadRequest']=obj({'purpose':enum('DISH_PHOTO','RESTAURANT_LOGO','RESTAURANT_COVER')})
S['UploadConfirm']=obj({'assetId':st(255),'version':integer(1)})
P=[]
def ep(method,path,purpose,auth='Public',query='',body=None,out='Ack',rules='',pagination='Aucune',cache='no-store',rate='120/min/IP',analytics='Aucun',status=200,errors='400 VALIDATION_ERROR ; 429 RATE_LIMITED',version=False):
    P.append(dict(method=method,path=path,purpose=purpose,auth=auth,query=query,body=body,out=out,rules=rules,pagination=pagination,cache=cache,rate=rate,analytics=analytics,status=status,errors=errors,version=version))
page='limit=20 (1..50), cursor opaque'
offset='limit=20 (1..50), offset=0 (0..1000)'
geo='latitude [-90,90], longitude [-180,180], radiusMeters [100,20000] ; coordonnées appariées'
publicerrors='400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED ; 503 DEPENDENCY_UNAVAILABLE'
ep('POST','/anonymous-sessions','Créer une identité anonyme signée pour intentions et quotas',out='AnonymousSession',rate='10/heure/IP',status=201,rules='Token signé 24 h ; aucun droit utilisateur ; ne prouve pas une personne unique.')
ep('POST','/auth/otp/request','Demander un code téléphone',body='RequestOtp',out='OtpChallenge',status=202,rate='3/15 min/téléphone + 10/heure/IP',rules='Réponse uniforme, cooldown 60 s, challenge expirant en 300 s.')
ep('POST','/auth/otp/verify','Consommer un code et ouvrir une session',body='VerifyOtp',out='Tokens',rate='5/challenge + 20/heure/IP',errors='400 VALIDATION_ERROR ; 401 INVALID_OTP ; 429 RATE_LIMITED',rules='Challenge consommé atomiquement ; account suspendu/supprimé refuse la session.')
ep('POST','/auth/google','Connexion Google',body='GoogleLogin',out='Tokens',rate='20/heure/IP',errors='400 VALIDATION_ERROR ; 401 INVALID_IDENTITY',rules='Valider issuer/audience/expiration/nonce/sub ; aucune fusion par email ou téléphone non prouvé.')
ep('POST','/auth/admin/exchange','Échanger une identité MFA du fournisseur admin',body='AdminLogin',out='Tokens',rate='10/heure/IP',errors='401 INVALID_IDENTITY ; 403 ADMIN_ACCESS_DENIED',rules='Issuer admin séparé configuré, acr/amr MFA attestés ; utilisateur AdminUser déjà provisionné ; ne jamais croire un booléen MFA client.')
ep('POST','/auth/refresh','Rotation du refresh opaque',body='Refresh',out='Tokens',rate='30/min/IP',errors='401 INVALID_REFRESH ; 401 SESSION_REVOKED ; 429 RATE_LIMITED',rules='Verrou session ; replay connu révoque famille ; expiration absolue 30 jours.')
ep('POST','/auth/logout','Révoquer la session courante','User',status=204,rate='30/min/user',rules='Idempotent ; vider association device de cette installation si prouvée ; client efface tokens.')
ep('GET','/auth/sessions','Lister ses sessions actives','User',out='Session',pagination='Cursor',query=page,rate='60/min/user')
ep('DELETE','/auth/sessions/{id}','Révoquer une session personnelle','User',status=204,rate='30/min/user',errors='404 RESOURCE_NOT_FOUND',rules='Propriété obligatoire ; révocation de toutes ses valeurs refresh.')
ep('GET','/users/me','Lire son profil','User',out='User',rate='120/min/user')
ep('PATCH','/users/me','Modifier nom et préférences','User',body='ProfilePatch',out='User',rate='30/min/user',rules='Champs inconnus refusés ; au moins une propriété ; aucun rôle/statut/téléphone dans ce DTO.')
ep('DELETE','/users/me','Demander suppression et révoquer immédiatement','User',status=202,rate='3/jour/user',rules='Réauth < 5 min ; soft delete immédiat, anonymisation/purge asynchrone documentée.')
ep('POST','/users/me/phone-change/request','Prouver le nouveau téléphone','User',body='RequestOtp',out='OtpChallenge',status=202,rate='3/15 min/user + téléphone',rules='Réauth < 5 min, challenge PHONE_CHANGE lié userId ; ancien téléphone conservé jusqu’au succès.')
ep('POST','/users/me/phone-change/confirm','Appliquer un téléphone vérifié','User',body='VerifyOtp',out='Tokens',rate='5/challenge',errors='401 INVALID_OTP ; 409 PHONE_IN_USE',rules='Transaction téléphone unique + consommation OTP + révocation des anciennes sessions + nouvelle session.')
ep('GET','/restaurants','Lister les restaurants',query=page+', commune, neighborhood, status=ACTIVE|TEMPORARILY_CLOSED, openNow, sort=recent',out='RestaurantSummary',pagination='Cursor',cache='public max-age=0, ETag ; cache serveur IDs 30 s',errors=publicerrors,rules='ACTIVE par défaut ; visibilité relue ; tri createdAt DESC,id DESC.')
ep('GET','/restaurants/{slug}','Lire un restaurant public',out='Restaurant',cache='public max-age=0, ETag',errors=publicerrors,rules='TEMPORARILY_CLOSED/PERMANENTLY_CLOSED accessibles avec statut ; DRAFT/INACTIVE/deleted ⇒ 404.')
ep('GET','/restaurants/{id}/menus','Lister les menus publiés du restaurant',query=page,out='Menu',pagination='Cursor',cache='public max-age=0, ETag',errors=publicerrors,rules='Retour rubriques sans tous les plats ; plats paginés via /dishes?menuCategoryId= ; ordre position,id.')
ep('GET','/menus/{slug}','Lire un menu public et ses rubriques',out='Menu',cache='public max-age=0, ETag',errors=publicerrors,rules='Max 50 rubriques ; toutes publiables ; aucun arbre illimité de plats.')
ep('GET','/dishes','Lister les plats',query=page+', restaurantId, menuCategoryId, categoryId, minPriceCdf, maxPriceCdf, availability, sort=recent|priceAsc',out='Dish',pagination='Cursor',cache='public max-age=0, ETag',errors=publicerrors,rules='Tri recent (createdAt,id) ou priceAsc (priceCdf,id), filtres liés au curseur ; visibilité ancêtres.')
ep('GET','/dishes/{slug}','Lire un plat et ses prix',out='Dish',cache='public max-age=0, ETag',errors=publicerrors,rules='Sans likedByMe dans réponse publique ; état personnel via favoris/likes personnels.',analytics='Vue qualifiée via endpoint analytics consenti')
ep('GET','/users/me/likes','Lister les plats aimés','User',query=page,out='Dish',pagination='Cursor',rate='120/min/user',rules='Contenus retirés omis ; curseur avance sur relations, pas taille résultats visibles.')
ep('GET','/categories','Lister les catégories visibles',out='Category',pagination='Liste bornée 500, sans curseur',cache='public max-age=60 ; Redis 3600 s')
ep('GET','/daily-menus','Menus actuels de Kinshasa',query=page+', restaurantId, commune',out='DailyMenu',pagination='Cursor',cache='public max-age=0, ETag ; serveur min(30s, expiration)',rules='Date courante seulement, now dans intervalle ; filtres items disponibles et visibilité ; max 100 items.',errors=publicerrors,analytics='DAILY_MENU_VIEW via analytics consenti')
ep('GET','/search','Rechercher plats/restaurants/catégories',query=offset+', q (2..120), type=dish|restaurant|category|all, commune, categoryId, maxPriceCdf, '+geo,out='SearchResult',pagination='Offset par section, borné à 1000',cache='Redis 30 s uniquement sans geo ; HTTP no-store',rate='60/min/IP',rules='Sections indépendantes ; meta.sections contient hasNextPage par section ; normalisation/synonymes versionnés.',errors=publicerrors,analytics='SEARCH côté serveur si consentement')
ep('GET','/search/autocomplete','Proposer des termes et ressources',query='q (2..80), limit=10 (1..10)',out='Suggestion',pagination='Liste bornée 10, sans curseur',rate='60/min/IP',cache='Redis 30 s sans coordonnées',rules='Préfixe puis fuzzy, q=1 refusé.')
ep('GET','/nearby','Restaurants ou plats dans le rayon',query=offset+', '+geo+', type=restaurant|dish, maxPriceCdf, openNow',out='NearbyResult',pagination='Offset',rate='60/min/IP',rules='Coordonnées/rayon requis ; ST_DWithin, tri distance brute puis id ; max 50.',errors=publicerrors)
ep('POST','/budget/search','Proposer des quantités de plat sous budget',body='BudgetSearch',out='BudgetProposal',pagination='Offset dans le body, limite 20',rate='20/min/IP',rules='Montants string CDF, portions connues, plat principal, total exact ≤ budget ; min budget 1.00 max 10000000.00 contrôlés en service.',errors=publicerrors,analytics='BUDGET_SEARCH consenti, montant bucketisé')
ep('GET','/trending','Lire un classement figé',query=page+', commune',out='TrendingDish',pagination='Cursor snapshot (1 h)',cache='Redis 900 s ; revalidation DB, HTTP max-age=0',rate='120/min/IP',errors=publicerrors+' ; 410 CURSOR_EXPIRED',rules='Même snapshot jusqu’à fin pagination ; les retraits ne sont jamais servis.')
ep('GET','/recommendations','Suggestions éditoriales et tendances locales',query='commune, limit=20 (1..20)',out='Recommendation',pagination='Liste bornée 20, sans curseur',cache='Redis 30 s ; HTTP max-age=0',rules='Sans personnalisation comportementale V1 ; max 3 plats par restaurant.')
for method in ['POST','DELETE']:
    ep(method,'/dishes/{id}/like','Aimer un plat' if method=='POST' else 'Retirer son like','User',out='LikeState',rate='60/min/user + 120/min/IP',rules='Idempotent, compteur exact au commit ; POST exige visibilité, DELETE accepte retrait privé même caché.',errors='401 UNAUTHORIZED ; 404 RESOURCE_NOT_FOUND ; 429 RATE_LIMITED',analytics='LIKE serveur seulement si relation change')
    for typ in ['dishes','restaurants']:
        ep(method,f'/{typ}/{{id}}/favorite','Sauvegarder' if method=='POST' else 'Retirer un favori','User',out='FavoriteState',rate='60/min/user',rules='Idempotent, cible existante ; DELETE ne révèle aucun contenu caché.',analytics='FAVORITE serveur seulement si changement')
ep('GET','/users/me/favorites','Lire ses favoris','User',query=page+', type=dish|restaurant',out='Favorite',pagination='Cursor',rate='120/min/user',rules='Tombstones pour ressources retirées ; tri createdAt DESC,id DESC.')
ep('POST','/shares','Enregistrer une intention et retourner le lien','Public + Anonymous ou User',body='ShareWrite',out='ShareResult',rate='20/min/acteur + 60/min/IP',rules='Idempotence actorHash/requestId 30 jours ; même clé autre body 409 ; qualifié max une cible/jour/acteur ; compteur dans transaction.',errors='400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 IDEMPOTENCY_CONFLICT ; 429 RATE_LIMITED',analytics='SHARE serveur seulement, pas preuve envoi')
ep('GET','/restaurants/{id}/reviews','Lire les avis publiés',query=page,out='Review',pagination='Cursor',cache='public max-age=0, ETag ; serveur 30 s',rules='PUBLISHED seulement ; tri publishedAt DESC,id DESC ; moyenne restaurant déjà agrégée.')
ep('PUT','/restaurants/{id}/reviews/me','Créer ou remplacer son avis restaurant','User',body='ReviewWrite',out='Review',rate='5 créations/heure/user, 20 modifications/heure/user',rules='Une paire user/restaurant ; état PENDING ; If-Match version existante, If-None-Match:* pour création ; HIDDEN/FLAGGED refusés.',errors='400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 REVIEW_LOCKED ; 409 VERSION_CONFLICT',version=True,analytics='REVIEW_CREATED serveur si première création')
ep('DELETE','/reviews/{id}','Supprimer son avis','User',status=204,rate='20/heure/user',rules='Propriétaire, soft delete idempotent et retrait agrégat transactionnel ; contenu caché supprimable par auteur.')
ep('GET','/users/me/reviews','Lire ses avis et leur état','User',query=page,out='Review',pagination='Cursor',rate='120/min/user')
ep('POST','/reviews/{id}/reports','Signaler un avis','User',body='ReportWrite',out='Report',rate='10/jour/user',rules='Unique reporter/review, upsert idempotent ; pas de masquage automatique ; son propre avis non signalable.')
ep('GET','/notifications','Lire son inbox','User',query=page,out='Notification',pagination='Cursor',rate='120/min/user')
ep('PATCH','/notifications/{id}','Marquer comme lue','User',body='NotificationRead',out='Notification',rate='60/min/user',rules='Owner only ; readAt premier instant de lecture conservé.')
ep('PUT','/notifications/devices/{installationId}','Enregistrer ou renouveler un device FCM','User',body='DeviceWrite',out='DeviceResult',rate='10/heure/user',rules='Token chiffré, pas dans réponse ; preuve d’installation et réauth requises pour transfert compte, sinon 409.')
ep('DELETE','/notifications/devices/{installationId}','Désactiver son appareil','User',status=204,rate='30/min/user',rules='Propriété obligatoire ; DELETE idempotent ; ne pas désactiver appareil d’un autre compte.')
ep('POST','/analytics/events','Collecter les interactions client autorisées','Public + Anonymous ou User',body='AnalyticsBatch',status=202,rate='60/min/acteur ; 20 événements/batch',rules='Consentement vérifié côté serveur ; champs metadata allowlist par kind, pas de likes/shares/reviews client ; id unique, acteur calculé.',errors='400 VALIDATION_ERROR ; 403 CONSENT_REQUIRED ; 429 RATE_LIMITED')
ep('GET','/deep-links/{type}/{slug}','Résoudre une ressource publique',out='DeepLink',cache='public max-age=0, ETag',rules='type dish/restaurant/menu ; URL canonique PUBLIC_BASE_URL ; pas d’open redirect.',errors=publicerrors)
for plural,n in [('restaurants','Restaurant'),('menus','Menu'),('menu-categories','MenuCategory'),('dishes','Dish'),('categories','Category'),('daily-menus','DailyMenu')]:
    a='Admin: EDITOR|ADMIN|SUPER_ADMIN'
    ep('GET','/admin/'+plural,'Lister le catalogue éditorial '+plural,a,query=page+', status, restaurantId, includeDeleted=false',out='Admin'+n,pagination='Cursor',rate='120/min/admin',rules='Filtres allowlist ; données brouillon accessibles uniquement aux rôles contenu.')
    ep('GET','/admin/'+plural+'/{id}','Lire une ressource éditoriale '+plural,a,out='Admin'+n,rate='120/min/admin')
    ep('POST','/admin/'+plural,'Créer '+plural,a,body=n+'Write',out='Admin'+n,status=201,rate='60/min/admin',rules='Parents validés, slug serveur sauf catégorie curée ; transaction métier + audit + outbox ; pas de champs compteurs client.')
    ep('PATCH','/admin/'+plural+'/{id}','Modifier '+plural,a,body=n+'Patch',out='Admin'+n,rate='60/min/admin',rules='If-Match version obligatoire pour entités versionnées ; autres ressources If-Match updatedAt ; parent restaurant immutable ; audit avant/après expurgé.',errors='400 VALIDATION_ERROR ; 404 RESOURCE_NOT_FOUND ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED',version=True)
    ep('DELETE','/admin/'+plural+'/{id}','Retirer '+plural,'Admin: ADMIN|SUPER_ADMIN',status=204,rate='20/min/admin',rules='Soft delete pour catalogue principal ; Category.visible=false ; rubrique deletedAt ; bloquer références actives non traitées ; raison via X-Audit-Reason.',errors='404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED',version=True)
    if n in ['Menu','Dish','DailyMenu']:
        ep('POST','/admin/'+plural+'/{id}/publication','Changer état de publication '+plural,a,body='Publish',out='Admin'+n,rate='30/min/admin',rules='If-Match, préconditions de publication, audit/outbox ; pas d’envoi push dans la transaction.',errors='409 PUBLICATION_INVALID ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED',version=True)
ep('GET','/admin/reviews','File des avis à modérer','Admin: MODERATOR|ADMIN|SUPER_ADMIN',query=page+', status=PENDING|PUBLISHED|FLAGGED|HIDDEN|DELETED',out='Review',pagination='Cursor',rate='120/min/admin')
ep('PATCH','/admin/reviews/{id}','Modérer un avis','Admin: MODERATOR|ADMIN|SUPER_ADMIN',body='ModerateReview',out='Review',rate='60/min/admin',rules='If-Match, transitions fermées, raison, verrou restaurant puis review et agrégats dans transaction.',errors='409 INVALID_TRANSITION ; 409 VERSION_CONFLICT ; 428 PRECONDITION_REQUIRED',version=True)
ep('GET','/admin/reports','File des signalements','Admin: MODERATOR|ADMIN|SUPER_ADMIN',query=page+', status=OPEN|DISMISSED|ACTIONED',out='Report',pagination='Cursor',rate='120/min/admin')
ep('PATCH','/admin/reports/{id}','Clore un signalement','Admin: MODERATOR|ADMIN|SUPER_ADMIN',body='ResolveReport',out='Report',rate='60/min/admin',rules='Transition OPEN seulement, CAS statut en DB ; audit raison, ne change pas implicitement Review.')
ep('GET','/admin/users','Lister les comptes','Admin: ADMIN|SUPER_ADMIN',query=page+', status=ACTIVE|SUSPENDED|DELETED',out='AdminUser',pagination='Cursor',rate='60/min/admin')
ep('PATCH','/admin/users/{id}/status','Suspendre ou réactiver','Admin: ADMIN|SUPER_ADMIN',body='UserStatus',out='AdminUser',rate='20/min/admin',rules='Ne pas modifier supérieur/soi-même/dernier superadmin ; suspension révoque sessions et déclenche retrait avis ; compte supprimé terminal.')
ep('PUT','/admin/users/{id}/role','Attribuer/retirer rôle admin','Admin: SUPER_ADMIN',body='AdminRole',out='AdminUser',rate='10/heure/admin',rules='MFA < 5 min, verrou des superadmins ; interdire de retirer le dernier actif ; révocation sessions cible, audit.')
ep('GET','/admin/audit-logs','Lire l’audit expurgé','Admin: ADMIN|SUPER_ADMIN',query=page+', resourceType, resourceId, actorId',out='AuditLog',pagination='Cursor',rate='60/min/admin')
ep('POST','/admin/media/uploads','Créer une intention upload signée','Admin: EDITOR|ADMIN|SUPER_ADMIN',body='UploadRequest',out='Upload',status=201,rate='20/heure/admin',rules='Preset restrictif, publicId réservé, overwrite=false, expiry intention 10 min ; signature fournisseur peut rester valide plus longtemps.')
ep('POST','/admin/media/{id}/confirm','Vérifier un fichier Cloudinary','Admin: EDITOR|ADMIN|SUPER_ADMIN',body='UploadConfirm',out='Media',rate='30/min/admin',rules='Metadata provider obligatoire, JPEG/PNG/WebP, <=8 MiB, 1..6000px et <=24 MP ; rejeter ressources expirées ; idempotent READY.')
ep('DELETE','/admin/media/{id}','Supprimer un média sans référence','Admin: EDITOR|ADMIN|SUPER_ADMIN',out='Ack',status=202,rate='20/min/admin',rules='409 si encore associé ; DELETING + outbox ; worker provider puis DELETED.',errors='404 RESOURCE_NOT_FOUND ; 409 RESOURCE_IN_USE')
for path,purpose in [('/liveness','Vérifier le processus vivant'),('/readiness','Vérifier disponibilité DB et quotas Redis'),('/health','Résumé de santé minimal')]:
    ep('GET',path,purpose,out='Health',rate='Quota proxy ; probes internes exemptées',errors='503 DEPENDENCY_UNAVAILABLE',rules='Sondes hors /api/v1 ; aucune URL interne/secret/version package en réponse.')
# Generate markdown and OpenAPI from same route inventory.
head='''# Contrat REST V1 — architecture proposée

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
'''
paths={}
def params(e):
    import re
    result=[]
    for name in re.findall(r'\{([^}]+)\}',e['path']):
        typ=uuid if name in ['id','installationId'] else enum('dish','restaurant','menu') if name=='type' else slug
        result.append({'name':name,'in':'path','required':True,'schema':typ})
    q=e['query']
    candidates={'limit':integer(1,10 if 'autocomplete' in e['path'] else 20 if 'recommendations' in e['path'] else 50),'offset':integer(0,1000),'cursor':st(2048),'q':st(80 if 'autocomplete' in e['path'] else 120,minLength=2),'latitude':{'type':'number','minimum':-90,'maximum':90},'longitude':{'type':'number','minimum':-180,'maximum':180},'radiusMeters':integer(100,20000),'commune':st(100),'neighborhood':st(100),'restaurantId':uuid,'menuCategoryId':uuid,'categoryId':uuid,'minPriceCdf':ref('Money'),'maxPriceCdf':ref('Money'),'openNow':boolean,'includeDeleted':boolean,'resourceId':uuid,'actorId':uuid,'resourceType':st(40),'availability':enum('AVAILABLE','UNAVAILABLE','SEASONAL'),'sort':enum('recent','priceAsc') if e['path']=='/dishes' else enum('recent'),'status':enum('ACTIVE','TEMPORARILY_CLOSED') if e['path']=='/restaurants' else enum('PENDING','PUBLISHED','HIDDEN','FLAGGED','DELETED') if e['path']=='/admin/reviews' else enum('OPEN','DISMISSED','ACTIONED') if e['path']=='/admin/reports' else enum('ACTIVE','SUSPENDED','DELETED') if e['path']=='/admin/users' else enum('DRAFT','ACTIVE','INACTIVE','TEMPORARILY_CLOSED','PERMANENTLY_CLOSED') if e['path']=='/admin/restaurants' else enum('DRAFT','PUBLISHED','ARCHIVED'),'type':enum('dish','restaurant','category','all') if e['path']=='/search' else enum('dish','restaurant')}
    for name,schema in candidates.items():
        if re.search(r'\b'+name+r'\b',q):
            result.append({'name':name,'in':'query','required':name=='q' or (e['path']=='/nearby' and name in ['latitude','longitude','radiusMeters']),'schema':schema})
    if e['version']:
        result.append({'name':'If-Match','in':'header','required':e['method']!='PUT','schema':st(100),'description':'ETag courant ; premier PUT avis utilise If-None-Match:*.'})
        if e['method']=='PUT': result.append({'name':'If-None-Match','in':'header','schema':enum('*')})
    if e['method']=='DELETE' and e['path'].startswith('/admin/') and e['version']:
        result.append({'name':'X-Audit-Reason','in':'header','required':True,'schema':st(500,minLength=10)})
    return result
parts=[head]
for i,e in enumerate(P):
    full=e['path'] if e['path'] in ['/health','/readiness','/liveness'] else '/api/v1'+e['path']
    fields=[('Purpose',e['purpose']),('Auth',e['auth']),('Query',e['query'] or 'Aucune'),('Body',e['body']+' (components.schemas OpenAPI)' if e['body'] else 'Aucun'),('Response',str(e['status'])+' ; '+('aucun corps' if e['status']==204 else 'data: '+e['out']+('[]' if e['pagination']!='Aucune' and e['out']!='SearchResult' else ''))),('Errors',e['errors']),('Business rules',e['rules'] or 'Conventions globales ; validation, visibilité et propriété appliquées'),('Pagination',e['pagination']),('Caching',e['cache']),('Rate limit',e['rate']),('Analytics',e['analytics'])]
    parts.append('### '+e['method']+' '+full+'\n\n'+'\n\n'.join('**'+k+':** '+v+'.' for k,v in fields)+'\n')
    payload=ref(e['out'])
    pag=e['pagination']
    if e['out']=='SearchResult':
        response=obj({'data':payload,'meta':obj({'sections':obj({k:ref('OffsetMeta') for k in ['dishes','restaurants','categories']})})})
    elif pag!='Aucune':
        response=obj({'data':arr(payload,500 if '500' in pag else 100),'meta':ref('PageMeta') if pag.startswith('Cursor') else ref('OffsetMeta')}) if not pag.startswith('Liste') else obj({'data':arr(payload,500 if '500' in pag else 10 if '10' in pag else 20)})
    else: response=obj({'data':payload})
    operation={'operationId':e['method'].lower()+'_'+str(i)+'_'+e['path'].replace('/','_').replace('{','').replace('}',''),'summary':e['purpose'],'description':e['rules']+' Quota initial: '+e['rate']+'. Cache: '+e['cache']+'.','tags':[e['path'].split('/')[1]],'parameters':params(e),'responses':{str(e['status']):{'description':'Succès','headers':{'X-Request-Id':{'schema':st(100),'description':'Identifiant de corrélation'},'ETag':{'schema':st(100),'description':'Présent sur lectures et mutations versionnées, selon conventions de route'}}}},'x-business-rules':e['rules'],'x-auth-policy':e['auth'],'x-pagination':pag,'x-rate-limit':e['rate']}
    if e['status']!=204: operation['responses'][str(e['status'])]['content']={'application/json':{'schema':response}}
    for code in [400,401,403,404,409,410,413,428,429,500,503]:
        operation['responses'][str(code)]={'description':{400:'Validation',401:'Identité invalide',403:'Permission refusée',404:'Absent ou non public',409:'Conflit',410:'Curseur expiré',413:'Payload trop grand',428:'Précondition manquante',429:'Quota',500:'Erreur interne',503:'Dépendance indisponible'}[code],'content':{'application/json':{'schema':ref('Error')}}}
    if e['body']: operation['requestBody']={'required':True,'content':{'application/json':{'schema':ref(e['body'])}}}
    operation['security']=([{'bearerAuth':[]},{'anonymousAuth':[]}] if e['auth'].startswith('Public +') else [{'bearerAuth':[]}] if e['auth']!='Public' else [])
    paths.setdefault(full,{})[e['method'].lower()]=operation
spec={'openapi':'3.1.0','info':{'title':'Menu2Kin Backend V1 — contrat proposé','version':'1.0.0-design','license':{'name':'Propriétaire — UNLICENSED','identifier':'LicenseRef-Proprietary'},'description':'Architecture proposée. Aucun serveur métier implémenté. Prix CDF strings, UTC, règles cross-field dans 03-api.md.'},'servers':[{'url':'/','description':'Origine du serveur après implémentation ; aucun domaine de production choisi'}],'paths':paths,'components':{'securitySchemes':{'bearerAuth':{'type':'http','scheme':'bearer','bearerFormat':'JWT'},'anonymousAuth':{'type':'apiKey','in':'header','name':'X-Anonymous-Token'}},'schemas':S}}
Path('docs/architecture/03-api.md').write_text('\n'.join(parts))
Path('docs/architecture/contracts/openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n')
print(f'{len(P)} opérations, {len(S)} schémas')
