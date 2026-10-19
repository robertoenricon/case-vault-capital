import { DomainError } from '../common/errors/domain-error.js';

/**
 * A liga não está em andamento: ou ainda vai começar, ou já encerrou.
 *
 * Decisão de produto: só se opera dentro da janela da liga. Comprar antes do
 * início seria entrar na disputa já posicionado, e o ranking passaria a
 * comparar pessoas que operaram em janelas diferentes — o período da liga
 * deixaria de significar alguma coisa.
 *
 * Um erro para os dois casos, com a situação no texto público: para quem está
 * na tela, "ainda não começou" e "já acabou" levam à mesma conclusão (não dá
 * para operar agora), mas saber qual dos dois é evita a pessoa ficar tentando.
 */
export class LeagueNotRunningError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage: string;

  constructor(leagueId: string, status: 'scheduled' | 'finished') {
    super(`Ordem recusada: a liga ${leagueId} está "${status}", não em andamento`);
    this.name = 'LeagueNotRunningError';
    this.publicMessage =
      status === 'scheduled'
        ? 'Esta liga ainda não começou. Você poderá operar a partir da data de início.'
        : 'Esta liga já encerrou. Não é mais possível operar nela.';
  }
}

/**
 * O saldo não cobre o custo da ordem.
 *
 * É `conflict`, não `invalid`: o pedido está correto e seria aceito com outro
 * saldo. O que falhou foi o estado atual da carteira, não o que o cliente
 * mandou — e separar os dois mantém o 400 significando "o payload não serve".
 *
 * A mensagem traz os dois números porque a tela calculou um total estimado
 * antes de enviar: sem eles, uma diferença causada pelo preço ter se movido
 * entre a tela e a execução pareceria um erro do sistema.
 */
export class InsufficientBalanceError extends DomainError {
  readonly kind = 'conflict' as const;
  readonly publicMessage: string;

  constructor(participantId: string, balance: string, cost: string) {
    super(
      `Saldo insuficiente na participação ${participantId}: custo ${cost}, saldo ${balance}`,
    );
    this.name = 'InsufficientBalanceError';
    // Os valores aparecem crus (texto decimal). Quem formata para "US$
    // 10.000,00" é a tela, como em todo o resto da API.
    this.publicMessage = `Saldo insuficiente: a ordem custa ${cost} e você tem ${balance} nesta liga.`;
  }
}

/**
 * A carteira não tem a quantidade que a venda pede.
 *
 * É a forma que **venda a descoberto não existe** toma no código: decisão de
 * produto registrada. Vender o que não se tem exigiria margem, limite de
 * exposição e o que fazer quando o preço sobe com a liga aberta — regra que o
 * MVP não resolve e, sem ela, dá para quebrar a liga vendendo infinito.
 *
 * `conflict` pelo mesmo motivo do saldo: o pedido está correto e seria aceito
 * com outra carteira. O que falhou é o estado atual, não o payload.
 *
 * A mensagem traz a posição porque a tela mostra um número que pode ter
 * mudado — outra ordem da mesma pessoa, ou simplesmente uma lista carregada
 * há um tempo.
 */
export class InsufficientPositionError extends DomainError {
  readonly kind = 'conflict' as const;
  readonly publicMessage: string;

  constructor(
    participantId: string,
    symbol: string,
    position: string,
    quantity: string,
  ) {
    super(
      `Posição insuficiente em ${symbol} na participação ${participantId}: venda de ${quantity}, carteira ${position}`,
    );
    this.name = 'InsufficientPositionError';
    // Valores crus (texto decimal), como em todo o resto da API. Quem formata
    // para "0,05 BTC" é a tela.
    this.publicMessage = `Você tem ${position} ${symbol} nesta liga e tentou vender ${quantity}.`;
  }
}

/**
 * Quantidade que não dá para negociar: zero.
 *
 * O formato (número positivo, até 8 casas) é conferido no DTO; o "maior que
 * zero" fica aqui, junto da regra — mesma divisão de `MalformedLeagueDateError`
 * em ligas: a borda pergunta "parece uma quantidade?", o domínio pergunta "é
 * uma quantidade que dá para operar?".
 */
export class NonPositiveOrderQuantityError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage = 'Informe uma quantidade maior que zero.';

  constructor(quantity: string) {
    super(`Quantidade de ordem não positiva: "${quantity}"`);
    this.name = 'NonPositiveOrderQuantityError';
  }
}

/**
 * Ativo que a plataforma não negocia.
 *
 * Hoje só existe bitcoin. O erro existe mesmo assim porque a rota recebe o
 * símbolo no corpo: sem ele, `{"symbol": "DOGE"}` seria cotado como bitcoin e
 * gravado como DOGE — uma posição em um ativo que ninguém comprou.
 */
export class UnsupportedOrderSymbolError extends DomainError {
  readonly kind = 'invalid' as const;
  readonly publicMessage = 'Esta criptomoeda não está disponível para negociação.';

  constructor(symbol: string) {
    super(`Ativo não negociável: "${symbol}"`);
    this.name = 'UnsupportedOrderSymbolError';
  }
}
