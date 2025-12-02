-- AlterTable
ALTER TABLE "condition" ADD COLUMN     "resolvedToYes" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "settledAt" INTEGER;
