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
 * Não exporta nada ainda, pelo mesmo critério do `leagues`: ninguém depende de
 * cotação fora deste módulo. Quando o serviço de ordens existir, o
 * `QUOTES_PROVIDER` sai daqui explicitamente — e aí a exportação significa
 * alguma coisa.
 */
@Module({
  imports: [AuthModule],
  controllers: [QuotesController],
  providers: [{ provide: QUOTES_PROVIDER, useClass: BinanceQuotesProvider }],
})
export class QuotesModule {}
