import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public isConnected = false;

  async onModuleInit() {
    try {
      await this.$connect();
      this.isConnected = true;
      this.logger.log('Conexión con PostgreSQL establecida.');
    } catch (error) {
      this.isConnected = false;
      this.logger.warn(
        `PostgreSQL no está disponible en este momento. Operando en modo resiliente en memoria con datos en vivo de Binance.`
      );
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) {
      await this.$disconnect();
      this.logger.log('Conexión con PostgreSQL cerrada.');
    }
  }
}
