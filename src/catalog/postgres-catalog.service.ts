import { NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type {
  Prisma,
  Dish as DbDish,
  Restaurant as DbRestaurant,
} from '../generated/prisma/client';
import { BudgetSearchDto, CatalogQuery, PageQuery } from './catalog.dto';
import type { Dish } from './catalog.types';

export const osmAttribution = {
  text: '© OpenStreetMap contributors',
  url: 'https://www.openstreetmap.org/copyright',
  license: 'ODbL-1.0',
};
const restaurantWhere: Prisma.RestaurantWhereInput = {
  contentStatus: 'PUBLISHED',
  verified: true,
};
const money = (value: bigint) =>
  `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
const validId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export class PostgresCatalogService {
  constructor(private readonly db: DatabaseService) {}
  private page<T>(rows: T[], query: PageQuery) {
    const hasNextPage = rows.length > query.limit;
    return {
      data: rows.slice(0, query.limit),
      meta: {
        source: 'postgres',
        limit: query.limit,
        offset: query.offset,
        hasNextPage,
        nextOffset: hasNextPage ? query.offset + query.limit : null,
        attributions: [osmAttribution],
      },
    };
  }
  private mapRestaurant(r: DbRestaurant) {
    return {
      id: r.id,
      name: r.name,
      area: r.area,
      open: r.open,
      latitude: r.latitude,
      longitude: r.longitude,
      address: r.address,
    };
  }
  private mapDish(d: DbDish & { restaurant: DbRestaurant }): Dish {
    return {
      id: d.id,
      name: d.name,
      category: d.category,
      price: d.price,
      priceCdf: `${d.price}.00`,
      currency: 'CDF',
      restaurantId: d.restaurantId,
      restaurant: d.restaurant.name,
      area: d.restaurant.area,
      image: d.image,
      description: d.description,
      servings: d.servings,
      available: d.available,
      open: d.restaurant.open,
      daily: d.daily,
      rating: 0,
      reviewCount: 0,
      likes: 0,
    };
  }
  private dishWhere(query: CatalogQuery): Prisma.DishWhereInput {
    const words = (query.q ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(
        (w) => ({ pitsa: 'pizza', hamburger: 'burger' })[w.toLowerCase()] ?? w,
      );
    return {
      contentStatus: 'PUBLISHED',
      restaurant: {
        ...restaurantWhere,
        ...(query.area && query.area !== 'Tout Kinshasa'
          ? { area: { equals: query.area, mode: 'insensitive' as const } }
          : {}),
      },
      ...(query.category
        ? { category: { equals: query.category, mode: 'insensitive' } }
        : {}),
      ...(query.restaurantId
        ? {
            restaurantId: validId(query.restaurantId)
              ? query.restaurantId
              : '00000000-0000-0000-0000-000000000000',
          }
        : {}),
      ...(query.maxPrice !== undefined
        ? { price: { lte: query.maxPrice } }
        : {}),
      ...(query.available !== undefined ? { available: query.available } : {}),
      AND: words.map((word) => ({
        OR: [
          { name: { contains: word, mode: 'insensitive' } },
          { category: { contains: word, mode: 'insensitive' } },
          { description: { contains: word, mode: 'insensitive' } },
          { restaurant: { name: { contains: word, mode: 'insensitive' } } },
          { restaurant: { area: { contains: word, mode: 'insensitive' } } },
        ],
      })),
    };
  }
  async dishes(query: CatalogQuery) {
    const rows = await this.db.client.dish.findMany({
      where: this.dishWhere(query),
      include: { restaurant: true },
      orderBy: { id: 'asc' },
      skip: query.offset,
      take: query.limit + 1,
    });
    return this.page(
      rows.map((d) => this.mapDish(d)),
      query,
    );
  }
  async dish(id: string) {
    if (!validId(id)) throw new NotFoundException('Plat introuvable');
    const row = await this.db.client.dish.findFirst({
      where: { id, ...this.dishWhere({ limit: 1, offset: 0 }) },
      include: { restaurant: true },
    });
    if (!row) throw new NotFoundException('Plat introuvable');
    return {
      data: this.mapDish(row),
      meta: { source: 'postgres', attributions: [osmAttribution] },
    };
  }
  async restaurants(query: PageQuery) {
    const rows = await this.db.client.restaurant.findMany({
      where: restaurantWhere,
      orderBy: { id: 'asc' },
      skip: query.offset,
      take: query.limit + 1,
    });
    return this.page(
      rows.map((r) => this.mapRestaurant(r)),
      query,
    );
  }
  async restaurant(id: string) {
    if (!validId(id)) throw new NotFoundException('Restaurant introuvable');
    const row = await this.db.client.restaurant.findFirst({
      where: { id, ...restaurantWhere },
    });
    if (!row) throw new NotFoundException('Restaurant introuvable');
    return {
      data: this.mapRestaurant(row),
      meta: { source: 'postgres', attributions: [osmAttribution] },
    };
  }
  async restaurantDishes(id: string, query: PageQuery) {
    await this.restaurant(id);
    return this.dishes({ ...query, restaurantId: id });
  }
  async categories() {
    const rows = await this.db.client.dish.findMany({
      where: { contentStatus: 'PUBLISHED', restaurant: restaurantWhere },
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return { data: rows.map((r) => r.category), meta: { source: 'postgres' } };
  }
  async areas() {
    const rows = await this.db.client.restaurant.findMany({
      where: restaurantWhere,
      distinct: ['area'],
      select: { area: true },
      orderBy: { area: 'asc' },
    });
    return {
      data: rows.map((r) => r.area),
      meta: { source: 'postgres', attributions: [osmAttribution] },
    };
  }
  async budget(query: BudgetSearchDto) {
    // Prix/quantité et tri en SQL, résultat borné ; aucun scan de toute la DB dans Node.
    const rows = await this.db.client.$queryRaw<
      { id: string; quantity: number }[]
    >`
      SELECT d.id, ceil(${query.people}::numeric/d.servings)::integer AS quantity
      FROM "Dish" d JOIN "Restaurant" r ON r.id=d."restaurantId"
      WHERE d."contentStatus"='PUBLISHED' AND d.available AND d.category <> 'Desserts'
        AND r."contentStatus"='PUBLISHED' AND r.verified AND r.open
        AND (${query.area ?? ''} IN ('','Tout Kinshasa') OR lower(r.area)=lower(${query.area ?? ''}))
        AND d.price::bigint * ceil(${query.people}::numeric/d.servings) <= ${query.budget}
      ORDER BY d.price::bigint * ceil(${query.people}::numeric/d.servings), d.id
      LIMIT ${query.limit + 1} OFFSET ${query.offset}`;
    const dishes = await this.db.client.dish.findMany({
      where: {
        id: { in: rows.map((r) => r.id) },
        ...this.dishWhere({ limit: 50, offset: 0, available: true }),
      },
      include: { restaurant: true },
    });
    const byId = new Map(dishes.map((d) => [d.id, d]));
    const proposals = rows.flatMap((row) => {
      const raw = byId.get(row.id);
      if (!raw) return [];
      const dish = this.mapDish(raw);
      const total = BigInt(dish.price) * 100n * BigInt(row.quantity);
      const budget = BigInt(query.budget) * 100n;
      if (!dish.open || total > budget) return [];
      return [
        {
          currency: 'CDF',
          budget: money(budget),
          people: query.people,
          items: [
            {
              dish,
              quantity: row.quantity,
              unitPrice: dish.priceCdf,
              lineTotal: money(total),
            },
          ],
          total: money(total),
          remainingBudget: money(budget - total),
          pricePerPerson: money(
            (total * 2n + BigInt(query.people)) / (2n * BigInt(query.people)),
          ),
          coverageBasis: 'EDITORIAL_PORTION',
          restaurantId: dish.restaurantId,
        },
      ];
    });
    return this.page(proposals, query);
  }
}
