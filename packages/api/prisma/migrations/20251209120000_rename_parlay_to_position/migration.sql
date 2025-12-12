-- Rename Parlay table and enum to Position equivalents
ALTER TYPE "ParlayStatus" RENAME TO "PositionStatus";

ALTER TABLE "parlay" RENAME TO "position";

ALTER INDEX "IDX_parlay_maker" RENAME TO "IDX_position_maker";
ALTER INDEX "IDX_parlay_taker" RENAME TO "IDX_position_taker";
ALTER INDEX "IDX_parlay_chain_market" RENAME TO "IDX_position_chain_market";
