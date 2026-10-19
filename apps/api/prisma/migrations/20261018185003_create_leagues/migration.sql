-- CreateTable
CREATE TABLE "leagues" (
    "id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "league_participants" (
    "id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "league_participants_user_id_idx" ON "league_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_participants_league_id_user_id_key" ON "league_participants"("league_id", "user_id");

-- AddForeignKey
ALTER TABLE "league_participants" ADD CONSTRAINT "league_participants_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_participants" ADD CONSTRAINT "league_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
