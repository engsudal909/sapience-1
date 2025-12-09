-- Create normalized prediction table
CREATE TABLE "prediction" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conditionId" TEXT NOT NULL,
    "positionId" INTEGER,
    "limitOrderId" INTEGER,
    "resolver" VARCHAR NOT NULL,
    "outcomeYes" BOOLEAN NOT NULL,
    "chainId" INTEGER
);

-- Indexes
CREATE INDEX "IDX_prediction_condition" ON "prediction"("conditionId");
CREATE INDEX "IDX_prediction_resolver" ON "prediction"("resolver");
CREATE INDEX "IDX_prediction_position" ON "prediction"("positionId");
CREATE INDEX "IDX_prediction_limit_order" ON "prediction"("limitOrderId");
CREATE UNIQUE INDEX "UQ_prediction_position_condition_resolver" ON "prediction"("positionId", "conditionId", "resolver");

-- Foreign keys
ALTER TABLE "prediction"
ADD CONSTRAINT "prediction_conditionId_fkey"
FOREIGN KEY ("conditionId") REFERENCES "condition"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "prediction"
ADD CONSTRAINT "prediction_positionId_fkey"
FOREIGN KEY ("positionId") REFERENCES "position"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "prediction"
ADD CONSTRAINT "prediction_limitOrderId_fkey"
FOREIGN KEY ("limitOrderId") REFERENCES "limit_order"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Backfill from legacy JSON predictions on positions if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'position' AND column_name = 'predictions'
  ) THEN
    INSERT INTO "prediction" ("conditionId", "positionId", "resolver", "outcomeYes", "chainId", "createdAt")
    SELECT
      elem->>'conditionId' AS "conditionId",
      p.id AS "positionId",
      LOWER(p."marketAddress") AS "resolver",
      (elem->>'prediction')::BOOLEAN AS "outcomeYes",
      p."chainId",
      p."createdAt"
    FROM "position" p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p."predictions"::jsonb) = 'array' THEN p."predictions"::jsonb ELSE '[]'::jsonb END) elem
    WHERE p."predictions" IS NOT NULL;
  END IF;
END $$;

-- Backfill from legacy JSON predictions on limit orders if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'limit_order' AND column_name = 'predictions'
  ) THEN
    INSERT INTO "prediction" ("conditionId", "limitOrderId", "resolver", "outcomeYes", "chainId", "createdAt")
    SELECT
      elem->>'conditionId' AS "conditionId",
      lo.id AS "limitOrderId",
      LOWER(lo."resolver") AS "resolver",
      (elem->>'prediction')::BOOLEAN AS "outcomeYes",
      lo."chainId",
      lo."createdAt"
    FROM "limit_order" lo
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(lo."predictions"::jsonb) = 'array' THEN lo."predictions"::jsonb ELSE '[]'::jsonb END) elem
    WHERE lo."predictions" IS NOT NULL;
  END IF;
END $$;

-- Drop legacy JSON columns
ALTER TABLE "position" DROP COLUMN IF EXISTS "predictions";
ALTER TABLE "limit_order" DROP COLUMN IF EXISTS "predictions";
