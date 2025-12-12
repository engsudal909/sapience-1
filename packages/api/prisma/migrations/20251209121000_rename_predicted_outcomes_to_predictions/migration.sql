-- Rename JSON columns from predictedOutcomes to predictions
ALTER TABLE "position" RENAME COLUMN "predictedOutcomes" TO "predictions";
ALTER TABLE "limit_order" RENAME COLUMN "predictedOutcomes" TO "predictions";
