## Desafio técnico Case Vault Capital

Liga trading: amigos criam uma liga, recebem o mesmo saldo fictício e
competem operando cripto com cotação real.

## Rodando localmente

Único pré-requisito: **Docker**.

```bash
git clone <url-do-repositorio>
cd case-vault-capital
cp .env.example .env
docker compose up --build
```

Web (React + Vite) = http://localhost:{PORT}
API (NestJS) = http://localhost:{PORT}

Para conferir se subiu: `http://localhost:{PORT}`

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
docker compose exec api npx prisma migrate deploy

# criar uma migration nova depois de editar o schema.prisma
docker compose exec api npx prisma migrate dev --name descricao_curta
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
- [ ] Deploy publico (gerar link)
- [ ] README: rodar localmente + link da aplicação + como criar conta/usuário de teste
- [ ] DECISIONS.md (pegar o que está no pdf e responder)
- [ ] Histórico de commits frequente e legível
