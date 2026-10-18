import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UsersService } from './users.service.js';

/** O que a API devolve sobre uma conta. Hash e data de atualização não entram. */
type UserResponse = {
  id: string;
  name: string;
  email: string;
};

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Cadastro de conta. Rota pública por definição: é o único jeito de alguém
   * passar a existir na plataforma, então a ausência de guard aqui é decisão,
   * não esquecimento.
   *
   * O 201 é o default do Nest para POST. Erro de e-mail repetido vira 409 no
   * DomainExceptionFilter — o controller não trata esse caso.
   */
  @Post()
  async create(@Body() body: CreateUserDto): Promise<UserResponse> {
    const user = await this.users.register(body);

    // Monta a resposta campo a campo, em vez de devolver a entidade inteira:
    // coluna nova no banco não passa a aparecer na API sem alguém decidir.
    return { id: user.id, name: user.name, email: user.email };
  }
}
