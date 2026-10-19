import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/**
 * Contrato de entrada da ordem: **o quê** e **quanto**. Jamais por quanto.
 *
 * Não existe campo de preço, e isso é inquebrável do projeto: o preço é obtido
 * pelo backend no instante da execução. Aceitá-lo do cliente deixaria qualquer
 * pessoa comprar bitcoin a um dólar.
 *
 * A liga vem do caminho da rota e quem opera vem do token — nenhum dos dois
 * entra no corpo.
 *
 * Valida só **formato**. O que é regra de negócio (quantidade maior que zero,
 * ativo negociável, saldo, liga em andamento) fica no domínio.
 */

/**
 * Número positivo com até 12 dígitos inteiros e 8 decimais, com ponto —
 * exatamente o que a coluna `numeric(20, 8)` aceita sem arredondar.
 *
 * Sem sinal, sem notação exponencial e sem vírgula: `-1` não é quantidade,
 * `1e5` chegaria ao banco como texto que ele não lê, e `0,5` viraria outro
 * número ou seria recusado dependendo de quem o interpretasse.
 *
 * É o mesmo formato já usado no saldo inicial da liga e na leitura do preço da
 * Binance — os três guardam decimal na mesma coluna.
 */
const DECIMAL_FORMAT = /^\d{1,12}(\.\d{1,8})?$/;

/**
 * Garante que o `@Matches` receba uma string: `{ "quantity": 0.5 }` no corpo
 * vira `''` e cai na mensagem de formato, em vez de depender de como a lib de
 * validação reage a um número.
 *
 * E recusar o número **é** a intenção: a quantidade tem de chegar como texto.
 * Um JSON com `0.1` já teria passado por ponto flutuante antes de ser lido.
 */
function AsDecimalString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : '',
  );
}

export class CreateOrderDto {
  /**
   * Código do ativo, como o produto o chama: `BTC`. Normalizado para maiúsculas
   * para que "btc" e "BTC" não virem dois ativos diferentes na tabela.
   */
  @IsString({ message: 'Informe a criptomoeda.' })
  // 10 = `symbol VarChar(10)` na tabela orders.
  @MaxLength(10, { message: 'Criptomoeda inválida.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  symbol: string;

  /**
   * Quantidade a comprar, em texto decimal (`"0.05"`).
   *
   * `string` e não `number` de propósito, mesmo sendo um número: é dinheiro
   * entrando no sistema. Tipado como `number`, o `JSON.parse` já o teria
   * transformado em float binário antes de qualquer validação nossa.
   */
  @AsDecimalString()
  @Matches(DECIMAL_FORMAT, {
    message:
      'Quantidade inválida. Use um número positivo com ponto decimal e até 8 casas.',
  })
  quantity: string;
}
