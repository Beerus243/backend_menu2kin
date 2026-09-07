import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Contrat API consommé par Flutter', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('expose la santé et le mode démo', async () => {
    const result = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(result.body.data).toEqual({ status: 'ok', catalogSource: 'demo' });
  });
  it('sert toutes les pages avec le JSON Flutter et des prix exacts', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/dishes?limit=2')
      .expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta).toMatchObject({
      source: 'demo',
      nextOffset: 2,
      hasNextPage: true,
    });
    expect(first.body.data[1]).toMatchObject({
      id: 'poulet-braise',
      price: 12000,
      priceCdf: '12000.00',
      currency: 'CDF',
      servings: 1,
    });
    const second = await request(app.getHttpServer())
      .get('/api/v1/dishes?limit=2&offset=2')
      .expect(200);
    expect(second.body.data[0].id).not.toEqual(first.body.data[0].id);
    const empty = await request(app.getHttpServer())
      .get('/api/v1/dishes?offset=8')
      .expect(200);
    expect(empty.body.data).toEqual([]);
    expect(empty.body.meta.nextOffset).toBeNull();
  });
  it('recherche accents, synonymes et quartier, et filtre false correctement', async () => {
    const pizza = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'pitsa gombe' })
      .expect(200);
    expect(pizza.body.data.map((dish: { id: string }) => dish.id)).toEqual([
      'pizza-familiale',
    ]);
    const chicken = await request(app.getHttpServer())
      .get('/api/v1/search')
      .query({ q: 'poulet braise' })
      .expect(200);
    expect(chicken.body.data).toHaveLength(1);
    const unavailable = await request(app.getHttpServer())
      .get('/api/v1/dishes?available=false')
      .expect(200);
    expect(
      unavailable.body.data.map((dish: { id: string }) => dish.id),
    ).toEqual(['poulet-signature']);
  });
  it('retourne 404 structurée pour plat/restaurant manquant', async () => {
    for (const path of [
      'dishes/missing',
      'restaurants/missing',
      'restaurants/missing/dishes',
    ]) {
      const result = await request(app.getHttpServer())
        .get(`/api/v1/${path}`)
        .expect(404);
      expect(result.body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(result.body.error.requestId).toBeTruthy();
    }
  });
  it.each([
    'limit=0',
    'limit=51',
    'offset=-1',
    'maxPrice=1.5',
    'available=garbage',
    'unknown=true',
    'limit=2&limit=3',
  ])('rejette query invalide %s', async (query) => {
    const result = await request(app.getHttpServer())
      .get(`/api/v1/dishes?${query}`)
      .expect(400);
    expect(result.body.error.code).toBe('VALIDATION_ERROR');
  });
  it('liste restaurants, plats associés et taxonomies', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/v1/restaurants')
      .expect(200);
    expect(result.body.data).toHaveLength(4);
    const dishes = await request(app.getHttpServer())
      .get('/api/v1/restaurants/maison-boma/dishes')
      .expect(200);
    expect(
      dishes.body.data.every(
        (dish: { restaurantId: string }) => dish.restaurantId === 'maison-boma',
      ),
    ).toBe(true);
    expect(
      (await request(app.getHttpServer()).get('/api/v1/categories').expect(200))
        .body.data,
    ).toContain('Poulet');
    expect(
      (await request(app.getHttpServer()).get('/api/v1/areas').expect(200)).body
        .data,
    ).toContain('Gombe');
  });
  it('calcule le budget avec portions et exclut indisponibilité, fermeture et desserts', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .send({ budget: 30000, people: 2 })
      .expect(200);
    const chicken = result.body.data.find(
      (proposal: { items: { dish: { id: string } }[] }) =>
        proposal.items[0].dish.id === 'poulet-braise',
    );
    expect(chicken).toMatchObject({
      total: '24000.00',
      remainingBudget: '6000.00',
      pricePerPerson: '12000.00',
    });
    expect(chicken.items[0].quantity).toBe(2);
    for (const proposal of result.body.data) {
      expect(Number(proposal.total)).toBeLessThanOrEqual(30000);
      expect(proposal.items[0].dish.available).toBe(true);
      expect(proposal.items[0].dish.open).toBe(true);
      expect(proposal.items[0].dish.category).not.toBe('Desserts');
    }
    const exact = await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .send({ budget: 24000, people: 2, area: 'Bandalungwa' })
      .expect(200);
    expect(exact.body.data[0].remainingBudget).toBe('0.00');
    const below = await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .send({ budget: 23999, people: 2, area: 'Bandalungwa' })
      .expect(200);
    expect(below.body.data).toEqual([]);
  });
  it.each([
    { budget: 0, people: 2 },
    { budget: 30000, people: 0 },
    { budget: 30000.01, people: 2 },
    { budget: 30000, people: 2, admin: true },
    { budget: 30000, people: 2, area: null },
  ])('rejette un budget invalide %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .send(body)
      .expect(400);
  });
  it('rejette JSON malformé et corps trop volumineux avec une erreur structurée', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .set('Content-Type', 'application/json')
      .send('{')
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    const large = await request(app.getHttpServer())
      .post('/api/v1/budget/search')
      .send({ budget: 30000, people: 2, area: 'x'.repeat(70000) })
      .expect(413);
    expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
  it('documente les routes effectivement implémentées', async () => {
    const result = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);
    expect(result.body.paths['/api/v1/dishes']).toBeDefined();
    expect(result.body.paths['/api/v1/budget/search']).toBeDefined();
  });
});
