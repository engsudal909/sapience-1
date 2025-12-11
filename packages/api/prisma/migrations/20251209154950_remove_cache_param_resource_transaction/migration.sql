/*
  Warnings:

  - You are about to drop the column `marketGroupId` on the `event` table. All the data in the column will be lost.
  - You are about to drop the `cache_candle` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cache_param` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `collateral_transfer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `market` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `market_group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `market_price` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `owner_market_realized_pnl` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `position` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `resource_price` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `transaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "event" DROP CONSTRAINT "FK_be2327bfd127f45a55856b4c9de";

-- DropForeignKey
ALTER TABLE "market" DROP CONSTRAINT "FK_02755ce1b56a981eef76c0b59b4";

-- DropForeignKey
ALTER TABLE "market_group" DROP CONSTRAINT "FK_78409a3738729038b76742291f0";

-- DropForeignKey
ALTER TABLE "market_group" DROP CONSTRAINT "FK_f092ffcae41efef68cdc30bbd89";

-- DropForeignKey
ALTER TABLE "position" DROP CONSTRAINT "FK_0ad1a3735077091c74287ffc7ca";

-- DropForeignKey
ALTER TABLE "resource" DROP CONSTRAINT "FK_66faacb332a925bf732256594e5";

-- DropForeignKey
ALTER TABLE "resource_price" DROP CONSTRAINT "FK_187fa56af532560ce204719ea39";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "FK_23dff7d5a1d6601cf90eb5019a3";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "FK_91ebc2a6a20b2b1ac354cfae981";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "FK_f8aba9691e84fbd42400be9ce8a";

-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "FK_ffeefe4d2253a6af172da38fc49";

-- DropIndex
DROP INDEX "UQ_784b6bb8194a5c7b41a7be2ffa5";

-- AlterTable
ALTER TABLE "event" DROP COLUMN "marketGroupId";

-- DropTable
DROP TABLE "cache_candle";

-- DropTable
DROP TABLE "cache_param";

-- DropTable
DROP TABLE "collateral_transfer";

-- DropTable
DROP TABLE "market";

-- DropTable
DROP TABLE "market_group";

-- DropTable
DROP TABLE "market_price";

-- DropTable
DROP TABLE "owner_market_realized_pnl";

-- DropTable
DROP TABLE "position";

-- DropTable
DROP TABLE "resource";

-- DropTable
DROP TABLE "resource_price";

-- DropTable
DROP TABLE "transaction";

-- DropEnum
DROP TYPE "transaction_type_enum";

-- CreateTable
CREATE TABLE "key_value_store" (
    "key" VARCHAR(255) NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "key_value_store_pkey" PRIMARY KEY ("key")
);
