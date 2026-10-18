# Decisões

Documento vivo, atualizado junto do código. Cada decisão registra o **trade-off**,
não só a escolha.

---

## 1. Premissas:


## 2. Arquitetura:
- Ambiente local em Docker.
- PostgreSQL.
- Prisma para Migrate.

**Principais decisões técnicas:**
- Docker.
Cadastro:
- Cadastro de novo usuário, minimo de 8 caracteres, isso é melhor do que não ter um minimo e o usuário cadastrar uma senha que seja facil de memorizar mas, facil de quebrar também, exemplo: "Ps1".
- Validação para verificar se a senha foi digitada corretamente, com a opção de "Confirmar nova senha".

**Do que se abriu mão:**



## 3. Features próprias:


## 4. O que ficou de fora:


## 5. Próximos passos: