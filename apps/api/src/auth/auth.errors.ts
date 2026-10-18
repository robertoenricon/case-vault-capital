import { DomainError } from '../common/errors/domain-error.js';

/**
 * E-mail não cadastrado ou senha errada.
 *
 * Decisão de produto: **um único erro para os dois casos**, com mensagem que
 * não diz qual dos dois falhou. Dizer "este e-mail não existe" entregaria a
 * quem tenta adivinhar uma lista de contas válidas da plataforma.
 *
 * Isso é assimétrico em relação ao cadastro, que responde "este e-mail já está
 * em uso" (ver users/users.errors.ts): lá a informação é útil para quem está
 * criando a conta e não há senha em jogo. Aqui o erro é a resposta a uma
 * tentativa de acesso — o lado em que o detalhe só ajuda quem está tentando
 * entrar sem ser o dono.
 *
 * Preço assumido: quem errou a senha da própria conta lê uma mensagem mais
 * vaga do que poderia.
 */
export class InvalidCredentialsError extends DomainError {
  readonly kind = 'unauthorized' as const;
  readonly publicMessage = 'E-mail ou senha incorretos.';

  constructor(email: string) {
    // O e-mail tentado vai para o log, nunca para a resposta: é o que permite
    // investigar uma sequência de tentativas sem contar nada a quem tentou.
    super(`Tentativa de login sem sucesso para o e-mail: ${email}`);
    this.name = 'InvalidCredentialsError';
  }
}
