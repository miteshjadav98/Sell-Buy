import { Global, Module } from '@nestjs/common';
import { TRANSACTION_MANAGER } from '../../core/application/transaction-manager.port';
import { PrismaTransactionManager } from './prisma-transaction.manager';
import { PrismaService } from './prisma.service';

/**
 * Global so feature modules do not each re-import it, and so there is
 * unambiguously one instance.
 *
 * Note the binding: the application layer asks for the TRANSACTION_MANAGER
 * token (an interface it owns) and infrastructure supplies the Prisma
 * implementation. That inverted arrow is Dependency Inversion in practice.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionManager,
    { provide: TRANSACTION_MANAGER, useExisting: PrismaTransactionManager },
  ],
  exports: [PrismaService, PrismaTransactionManager, TRANSACTION_MANAGER],
})
export class PrismaModule {}
