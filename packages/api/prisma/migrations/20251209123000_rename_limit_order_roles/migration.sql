-- Rename limit_order participant fields to predictor/counterparty terminology
ALTER TABLE "limit_order" RENAME COLUMN "maker" TO "predictor";
ALTER TABLE "limit_order" RENAME COLUMN "taker" TO "counterparty";
ALTER TABLE "limit_order" RENAME COLUMN "makerCollateral" TO "predictorCollateral";
ALTER TABLE "limit_order" RENAME COLUMN "takerCollateral" TO "counterpartyCollateral";

-- Update index names to match new column names
ALTER INDEX "IDX_limit_order_maker" RENAME TO "IDX_limit_order_predictor";
