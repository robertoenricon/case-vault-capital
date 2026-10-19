## Desafio técnico Case Vault Capital

Liga trading: amigos criam uma liga, recebem o mesmo saldo fictício e
competem operando cripto com cotação real.

## Aplicação publicada

- https://case-vault-capital-web.vercel.app |

### Criando uma conta

O cadastro é aberto — não existe convite para entrar na plataforma, só para
entrar numa liga. Não há usuário de teste pré-criado.

1. Abra https://case-vault-capital-web.vercel.app.
2. Clique em **Criar conta**.
3. O cadastro devolve para a tela de login com o e-mail já preenchido.
   Clique em **Entrar**.

**Crie duas contas para ver a liga funcionando**, a segunda numa janela anônima.
O convite é feito escolhendo alguém que já tem conta: com um usuário só, a liga
fica com um participante e o ranking com uma linha.

### Roteiro de cinco minutos

1. **Criar liga** — nome e período. Quem cria já entra como participante, com o
   saldo fictício inicial de **US$ 10.000**.
2. **Convidar amigos** — escolha a segunda conta na lista.
3. Na segunda conta, **Aceitar** o convite que aparece no dashboard.
4. **Comprar** e **Vender** bitcoin. A cotação é buscada na API pública da
   Binance pelo backend: o cliente diz o que e quanto, nunca por quanto.
5. **Ranking** — ordena por patrimônio (caixa + bitcoin avaliado ao preço atual)
   e exibe o retorno percentual sobre o saldo inicial.

## Rodando localmente

Único pré-requisito: **Docker**.

```bash
git clone <url-do-repositorio>
cd case-vault-capital
cp .env.example .env
docker compose up --build
```

| Serviço | URL |
| --- | --- |
| Web (React + Vite) | http://localhost:5173 |
| API (NestJS) | http://localhost:3100 |

A porta da API vem de `API_PORT` no `.env` (3100 no exemplo); a do front é fixa
em 5173. Para conferir se a API subiu, `http://localhost:3100` responde um texto
curto. O cadastro é o mesmo descrito acima, pelo front em http://localhost:5173.

### Comandos do dia a dia

```bash
docker compose up --build -d  # sobe em background
docker compose logs -f api    # acompanha o log de um serviço
docker compose exec api sh    # abre um shell dentro do container
```

Dependência nova é instalada dentro do container, e o watch não detecta sozinho:

```bash
docker compose exec api npm install <pacote>   # ou: exec web
docker compose restart api
```

O `package.json` e o `package-lock.json` ficam no host, então a mudança aparece
no `git status` normalmente. O porquê de não ser um `npm install` na sua máquina
está na nota de ambiente no fim deste arquivo.

### Banco de dados

O Postgres sobe junto, no serviço `db`, com volume próprio (`pgdata`). A API só
inicia depois que o banco responde — o `depends_on` espera o healthcheck, não só
o container.

```bash
docker compose exec db psql -U vault -d vault_capital   # abre o psql no banco de dev
```

#### Migrations (Prisma)

O schema vive em `apps/api/prisma/schema.prisma` e é a única fonte da modelagem.
O banco **nunca** é alterado à mão: toda mudança vira uma migration versionada em
`apps/api/prisma/migrations/`, aplicada automaticamente em quem der `migrate dev`.

```bash
# aplica no banco local as migrations que ainda faltam
docker compose exec api npm run db:migrate:deploy

# criar uma migration nova depois de editar o schema.prisma
docker compose exec api npx prisma migrate dev --config prisma7.config.ts --name descricao_curta
```

Do host (DBeaver, Navicat, etc.), use as variaveis do .env:
- HOST: localhost
- Port: POSTGRES_PORT
- DB:   POSTGRES_DB
- User: POSTGRES_USER
- Pass: POSTGRES_PASSWORD

### Como o ambiente está montado

```
apps/api/          — Dockerfile de desenvolvimento
apps/api/prisma/   — schema do banco e migrations versionadas
apps/web/          — Dockerfile de desenvolvimento
docker-compose.yml — orquestra api, web e o banco
.env.example       — variáveis de ambiente (copiar para .env)
```

## Checklist de entrega
- [X] Repo no GitHub com `pedro-gattai` como colaborador
- [X] React + NestJS + TypeScript + PostgreSQL
- [X] Cadastro e login
- [X] Criar liga + convidar
- [X] Saldo fictício inicial por participante
- [X] Compra e venda com cotação real
- [X] Ranking da liga

Deploy:
- [X] Deploy público (front e back no ar)
- [X] README: rodar localmente + link da aplicação + como criar conta/usuário de teste
- [X] DECISIONS.md (pegar o que está no pdf e responder)
- [X] Histórico de commits frequente e legível
