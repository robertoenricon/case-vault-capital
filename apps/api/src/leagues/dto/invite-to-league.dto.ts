import { IsUUID } from 'class-validator';

/**
 * Contrato de entrada do convite: só quem está sendo convidado.
 *
 * A liga vem do caminho da rota e quem convida vem do token — nenhum dos dois
 * entra no corpo. Aceitar "quem convida" do cliente seria aceitar dele a
 * resposta de quem ele é.
 *
 * `UUID v7` e não só "uuid": todos os ids do projeto são v7, então id de outra
 * versão não existiria no banco de qualquer forma.
 */
export class InviteToLeagueDto {
  @IsUUID('7', { message: 'Pessoa inválida.' })
  userId: string;
}
