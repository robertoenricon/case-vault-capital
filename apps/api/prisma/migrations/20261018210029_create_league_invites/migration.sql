-- CreateTable
CREATE TABLE "league_invites" (
    "id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "invited_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "league_invites_invited_user_id_idx" ON "league_invites"("invited_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_invites_league_id_invited_user_id_key" ON "league_invites"("league_id", "invited_user_id");

-- AddForeignKey
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "league_invites" ADD CONSTRAINT "league_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
