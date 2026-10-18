-- Saldo fictício: a base da liga e a carteira de cada participante nela.
--
-- Escrita à mão, e não gerada, por causa das linhas que já existem: as duas
-- colunas são `NOT NULL` sem default, então adicioná-las direto seria recusado
-- pelo Postgres. O caminho é em três passos — criar aceitando nulo, preencher o
-- que já está lá, e só então exigir o valor.
--
-- `numeric(20, 8)` e nunca `double precision`: dinheiro em ponto flutuante
-- perde centavo na soma. A escala 8 acompanha a precisão de quantidade de
-- cripto, porque o débito de uma ordem é quantidade × preço.

-- 1. Base da liga: o saldo com que todo participante dela começa.
ALTER TABLE "leagues" ADD COLUMN "initial_balance" DECIMAL(20,8);

-- As três ligas de desenvolvimento nasceram antes desta coluna existir.
-- Recebem o mesmo valor padrão para que a coluna possa virar obrigatória; em
-- produção a tabela está vazia, então este UPDATE não toca em nada.
UPDATE "leagues" SET "initial_balance" = 10000 WHERE "initial_balance" IS NULL;

ALTER TABLE "leagues" ALTER COLUMN "initial_balance" SET NOT NULL;

-- 2. Carteira do participante: o dinheiro que ele ainda tem **nesta** liga.
ALTER TABLE "league_participants" ADD COLUMN "cash_balance" DECIMAL(20,8);

-- Participação existente começa com a base da liga de que ela faz parte —
-- nenhuma ordem foi executada ainda, então saldo e base coincidem.
UPDATE "league_participants" AS p
SET "cash_balance" = l."initial_balance"
FROM "leagues" AS l
WHERE l."id" = p."league_id" AND p."cash_balance" IS NULL;

ALTER TABLE "league_participants" ALTER COLUMN "cash_balance" SET NOT NULL;

-- Sem default no banco, de propósito: o valor vem sempre da aplicação, que o lê
-- da liga. Um default aqui deixaria passar calado um INSERT que esqueceu o
-- saldo, e o participante começaria com zero sem ninguém perceber.
