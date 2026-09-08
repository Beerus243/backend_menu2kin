import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UnauthorizedException } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminRestaurantQueryDto, OsmImportDto, UpdateRestaurantDto } from './admin.dto';

@ApiTags('Administration catalogue')
@ApiHeader({ name: 'x-admin-key', required: true, description: 'Clé de développement ; remplacer par JWT/RBAC avant production.' })
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('osm/imports')
  importOsm(@Headers('x-admin-key') key: string | undefined, @Body() body: OsmImportDto) {
    this.authorize(key);
    return this.admin.importOsm(body);
  }

  @Get('restaurants')
  restaurants(@Headers('x-admin-key') key: string | undefined, @Query() query: AdminRestaurantQueryDto) {
    this.authorize(key);
    return this.admin.restaurants(query);
  }

  @Get('restaurants/:id')
  restaurant(@Headers('x-admin-key') key: string | undefined, @Param('id') id: string) {
    this.authorize(key);
    return this.admin.restaurant(id);
  }

  @Patch('restaurants/:id')
  updateRestaurant(@Headers('x-admin-key') key: string | undefined, @Param('id') id: string, @Body() body: UpdateRestaurantDto) {
    this.authorize(key);
    return this.admin.updateRestaurant(id, body);
  }

  @Post('restaurants/:id/publish')
  publish(@Headers('x-admin-key') key: string | undefined, @Param('id') id: string) {
    this.authorize(key);
    return this.admin.publish(id);
  }

  private authorize(key: string | undefined) {
    const configured = process.env.ADMIN_API_KEY;
    if (!configured || !key || key !== configured) throw new UnauthorizedException('Clé admin invalide');
  }
}