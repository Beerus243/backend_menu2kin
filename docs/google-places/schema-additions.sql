-- ARCHITECTURE PROPOSÉE, NON EXÉCUTÉE.
-- Après les migrations du schéma cible docs/architecture/database, pas sur le catalogue mémoire.
-- Ajouter en transaction versionnée; adapter/backfiller avant activation des lecteurs publics.
CREATE TYPE "RestaurantContentStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED');
ALTER TABLE "Restaurant"
  ADD COLUMN "contentStatus" "RestaurantContentStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "fieldProvenance" jsonb NOT NULL DEFAULT '{}',
  ADD CONSTRAINT restaurant_provenance_object CHECK (jsonb_typeof("fieldProvenance") = 'object');

CREATE TABLE "RestaurantGoogleReference" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "googlePlaceId" varchar(512) NOT NULL UNIQUE,
  "restaurantId" uuid REFERENCES "Restaurant"(id) ON DELETE RESTRICT,
  "createdById" uuid NOT NULL REFERENCES "AdminUser"("userId") ON DELETE RESTRICT,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "lastCheckedAt" timestamptz(3),
  "invalidSince" timestamptz(3),
  CONSTRAINT google_place_id_shape CHECK ("googlePlaceId" ~ '^[A-Za-z0-9_-]{1,512}$')
);
CREATE INDEX google_reference_restaurant ON "RestaurantGoogleReference" ("restaurantId");
CREATE INDEX google_reference_checked ON "RestaurantGoogleReference" ("lastCheckedAt");
-- Les contraintes de source par champ vivent dans la validation de commandes, pas ce CHECK de forme.
-- Ne pas backfiller des noms/adresses/points à partir de Google. Aucun stockage de payload externe.
