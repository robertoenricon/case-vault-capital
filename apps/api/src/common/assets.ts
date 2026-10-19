/**
 * Códigos dos ativos que a plataforma conhece.
 *
 * Mora em `common` porque três módulos precisam dizer "bitcoin" e nenhum deles
 * é dono da palavra: `quotes` devolve o preço dele, `orders` decide que é o
 * único negociável e `leagues` lê a posição dele para a lista de
 * participantes. Com a constante em um lugar só, não há como um módulo gravar
 * `BTC` e outro consultar `btc`.
 *
 * É o código **do produto**, não o par da corretora: a Binance negocia
 * `BTCUSDT`, e essa palavra não sai do adaptador dela.
 *
 * Uma constante, e não uma tabela de catálogo: o catálogo de criptos
 * negociáveis é decisão de produto ainda em aberto, e criar a tabela agora
 * seria modelar uma variação que não existe.
 */
export const BITCOIN = 'BTC';
