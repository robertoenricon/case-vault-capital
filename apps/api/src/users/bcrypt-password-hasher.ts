import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import type { PasswordHasher } from './password-hasher.js';

/**
 * Custo do bcrypt: 2^12 iterações. Alto o suficiente para tornar a quebra em
 * massa caro e baixo o suficiente para o cadastro responder em algumas centenas
 * de milissegundos. Subir isso é a forma de acompanhar o hardware ficando mais
 * rápido — o custo fica gravado no próprio hash, então senhas antigas continuam
 * validando.
 */
const COST = 12;

/** Implementação concreta na borda: é o único arquivo que conhece o bcrypt. */
@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, COST);
  }

  /**
   * O custo usado no cadastro está gravado no próprio hash, então o `compare`
   * não recebe `COST`: ele lê do hash e repete o mesmo trabalho. É por isso que
   * aumentar a constante acima não invalida as senhas já cadastradas.
   *
   * A comparação do bcrypt é em tempo constante — não dá para descobrir a senha
   * medindo quanto tempo a resposta levou.
   */
  compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return compare(plainPassword, passwordHash);
  }
}
