import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Contrato de entrada do login. Valida **formato**, não política de senha: o
 * login não é o lugar de repetir "a senha precisa de 8 caracteres". Senha curta
 * aqui simplesmente não vai bater com nenhum hash, e a resposta correta é a
 * mesma de qualquer credencial errada — 401 genérico, não 400 explicando a regra.
 */

/** Mesmo trim do cadastro: " ana@mail.com " é a mesma identidade. */
function TrimString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export class LoginDto {
  // 255 = `email VarChar(255)` na tabela users.
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(255, { message: 'O e-mail pode ter no máximo 255 caracteres.' })
  @TrimString()
  email: string;

  // Senha não leva trim: espaço nas pontas é parte do segredo que a pessoa escolheu.
  //
  // O teto de 72 bate com o do cadastro (limite do bcrypt) e evita gastar CPU
  // hasheando um payload absurdo só para concluir que não bate com nada.
  @IsString({ message: 'Informe sua senha.' })
  @IsNotEmpty({ message: 'Informe sua senha.' })
  @MaxLength(72, { message: 'A senha pode ter no máximo 72 caracteres.' })
  password: string;
}
