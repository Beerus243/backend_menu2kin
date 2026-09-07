import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [CatalogModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
