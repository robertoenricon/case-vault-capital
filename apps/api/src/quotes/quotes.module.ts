import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BinanceQuotesProvider } from './binance-quotes-provider.js';
import { QUOTES_PROVIDER } from './quotes-provider.js';
import { QuotesController } from './quotes.controller.js';

/**
 * Cotações: de onde vem o preço real das criptos.
 *
 * Importa só `auth`, para proteger a própria rota. Não conhece banco nem liga:
 * cotação não é dado nosso, é leitura de fora.
 *
 * É aqui — e só aqui — que se escolhe **qual** fonte atende o contrato. Trocar
 * a Binance por outra API, ou embrulhá-la num provider com cache, é mudar esta
 * linha; nenhum consumidor da interface fica sabendo.
 *
 * Exporta o `QUOTES_PROVIDER` — e só ele — desde que o módulo de ordens
 * passou a precisar do preço para executar uma compra. Quem o recebe depende
 * da **interface**, não da Binance: trocar de fonte continua sendo mexer na
 * linha de `providers` abaixo, sem nenhum consumidor ficar sabendo.
 *
 * O controller e o adaptador concreto seguem privados: nenhum outro módulo tem
 * motivo para alcançar a implementação direto.
 */
@Module({
  imports: [AuthModule],
  controllers: [QuotesController],
  providers: [{ provide: QUOTES_PROVIDER, useClass: BinanceQuotesProvider }],
  exports: [QUOTES_PROVIDER],
})
export class QuotesModule {}
