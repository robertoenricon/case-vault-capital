# Decisões

Documento vivo, atualizado junto do código. Cada decisão registra o **trade-off**,
não só a escolha.

---

## 1. Premissas:
Cadastro de conta:
- O e-mail é a identidade da conta e é único.
- Senha de 8 a 72 caracteres.
- Nome é usado na liga, não é unico.

## 2. Arquitetura:
- Ambiente local em Docker.
- PostgreSQL.
- Prisma para Migrate.
- Módulo por domínio (`users`), com Controller (HTTP), Service (regra de negocio) e
  Repositório (banco) separados.
- 

**Principais decisões técnicas:**
Infra:
- Docker.

Cadastro:
- Cadastro de novo usuário, minimo de 8 caracteres, isso é melhor do que não ter um minimo e o usuário cadastrar uma senha que seja facil de memorizar mas, facil de quebrar também, exemplo: "Ps1".
- Validação para verificar se a senha foi digitada corretamente, com a opção de "Confirmar nova senha".
- LIB bcryptjs para hash de senha, JS puro, não vou precisar mexer no build.
- Resposta generica ao usuário tentar cadastrar um e-mail que já existe, mesmo sendo um MVP, optei pela segurança.


**Do que se abriu mão:**
- LIB bcrypt nativo, mais rapido, so que eu ia ter que mexer na build, como o tempo é curto, preferi deixar assim.
- Confirmação de e-mail e recuperação de senha.
- Rate limit no cadastro. A rota é pública e hoje aceita cadastro em volume, não tratei.


## 3. Features próprias:


## 4. O que ficou de fora:


## 5. Próximos passos: