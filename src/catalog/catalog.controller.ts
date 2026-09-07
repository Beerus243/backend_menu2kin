import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BudgetSearchDto, CatalogQuery, PageQuery } from './catalog.dto';
import {
  ApiCatalogResponse,
  dishSchema,
  restaurantSchema,
  budgetSchema,
} from './catalog.openapi';
import { CatalogService } from './catalog.service';

@ApiTags('Catalogue mobile')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('dishes')
  @ApiCatalogResponse(dishSchema)
  @ApiOperation({
    summary: 'Plats compatibles avec le modèle Flutter, liste paginée',
  })
  dishes(@Query() query: CatalogQuery) {
    return this.catalog.dishes(query);
  }

  @Get('dishes/:id')
  @ApiCatalogResponse(dishSchema, false)
  dish(@Param('id') id: string) {
    return this.catalog.dish(id);
  }

  @Get('restaurants')
  @ApiCatalogResponse(restaurantSchema)
  restaurants(@Query() query: PageQuery) {
    return this.catalog.restaurants(query);
  }

  @Get('restaurants/:id')
  @ApiCatalogResponse(restaurantSchema, false)
  restaurant(@Param('id') id: string) {
    return this.catalog.restaurant(id);
  }

  @Get('restaurants/:id/dishes')
  @ApiCatalogResponse(dishSchema)
  restaurantDishes(@Param('id') id: string, @Query() query: PageQuery) {
    return this.catalog.restaurantDishes(id, query);
  }

  @Get('categories')
  @ApiCatalogResponse({ type: 'string' }, true, false)
  categories() {
    return this.catalog.categories();
  }

  @Get('areas')
  @ApiCatalogResponse({ type: 'string' }, true, false)
  areas() {
    return this.catalog.areas();
  }

  @Get('search')
  @ApiCatalogResponse(dishSchema)
  @ApiOperation({
    summary: 'Recherche de plats, restaurant et quartier inclus dans le texte',
  })
  search(@Query() query: CatalogQuery) {
    return this.catalog.dishes(query);
  }

  @Post('budget/search')
  @HttpCode(200)
  @ApiCatalogResponse(budgetSchema)
  @ApiOperation({
    summary: 'Quantités d’un plat principal dans le budget, calcul exact',
  })
  budget(@Body() body: BudgetSearchDto) {
    return this.catalog.budget(body);
  }
}
