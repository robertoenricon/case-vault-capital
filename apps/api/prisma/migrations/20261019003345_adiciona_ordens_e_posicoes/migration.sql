-- CreateEnum
CREATE TYPE "order_side" AS ENUM ('buy', 'sell');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "side" "order_side" NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "unit_price" DECIMAL(20,8) NOT NULL,
    "total_cost" DECIMAL(20,8) NOT NULL,
    "executed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_participant_id_idx" ON "orders"("participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "positions_participant_id_symbol_key" ON "positions"("participant_id", "symbol");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "league_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "league_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
