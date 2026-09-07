import { NearbyController } from './nearby.controller';
import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PostgresCatalogService } from './postgres-catalog.service';
import { DatabaseService, catalogSource } from '../database/database.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [NearbyController, CatalogController],
  providers: [
    {
      provide: CatalogService,
      inject: [DatabaseService],
      useFactory: (db: DatabaseService) =>
        catalogSource() === 'postgres'
          ? new PostgresCatalogService(db)
          : new CatalogService(),
    },
  ],
})
export class CatalogModule {}
