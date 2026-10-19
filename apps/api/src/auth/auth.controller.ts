import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

/** O que a API devolve no login. Token + o mínimo sobre quem entrou. */
type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Login. Rota pública por definição — exigir token para obter um token não
   * faria sentido —, então a ausência de guard aqui é decisão, não esquecimento.
   *
   * 200 e não o 201 que o Nest usa por padrão em POST: login não cria recurso,
   * devolve uma credencial de sessão.
   *
   * Credencial errada vira 401 no DomainExceptionFilter; o controller não trata
   * esse caso nem conhece o status.
   */
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() body: LoginDto): Promise<LoginResponse> {
    const { accessToken, user } = await this.auth.login(body);

    // Resposta montada campo a campo, como no cadastro: coluna nova no banco
    // não passa a aparecer na API sem alguém decidir.
    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email },
    };
  }
}
