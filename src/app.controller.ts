import {
  Controller,
  Get,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service';
import { DatabaseService, catalogSource } from './database/database.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @Optional() private readonly database?: DatabaseService,
  ) {}

  @Get('health')
  async health() {
    if (catalogSource() === 'postgres') {
      try {
        if (!this.database) throw new Error();
        await this.database.client.$queryRaw`SELECT 1`;
      } catch {
        throw new ServiceUnavailableException('Base de données indisponible');
      }
    }
    return { data: { status: 'ok', catalogSource: catalogSource() } };
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
