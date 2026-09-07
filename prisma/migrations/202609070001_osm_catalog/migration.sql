CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OsmType" AS ENUM ('node', 'way', 'relation');

-- CreateTable
CREATE TABLE "Restaurant" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "area" VARCHAR(100) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "open" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fieldProvenance" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Restaurant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dish" (
    "id" UUID NOT NULL,
    "restaurantId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "price" INTEGER NOT NULL,
    "image" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "contentStatus" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsmRecord" (
    "id" UUID NOT NULL,
    "osmType" "OsmType" NOT NULL,
    "osmId" BIGINT NOT NULL,
    "osmVersion" INTEGER,
    "snapshotAt" TIMESTAMPTZ(3) NOT NULL,
    "candidate" JSONB NOT NULL,
    "restaurantId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OsmRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsmImportRun" (
    "id" UUID NOT NULL,
    "commandHash" VARCHAR(64) NOT NULL,
    "actor" VARCHAR(100) NOT NULL,
    "snapshotAt" TIMESTAMPTZ(3) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsmImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Restaurant_contentStatus_id_idx" ON "Restaurant"("contentStatus", "id");

-- CreateIndex
CREATE INDEX "Dish_restaurantId_contentStatus_idx" ON "Dish"("restaurantId", "contentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "OsmRecord_osmType_osmId_key" ON "OsmRecord"("osmType", "osmId");

-- CreateIndex
CREATE UNIQUE INDEX "OsmImportRun_commandHash_key" ON "OsmImportRun"("commandHash");

-- AddForeignKey
ALTER TABLE "Dish" ADD CONSTRAINT "Dish_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsmRecord" ADD CONSTRAINT "OsmRecord_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Invariants métier et cohérence du point, y compris écritures hors Prisma.
ALTER TABLE "Restaurant" ADD CONSTRAINT restaurant_coordinates CHECK
  (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE "Restaurant" ADD CONSTRAINT restaurant_version CHECK (version > 0);
ALTER TABLE "Restaurant" ADD CONSTRAINT restaurant_provenance CHECK (jsonb_typeof("fieldProvenance")='object');
ALTER TABLE "Dish" ADD CONSTRAINT dish_price CHECK (price BETWEEN 1 AND 10000000);
ALTER TABLE "Dish" ADD CONSTRAINT dish_servings CHECK (servings BETWEEN 1 AND 100);
ALTER TABLE "OsmRecord" ADD CONSTRAINT osm_identity CHECK ("osmId">0 AND ("osmVersion" IS NULL OR "osmVersion">0));
CREATE FUNCTION set_restaurant_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude,NEW.latitude),4326)::geography;
  RETURN NEW;
END;
$$;
CREATE TRIGGER restaurant_location_sync BEFORE INSERT OR UPDATE ON "Restaurant"
FOR EACH ROW EXECUTE FUNCTION set_restaurant_location();
ALTER TABLE "Restaurant" ALTER COLUMN location SET NOT NULL;
CREATE INDEX restaurant_location_gist ON "Restaurant" USING gist(location);
CREATE INDEX restaurant_name_trgm ON "Restaurant" USING gin(name gin_trgm_ops);
