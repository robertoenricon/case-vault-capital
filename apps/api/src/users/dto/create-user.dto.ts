import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

/**
 * Contrato de entrada do cadastro. Os limites espelham o schema do banco e as
 * regras do formulário — o front valida para dar resposta imediata, mas quem
 * decide é esta camada: nada que chegue por HTTP é confiável.
 */

/**
 * Tira espaço das pontas antes de validar: "  ab  " não deve passar como nome
 * de 6 letras. O `transform: true` do ValidationPipe roda isto antes das
 * validações, independente da ordem dos decorators.
 */
function TrimString(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
}

export class CreateUserDto {
  // 120 = `name VarChar(120)` na tabela users.
  @IsString({ message: 'Informe seu nome.' })
  @Length(2, 120, {
    message: 'O nome precisa ter de 2 a 120 caracteres.',
  })
  @TrimString()
  name: string;

  // 255 = `email VarChar(255)` na tabela users.
  @IsEmail({}, { message: 'E-mail inválido.' })
  @MaxLength(255, { message: 'O e-mail pode ter no máximo 255 caracteres.' })
  @TrimString()
  email: string;

  // O teto de 72 não é capricho: o bcrypt ignora bytes além disso, então
  // aceitar mais seria truncar a senha em silêncio. Senha não leva trim —
  // espaço nas pontas é parte do segredo que a pessoa escolheu.
  @IsString({ message: 'Crie uma senha.' })
  @Length(8, 72, {
    message: 'A senha precisa ter de 8 a 72 caracteres.',
  })
  password: string;
}
