import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function catalogSource(): 'demo' | 'postgres' {
  const source = process.env.CATALOG_SOURCE ?? 'demo';
  if (source !== 'demo' && source !== 'postgres')
    throw new Error('CATALOG_SOURCE doit être demo ou postgres');
  return source;
}
export function createDatabaseClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString))
    throw new Error('DATABASE_URL PostgreSQL requis');
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 5000,
    }),
  });
}
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private connection?: PrismaClient;
  get client(): PrismaClient {
    if (!this.connection) throw new Error('PostgreSQL non activé');
    return this.connection;
  }
  async onModuleInit() {
    if (catalogSource() === 'postgres') {
      this.connection = createDatabaseClient();
      await this.connection.$connect();
      await this.connection.$queryRaw`SELECT postgis_version()`;
    }
  }
  async onModuleDestroy() {
    await this.connection?.$disconnect();
  }
}
