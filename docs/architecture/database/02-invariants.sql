-- PROPOSITION SQL: après le DDL Prisma, sur une base neuve.
-- Transactions par migration; ne pas appliquer isolément sur une base existante.
ALTER TABLE "Restaurant"
  ADD CONSTRAINT restaurant_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT restaurant_timezone CHECK (timezone = 'Africa/Kinshasa'),
  ADD CONSTRAINT restaurant_rating CHECK (
    "reviewCount" >= 0 AND "ratingSum" >= 0
    AND "ratingSum" BETWEEN "reviewCount" AND 5 * "reviewCount"
    AND cardinality("ratingDistribution") = 5
    AND array_lower("ratingDistribution", 1) = 1
    AND array_position("ratingDistribution", NULL) IS NULL
    AND 0 <= ALL("ratingDistribution")
    AND "reviewCount" = "ratingDistribution"[1] + "ratingDistribution"[2] + "ratingDistribution"[3] + "ratingDistribution"[4] + "ratingDistribution"[5]
    AND "ratingSum" = "ratingDistribution"[1] + 2 * "ratingDistribution"[2] + 3 * "ratingDistribution"[3] + 4 * "ratingDistribution"[4] + 5 * "ratingDistribution"[5]);

CREATE FUNCTION restaurant_set_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326)::geography;
  RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_location BEFORE INSERT OR UPDATE ON "Restaurant"
FOR EACH ROW EXECUTE FUNCTION restaurant_set_location();
UPDATE "Restaurant" SET latitude = latitude;
ALTER TABLE "Restaurant" ALTER COLUMN location SET NOT NULL;
CREATE INDEX restaurant_location_gist ON "Restaurant" USING gist(location);

ALTER TABLE "RestaurantOpeningHour"
  ADD CONSTRAINT opening_bounds CHECK (weekday BETWEEN 1 AND 7 AND "opensMinute" >= 0 AND "closesMinute" <= 1440 AND "opensMinute" < "closesMinute"),
  ADD CONSTRAINT opening_no_overlap EXCLUDE USING gist (
    "restaurantId" WITH =, weekday WITH =, int4range("opensMinute", "closesMinute", '[)') WITH &&);
ALTER TABLE "RestaurantOpeningException" ADD CONSTRAINT exception_array CHECK (jsonb_typeof(intervals) = 'array');
ALTER TABLE "Dish"
  ADD CONSTRAINT dish_money CHECK ("priceCdf" > 0 AND ("priceUsd" IS NULL OR "priceUsd" > 0)),
  ADD CONSTRAINT dish_portion CHECK ("servesPeople" IS NULL OR "servesPeople" BETWEEN 1 AND 20),
  ADD CONSTRAINT dish_counts CHECK ("likeCount" >= 0 AND "favoriteCount" >= 0 AND "shareCount" >= 0),
  ADD CONSTRAINT dish_position CHECK (position >= 0),
  ADD CONSTRAINT dish_version CHECK (version >= 1);
ALTER TABLE "Menu" ADD CONSTRAINT menu_position CHECK (position >= 0), ADD CONSTRAINT menu_version CHECK (version >= 1);
ALTER TABLE "MenuCategory" ADD CONSTRAINT menu_category_position CHECK (position >= 0);
ALTER TABLE "DishMedia" ADD CONSTRAINT dish_media_position CHECK (position >= 0);
ALTER TABLE "DailyMenuItem" ADD CONSTRAINT daily_item_position CHECK (position >= 0);
ALTER TABLE "Favorite" ADD CONSTRAINT favorite_exactly_one CHECK (num_nonnulls("dishId", "restaurantId") = 1);
ALTER TABLE "Share" ADD CONSTRAINT share_exactly_one CHECK (num_nonnulls("dishId", "restaurantId", "menuId") = 1);
ALTER TABLE "Review" ADD CONSTRAINT review_rating CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE "OtpChallenge" ADD CONSTRAINT otp_attempts CHECK (attempts BETWEEN 0 AND 5),
  ADD CONSTRAINT otp_bound_user CHECK ((purpose = 'LOGIN' AND "userId" IS NULL) OR (purpose = 'PHONE_CHANGE' AND "userId" IS NOT NULL));
ALTER TABLE "DailyMenu" ADD CONSTRAINT daily_local_day CHECK (
  "startsAt" = date::timestamp AT TIME ZONE 'Africa/Kinshasa'
  AND "expiresAt" = (date + 1)::timestamp AT TIME ZONE 'Africa/Kinshasa');

-- Champs dérivés SQL: ne pas les écrire via Prisma. Trigger = cohérence en transaction.
ALTER TABLE "Dish" ADD COLUMN search_text text NOT NULL DEFAULT '', ADD COLUMN search_vector tsvector;
CREATE FUNCTION dish_search_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := lower(unaccent(NEW.name || ' ' || coalesce(NEW.description, '')));
  NEW.search_vector := setweight(to_tsvector('french', lower(unaccent(NEW.name))), 'A')
                    || setweight(to_tsvector('french', lower(unaccent(coalesce(NEW.description, '')))), 'B');
  RETURN NEW;
END;
$$;
CREATE TRIGGER dish_search BEFORE INSERT OR UPDATE OF name, description ON "Dish"
FOR EACH ROW EXECUTE FUNCTION dish_search_document();
UPDATE "Dish" SET name = name;
CREATE INDEX dish_search_gin ON "Dish" USING gin(search_vector);
CREATE INDEX dish_search_trgm ON "Dish" USING gin(search_text gin_trgm_ops);
CREATE INDEX dish_budget_price ON "Dish" ("priceCdf", id)
WHERE status = 'PUBLISHED' AND availability = 'AVAILABLE' AND "deletedAt" IS NULL AND "isMainDish" AND "servesPeople" IS NOT NULL;

ALTER TABLE "Restaurant" ADD COLUMN search_text text NOT NULL DEFAULT '', ADD COLUMN search_vector tsvector;
CREATE FUNCTION restaurant_search_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_text := lower(unaccent(NEW.name || ' ' || coalesce(NEW.description, '') || ' ' || NEW.commune || ' ' || coalesce(NEW.neighborhood, '')));
  NEW.search_vector := to_tsvector('french', NEW.search_text);
  RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_search BEFORE INSERT OR UPDATE OF name, description, commune, neighborhood ON "Restaurant"
FOR EACH ROW EXECUTE FUNCTION restaurant_search_document();
UPDATE "Restaurant" SET name = name;
CREATE INDEX restaurant_search_gin ON "Restaurant" USING gin(search_vector);
CREATE INDEX restaurant_search_trgm ON "Restaurant" USING gin(search_text gin_trgm_ops);

-- Audit append-only, y compris pour les workers. La rétention utilise un rôle opérateur dédié.
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only';
END;
$$;
CREATE TRIGGER audit_no_change BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_immutable();
