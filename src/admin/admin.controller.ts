import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import {
  LinkCandidateDto,
  UpdateDishDto,
  AdminRestaurantQueryDto,
  CreateRestaurantDto,
  DishDraftDto,
  OsmImportDto,
  UpdateRestaurantDto,
  VersionDto,
  WebsiteImportDto,
} from './admin.dto';
@ApiTags('Administration catalogue')
@ApiHeader({
  name: 'x-admin-key',
  required: true,
  description: 'Clé opérateur serveur forte ; ne pas exposer publiquement.',
})
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}
  @Post('osm/imports') importOsm(@Body() body: OsmImportDto) {
    return this.admin.importOsm(body);
  }
  @Post('websites/imports') importWebsite(@Body() body: WebsiteImportDto) {
    return this.admin.importWebsite(body);
  }
  @Post('osm/candidates/:id/link') link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: LinkCandidateDto,
  ) {
    return this.admin.linkCandidate(id, body.restaurantId);
  }
  @Get('websites/candidates') websites(
    @Query() query: AdminRestaurantQueryDto,
  ) {
    return this.admin.websiteCandidates(query);
  }
  @Get('osm/candidates') candidates(@Query() query: AdminRestaurantQueryDto) {
    return this.admin.candidates(query);
  }
  @Get('restaurants') restaurants(@Query() query: AdminRestaurantQueryDto) {
    return this.admin.restaurants(query);
  }
  @Post('restaurants') create(@Body() body: CreateRestaurantDto) {
    return this.admin.createRestaurant(body);
  }
  @Get('restaurants/:id') restaurant(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.restaurant(id);
  }
  @Patch('restaurants/:id') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRestaurantDto,
  ) {
    return this.admin.updateRestaurant(id, body);
  }
  @Post('restaurants/:id/publish') publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: VersionDto,
  ) {
    return this.admin.publish(id, body);
  }
  @Patch('dishes/:id') updateDish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDishDto,
  ) {
    return this.admin.updateDish(id, body);
  }
  @Get('restaurants/:id/dishes') dishes(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.dishes(id);
  }
  @Post('restaurants/:id/dishes') dish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DishDraftDto,
  ) {
    return this.admin.createDish(id, body);
  }
}
