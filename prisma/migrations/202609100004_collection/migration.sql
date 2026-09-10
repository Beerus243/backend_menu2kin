ALTER TABLE "Restaurant" ALTER COLUMN address DROP NOT NULL,
 ADD COLUMN photo varchar(1000), ADD COLUMN "openingHours" varchar(1000);
ALTER TABLE "Dish" ALTER COLUMN price DROP NOT NULL, ALTER COLUMN image DROP NOT NULL,
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN "fieldProvenance" jsonb NOT NULL DEFAULT '{}';
CREATE TABLE "SourceRecord" (
 id uuid PRIMARY KEY, "sourceKey" varchar(100) NOT NULL, "externalId" varchar(1000) NOT NULL,
 "sourceUrl" varchar(1000) NOT NULL, rights jsonb NOT NULL, candidate jsonb NOT NULL,
 "snapshotAt" timestamptz(3) NOT NULL, "restaurantId" uuid REFERENCES "Restaurant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" timestamptz(3) NOT NULL
);
CREATE UNIQUE INDEX "SourceRecord_sourceKey_externalId_key" ON "SourceRecord"("sourceKey","externalId");
CREATE TABLE "AdminAudit" (
 id uuid PRIMARY KEY, actor varchar(100) NOT NULL, action varchar(100) NOT NULL,
 "resourceId" uuid, fields text[] NOT NULL, "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
