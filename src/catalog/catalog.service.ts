import { Injectable, NotFoundException } from '@nestjs/common';
import { BudgetSearchDto, CatalogQuery, PageQuery } from './catalog.dto';
import { demoDishes } from './demo-catalog';
import type { Restaurant } from './catalog.types';

export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
const synonyms: Readonly<Record<string, string>> = {
  hamburger: 'burger',
  pitsa: 'pizza',
};
const money = (cents: bigint): string =>
  `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

@Injectable()
export class CatalogService {
  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Le catalogue démo ne peut pas être utilisé en production.',
      );
    }
  }

  page<T>(items: readonly T[], query: PageQuery) {
    const data = items.slice(query.offset, query.offset + query.limit);
    const hasNextPage = query.offset + data.length < items.length;
    return {
      data,
      meta: {
        source: 'demo' as const,
        limit: query.limit,
        offset: query.offset,
        hasNextPage,
        nextOffset: hasNextPage ? query.offset + data.length : null,
      },
    };
  }

  dishes(query: CatalogQuery) {
    const tokens = normalize(query.q ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => synonyms[token] ?? token);
    const filtered = demoDishes.filter((dish) => {
      const text = normalize(
        `${dish.name} ${dish.category} ${dish.restaurant} ${dish.area} ${dish.description}`,
      );
      return (
        tokens.every((token) => text.includes(token)) &&
        (!query.category ||
          normalize(dish.category) === normalize(query.category)) &&
        (!query.area ||
          query.area === 'Tout Kinshasa' ||
          normalize(dish.area) === normalize(query.area)) &&
        (!query.restaurantId || dish.restaurantId === query.restaurantId) &&
        (query.maxPrice === undefined || dish.price <= query.maxPrice) &&
        (query.available === undefined || dish.available === query.available)
      );
    });
    return this.page(filtered, query);
  }

  dish(id: string) {
    const dish = demoDishes.find((entry) => entry.id === id);
    if (!dish) throw new NotFoundException('Plat introuvable');
    return { data: dish, meta: { source: 'demo' as const } };
  }

  restaurants(query: PageQuery) {
    const restaurants = new Map<string, Restaurant>();
    for (const dish of demoDishes) {
      restaurants.set(dish.restaurantId, {
        id: dish.restaurantId,
        name: dish.restaurant,
        area: dish.area,
        open: dish.open,
      });
    }
    return this.page([...restaurants.values()], query);
  }

  restaurant(id: string) {
    const restaurant = this.restaurants({ limit: 50, offset: 0 }).data.find(
      (entry) => entry.id === id,
    );
    if (!restaurant) throw new NotFoundException('Restaurant introuvable');
    return { data: restaurant, meta: { source: 'demo' as const } };
  }

  restaurantDishes(id: string, query: PageQuery) {
    this.restaurant(id);
    return this.dishes({ ...query, restaurantId: id });
  }

  categories() {
    return {
      data: [...new Set(demoDishes.map((dish) => dish.category))],
      meta: { source: 'demo' as const },
    };
  }

  areas() {
    return {
      data: [...new Set(demoDishes.map((dish) => dish.area))],
      meta: { source: 'demo' as const },
    };
  }

  budget(query: BudgetSearchDto) {
    const budget = BigInt(query.budget) * 100n;
    const proposals = demoDishes
      .filter(
        (dish) =>
          dish.available &&
          dish.open &&
          dish.servings > 0 &&
          dish.category !== 'Desserts' &&
          (!query.area ||
            query.area === 'Tout Kinshasa' ||
            normalize(dish.area) === normalize(query.area)),
      )
      .map((dish) => {
        const quantity = Math.ceil(query.people / dish.servings);
        const total = BigInt(dish.price) * 100n * BigInt(quantity);
        return { dish, quantity, total };
      })
      .filter((proposal) => proposal.total <= budget)
      .sort((a, b) =>
        a.total < b.total
          ? -1
          : a.total > b.total
            ? 1
            : a.dish.id.localeCompare(b.dish.id),
      )
      .map(({ dish, quantity, total }) => ({
        currency: 'CDF',
        budget: money(budget),
        people: query.people,
        items: [
          { dish, quantity, unitPrice: dish.priceCdf, lineTotal: money(total) },
        ],
        total: money(total),
        remainingBudget: money(budget - total),
        pricePerPerson: money(
          (total * 2n + BigInt(query.people)) / (2n * BigInt(query.people)),
        ),
        coverageBasis: 'EDITORIAL_PORTION',
        restaurantId: dish.restaurantId,
      }));
    return this.page(proposals, query);
  }
}
