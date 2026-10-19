import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Infraestrutura de banco. Fica num módulo próprio para que cada módulo de
 * domínio declare explicitamente que usa o banco, em vez de o acesso ficar
 * disponível em todo lugar por ser global.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
