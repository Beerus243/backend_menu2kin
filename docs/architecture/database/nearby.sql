-- EXEMPLE SQL paramétré pour pg/Prisma $queryRaw (adapter les placeholders au client).
-- $1 longitude, $2 latitude, $3 rayon mètres, $4 plafond CDF, $5 limite <= 50.
-- Une lecture sous ce plafond n'est pas à elle seule une proposition budget pour N personnes.
WITH origin AS (
  SELECT ST_SetSRID(ST_MakePoint($1::double precision, $2::double precision), 4326)::geography AS point
)
SELECT d.id, d.name, d.slug, d."priceCdf"::text AS "priceCdf",
       r.id AS "restaurantId", r.name AS "restaurantName",
       round(ST_Distance(r.location, origin.point)::numeric, 1) AS "distanceMeters"
FROM "Restaurant" r
CROSS JOIN origin
JOIN "Dish" d ON d."restaurantId" = r.id
JOIN "MenuCategory" mc ON mc.id = d."menuCategoryId" AND mc."restaurantId" = r.id
JOIN "Menu" m ON m.id = mc."menuId" AND m."restaurantId" = r.id
WHERE r.status = 'ACTIVE' AND r."deletedAt" IS NULL
  AND ST_DWithin(r.location, origin.point, $3::double precision)
  AND d.status = 'PUBLISHED' AND d.availability = 'AVAILABLE' AND d."deletedAt" IS NULL
  AND m.status = 'PUBLISHED' AND m."deletedAt" IS NULL
  AND mc.visible AND mc."deletedAt" IS NULL
  AND d."priceCdf" <= $4::numeric
ORDER BY ST_Distance(r.location, origin.point), d.id
LIMIT $5::integer;
