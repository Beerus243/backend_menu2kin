import { ApiOkResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';

const string = { type: 'string' } satisfies SchemaObject;
const integer = { type: 'integer' } satisfies SchemaObject;
const boolean = { type: 'boolean' } satisfies SchemaObject;
export const dishSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'name',
    'category',
    'price',
    'priceCdf',
    'currency',
    'restaurantId',
    'restaurant',
    'area',
    'image',
    'description',
    'servings',
    'available',
    'open',
    'daily',
    'rating',
    'reviewCount',
    'likes',
  ],
  properties: {
    id: string,
    name: string,
    category: string,
    price: {
      type: 'integer',
      description: 'FC entiers, compatibilité modèle Flutter initial',
      example: 12000,
    },
    priceCdf: {
      type: 'string',
      pattern: '^\\d+\\.[0-9]{2}$',
      example: '12000.00',
    },
    currency: { type: 'string', enum: ['CDF'] },
    restaurantId: string,
    restaurant: string,
    area: string,
    image: {
      type: 'string',
      description: 'Référence image du catalogue : clé asset démo ou URL média',
    },
    description: string,
    servings: integer,
    available: boolean,
    open: boolean,
    daily: boolean,
    rating: { type: 'number' },
    reviewCount: integer,
    likes: integer,
  },
};
export const restaurantSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'area', 'open'],
  properties: {
    id: string,
    name: string,
    area: string,
    open: boolean,
    latitude: { type: 'number' },
    longitude: { type: 'number' },
    address: string,
  },
};
export const budgetSchema: SchemaObject = {
  type: 'object',
  properties: {
    currency: { type: 'string', enum: ['CDF'] },
    budget: string,
    people: integer,
    total: string,
    remainingBudget: string,
    pricePerPerson: string,
    restaurantId: string,
    coverageBasis: { type: 'string', enum: ['EDITORIAL_PORTION'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dish: dishSchema,
          quantity: integer,
          unitPrice: string,
          lineTotal: string,
        },
      },
    },
  },
};

export function ApiCatalogResponse(
  item: SchemaObject,
  list = true,
  paginated = true,
): MethodDecorator {
  return ApiOkResponse({
    schema: {
      type: 'object',
      required: ['data', 'meta'],
      properties: {
        data: list ? { type: 'array', items: item } : item,
        meta: {
          type: 'object',
          properties: {
            source: { type: 'string', enum: ['demo', 'postgres'] },
            attributions: {
              type: 'array',
              items: {
                type: 'object',
                properties: { text: string, url: string, license: string },
              },
            },
            ...(paginated && list
              ? {
                  limit: integer,
                  offset: integer,
                  hasNextPage: boolean,
                  nextOffset: { type: 'integer', nullable: true },
                }
              : {}),
          },
        },
      },
    },
  });
}
