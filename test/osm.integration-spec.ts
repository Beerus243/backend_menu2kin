import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createDatabaseClient } from '../src/database/database.service';
import {
  OsmImportService,
  prepareImport,
} from '../src/osm/application/osm-import.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

// Base dédiée obligatoire ; aucun nettoyage global, seulement les IDs créés par cette suite.
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('DATABASE_URL vers une base suffixée _test requis');
const db = createDatabaseClient();
const actor = `test-${randomUUID()}`;
const baseId =
  BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
const restaurantIds: string[] = [];
const osmIds: bigint[] = [];
const options = {
  actor,
  area: actor,
  snapshotAt: '2026-09-07T00:00:00Z',
  bbox: [15.2, -4.4, 15.4, -4.2] as [number, number, number, number],
};
let app: INestApplication;
const service = new OsmImportService(db);
let firstId: string;
let dishId: string;
function fixture(offset: number, overrides: Record<string, unknown> = {}) {
  const id = baseId + BigInt(offset);
  osmIds.push(id);
  return {
    elements: [
      {
        type: 'node',
        id: id.toString(),
        version: 1,
        lat: -4.31,
        lon: 15.3,
        tags: {
          amenity: 'restaurant',
          name: `Fictif ${actor}`,
          'addr:street': 'Rue test',
        },
        ...overrides,
      },
    ],
  };
}
beforeAll(async () => {
  process.env.CATALOG_SOURCE = 'postgres';
  await db.$connect();
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  await app.init();
});
afterAll(async () => {
  await app?.close();
  const records = await db.osmRecord.findMany({
    where: { osmId: { in: osmIds } },
  });
  const ownRestaurantIds = [
    ...restaurantIds,
    ...records.flatMap((r) => (r.restaurantId ? [r.restaurantId] : [])),
  ];
  await db.dish.deleteMany({
    where: { restaurantId: { in: ownRestaurantIds } },
  });
  await db.osmRecord.deleteMany({ where: { osmId: { in: osmIds } } });
  await db.restaurant.deleteMany({ where: { id: { in: ownRestaurantIds } } });
  await db.osmImportRun.deleteMany({ where: { actor } });
  await db.$disconnect();
  delete process.env.CATALOG_SOURCE;
});
it('importe un brouillon et rejoue sans doublon', async () => {
  const payload = fixture(0);
  const first = await service.import(payload, options);
  expect(first.replayed).toBe(false);
  const record = await db.osmRecord.findUniqueOrThrow({
    where: { osmType_osmId: { osmType: 'node', osmId: baseId } },
  });
  firstId = record.restaurantId!;
  expect(firstId).toBeTruthy();
  const restaurant = await db.restaurant.findUniqueOrThrow({
    where: { id: firstId },
  });
  expect(restaurant.contentStatus).toBe('DRAFT');
  expect(restaurant.verified).toBe(false);
  const replay = await service.import(payload, options);
  expect(replay.replayed).toBe(true);
  expect(replay.result).toEqual(first.result);
  await request(app.getHttpServer())
    .get(`/api/v1/restaurants/${firstId}`)
    .expect(404);
});
it('rend la DB explicite dans health et ne fournit pas les fixtures', async () => {
  const health = await request(app.getHttpServer()).get('/health').expect(200);
  expect(health.body.data.catalogSource).toBe('postgres');
  const list = await request(app.getHttpServer())
    .get('/api/v1/dishes')
    .expect(200);
  expect(list.body.meta.source).toBe('postgres');
  expect(list.body.data).toEqual([]);
});
it('bloque le doublon proche et préserve le grand ID', async () => {
  const result = await service.import(fixture(1, { lat: -4.3105 }), options);
  expect(result.result).toMatchObject({
    created: 0,
    items: [{ outcome: 'NEEDS_REVIEW', possibleRestaurantIds: [firstId] }],
  });
  const record = await db.osmRecord.findUniqueOrThrow({
    where: { osmType_osmId: { osmType: 'node', osmId: baseId + 1n } },
  });
  expect(record.osmId.toString()).toBe((baseId + 1n).toString());
});
it('ne crée ni nom ni coordonnées fictifs et refuse une réponse partielle', async () => {
  const incomplete = fixture(2, { tags: { amenity: 'cafe' } });
  expect((await service.import(incomplete, options)).result).toMatchObject({
    created: 0,
    items: [{ outcome: 'NEEDS_DATA' }],
  });
  expect(() =>
    prepareImport({ elements: [], remark: 'timeout' }, options),
  ).toThrow('INCOMPLETE_RESPONSE');
});
it('conserve un point hors zone hors de la DB et les centres en revue', async () => {
  expect(
    (await service.import(fixture(3, { lon: 16 }), options)).result,
  ).toMatchObject({ items: [{ outcome: 'OUTSIDE_ZONE' }] });
  expect(await db.osmRecord.count({ where: { osmId: baseId + 3n } })).toBe(0);
  expect(
    (
      await service.import(
        fixture(4, { type: 'way', center: { lat: -4.31, lon: 15.3 } }),
        options,
      )
    ).result,
  ).toMatchObject({ items: [{ outcome: 'NEEDS_REVIEW' }] });
});
it('sérialise les imports concurrents et garde les résultats idempotents', async () => {
  const payload = fixture(5, {
    lat: -4.39,
    lon: 15.39,
    tags: {
      amenity: 'restaurant',
      name: `Autre ${randomUUID()}`,
      'addr:street': 'Rue indépendante',
    },
  });
  const results = await Promise.all([
    service.import(payload, options),
    service.import(payload, options),
  ]);
  expect(results.filter((r) => r.replayed)).toHaveLength(1);
  expect(await db.osmRecord.count({ where: { osmId: baseId + 5n } })).toBe(1);
});
it('ne remplace pas le nom manuel lors de la mise à jour source, ni avec version ancienne', async () => {
  await db.restaurant.update({
    where: { id: firstId },
    data: { name: `Nom manuel ${actor}` },
  });
  const payload = fixture(0, {
    version: 2,
    tags: {
      amenity: 'restaurant',
      name: 'Nouvelle source',
      'addr:street': 'Rue test',
    },
  });
  expect((await service.import(payload, options)).result).toMatchObject({
    items: [{ outcome: 'EXACT_MATCH' }],
  });
  expect(
    (await db.restaurant.findUniqueOrThrow({ where: { id: firstId } })).name,
  ).toBe(`Nom manuel ${actor}`);
  expect(
    (await service.import(fixture(0), { ...options, area: 'autre' })).result,
  ).toMatchObject({ items: [{ outcome: 'STALE_SOURCE' }] });
});
it('filtre publication/vérification et calcule une vraie distance PostGIS', async () => {
  await db.restaurant.update({
    where: { id: firstId },
    data: { contentStatus: 'PUBLISHED' },
  });
  await request(app.getHttpServer())
    .get(`/api/v1/restaurants/${firstId}`)
    .expect(404);
  await db.restaurant.update({
    where: { id: firstId },
    data: { verified: true, open: true },
  });
  const result = await request(app.getHttpServer())
    .get('/api/v1/restaurants/nearby?lat=-4.31&lon=15.3&radiusMeters=2000')
    .expect(200);
  expect(result.body.data.map((r: { id: string }) => r.id)).toContain(firstId);
  expect(
    result.body.data.find((r: { id: string }) => r.id === firstId)
      .distanceMeters,
  ).toBeLessThan(0.01);
  expect(result.body.meta.attributions[0].license).toBe('ODbL-1.0');
  await request(app.getHttpServer())
    .get('/api/v1/restaurants/nearby?lat=91&lon=15.3')
    .expect(400);
});
it('le trigger répare location et le rayon exclut le lieu éloigné', async () => {
  const r = await db.restaurant.create({
    data: {
      name: actor,
      area: actor,
      address: 'Test',
      latitude: -4.35,
      longitude: 15.3,
      fieldProvenance: { source: 'TEST' },
      contentStatus: 'PUBLISHED',
      verified: true,
    },
  });
  restaurantIds.push(r.id);
  const result = await request(app.getHttpServer())
    .get('/api/v1/restaurants/nearby?lat=-4.31&lon=15.3&radiusMeters=2000')
    .expect(200);
  expect(result.body.data.map((v: { id: string }) => v.id)).not.toContain(r.id);
  await db.restaurant.update({
    where: { id: r.id },
    data: { latitude: -4.31001 },
  });
  const next = await request(app.getHttpServer())
    .get('/api/v1/restaurants/nearby?lat=-4.31&lon=15.3&radiusMeters=2000')
    .expect(200);
  expect(next.body.data.map((v: { id: string }) => v.id)).toContain(r.id);
});
it('sert les plats et budgets exacts et masque ceux des restaurants cachés', async () => {
  const dish = await db.dish.create({
    data: {
      restaurantId: firstId,
      name: 'Plat test',
      category: 'Plats',
      price: 5000,
      image: 'https://example.invalid/test.jpg',
      description: 'Fixture',
      servings: 1,
      available: true,
      contentStatus: 'PUBLISHED',
    },
  });
  dishId = dish.id;
  const result = await request(app.getHttpServer())
    .get(`/api/v1/dishes/${dishId}`)
    .expect(200);
  expect(result.body.data).toMatchObject({
    price: 5000,
    priceCdf: '5000.00',
    currency: 'CDF',
    restaurantId: firstId,
  });
  const budget = await request(app.getHttpServer())
    .post('/api/v1/budget/search')
    .send({ budget: 12000, people: 2 })
    .expect(200);
  expect(budget.body.data[0]).toMatchObject({
    total: '10000.00',
    remainingBudget: '2000.00',
  });
  await db.restaurant.update({
    where: { id: firstId },
    data: { contentStatus: 'HIDDEN' },
  });
  await request(app.getHttpServer())
    .get(`/api/v1/dishes/${dishId}`)
    .expect(404);
  expect(
    (
      await request(app.getHttpServer())
        .post('/api/v1/budget/search')
        .send({ budget: 12000, people: 2 })
        .expect(200)
    ).body.data,
  ).toEqual([]);
});
it('contraint prix et coordonnées au niveau base', async () => {
  await expect(
    db.dish.update({ where: { id: dishId }, data: { price: -1 } }),
  ).rejects.toThrow();
  await expect(
    db.restaurant.update({ where: { id: firstId }, data: { latitude: 100 } }),
  ).rejects.toThrow();
});
