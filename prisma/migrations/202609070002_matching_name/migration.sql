ALTER TABLE "Restaurant" ADD COLUMN "normalizedName" VARCHAR(200) NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION set_restaurant_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude,NEW.latitude),4326)::geography;
  NEW."normalizedName" := trim(regexp_replace(unaccent(lower(NEW.name)), '[^[:alnum:]]+', ' ', 'g'));
  RETURN NEW;
END;
$$;
UPDATE "Restaurant" SET "normalizedName" = '';
DROP INDEX restaurant_name_trgm;
CREATE INDEX restaurant_normalized_name_trgm ON "Restaurant" USING gin("normalizedName" gin_trgm_ops);
CREATE INDEX restaurant_normalized_name_idx ON "Restaurant" ("normalizedName");
