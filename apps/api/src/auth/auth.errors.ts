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

/**
 * Rota protegida chamada sem `Authorization: Bearer <token>`.
 *
 * Separado do token inválido porque são situações diferentes para quem está na
 * tela: aqui provavelmente a sessão nunca existiu (ou o front esqueceu de
 * mandar o header), não expirou.
 */
export class MissingAccessTokenError extends DomainError {
  readonly kind = 'unauthorized' as const;
  readonly publicMessage = 'Entre para continuar.';

  constructor(method: string, path: string) {
    // Qual rota foi chamada sem token vai para o log: é o que mostra se o
    // problema é o front esquecendo o header numa chamada específica.
    super(`Requisição sem token de acesso: ${method} ${path}`);
    this.name = 'MissingAccessTokenError';
  }
}

/**
 * Token presente, mas que não vale: expirado, assinado com outro segredo ou
 * adulterado.
 *
 * A mensagem fala de sessão expirada por ser o caso real em quase todo acesso
 * legítimo — o token vale 7 dias. Quem adulterou um token lê a mesma frase: o
 * verificador não distingue as causas de propósito (ver access-token-verifier.ts).
 */
export class InvalidAccessTokenError extends DomainError {
  readonly kind = 'unauthorized' as const;
  readonly publicMessage = 'Sua sessão expirou. Entre novamente para continuar.';

  constructor(method: string, path: string) {
    super(`Token de acesso rejeitado em: ${method} ${path}`);
    this.name = 'InvalidAccessTokenError';
  }
}
