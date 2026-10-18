# Decisões

Documento vivo, atualizado junto do código. Cada decisão registra o **trade-off**,
não só a escolha.

---

## 1. Premissas:
Cadastro de conta:
- O e-mail é a identidade da conta e é único.
- Senha de 8 a 72 caracteres.
- Nome é usado na liga, não é unico.
- Em um MVP entre amigos, optei por mostrar se já existe um e-mail cadastrado ao efetuar novo cadastro.
- Lista de ligas, Liga encerrada continua na lista.
- Liga Ordem: em andamento primeiro, depois agendadas, encerradas no fim; dentro de cada grupo, a de início mais recente antes.

## 2. Arquitetura:
- Ambiente local em Docker.
- PostgreSQL.
- Prisma para Migrate.
- Módulo por domínio (`users`), com Controller (HTTP), Service (regra de negocio) e
  Repositório (banco) separados.
- JWT Bearer.
- Leagues (data), league_participants (quem participa), league_invites (convites para ligas)

**Principais decisões técnicas:**
Infra:
- Docker.

Cadastro:
- Cadastro de novo usuário, minimo de 8 caracteres, isso é melhor do que não ter um minimo e o usuário cadastrar uma senha que seja facil de memorizar mas, facil de quebrar também, exemplo: "Ps1".
- Validação para verificar se a senha foi digitada corretamente, com a opção de "Confirmar nova senha".
- LIB bcryptjs para hash de senha, JS puro, não vou precisar mexer no build.

Login:
- JWT Bearer + LocalStorage (api devolve token, eu salvo no localstorage).
- 7 dias de duração.

Liga:
- Como é uma liga entre amigos, não tem necessidade de permissões.
- Criado da Liga entra como participante, liga não tem "dono exclusivo que adminstra".
- Duração da liga em horas é o ciclo completo do dia, 24hs completas.

**Do que se abriu mão:**
- LIB bcrypt nativo, mais rapido, so que eu ia ter que mexer na build, como o tempo é curto, preferi deixar assim.
- Confirmação de e-mail e recuperação de senha.
- Privacidade dos usuarios cadastrados na plataforma, uma vez que eu listo todos ao convidar para a Liga e caso tenha duas pessoas com o mesmo nome, pode haver erro na hora de mandar o convite (pra qual pessoa foi!?).
- Performace, como vai listar todos os usuários cadastrados, no futuro, com uma base maior, consulta vai ficar pesada.
- Abri mão do usuario entrar em uma liga já iniciada, tendo desvantagem, mas isso deixei pra ser escolha do usuário, o sistema já informa que está em andamento, deixo pro usuário decidir o risco.
- Abri mão de um update simples e rapido para dar baixa se o usuário aceitou o convite, mas, eu teria que ficar fazer update e filtro em demais lugares para ficar validando.

## 3. Features próprias:
- Criei uma feature, onde é listado todos os usuarios cadastrados na aplicação, assim, facilita o envio de convites para participar da Liga, já que é um MVP entre amigos.
- Só é permitido participar de uma liga, se ela está agendada ou em andamento, liga encerrada sistema recusa o aceite.
- Cirei uma tabela, responsável por armazenar os convites pendentes, "aceitar" virou um transação (apaga convite e cria participação, simples e objetivo).

## 4. O que ficou de fora:
- Rate limit no cadastro. A rota é pública e hoje aceita cadastro em volume, não tratei.
- Rate limit no login. A rota aceita volumes de tentativas erradas.
- Refresh token e revogação de sessão. "Sair" apaga o token do navegador; no
  servidor ele continua válido até expirar.
- Poder excluir pessoas da liga ou editar (como é um MVP de amigos, não tem necessidade de ter regras complexas para um uso "simples").
- Paginação da lista de ligas.
- Detalhes da liga.

## 5. Próximos passos: