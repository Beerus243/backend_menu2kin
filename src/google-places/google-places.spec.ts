import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GooglePlacesModule } from './google-places.module';
import {
  createReferenceSeed,
  mapGooglePage,
  mapGooglePlace,
} from './domain/google-place';
import {
  CONTACT_FIELDS,
  DETAILS_FIELDS,
  GOOGLE_PLACES_FETCH,
  GooglePlacesClient,
  SEARCH_FIELDS,
} from './infrastructure/google-places.client';
import type { PlacesFetch } from './infrastructure/google-places.client';

const fixture = {
  id: 'test_place_1',
  displayName: { text: 'Restaurant fictif' },
  formattedAddress: 'Adresse fictive',
  location: { latitude: -4.3, longitude: 15.3 },
  attributions: [
    { provider: 'Fournisseur fictif', providerUri: 'https://example.invalid' },
  ],
};
const input = {
  query: 'restaurants Gombe',
  latitude: -4.3,
  longitude: 15.3,
  radiusMeters: 1000,
};
const options = {
  enabled: true,
  apiKey: 'synthetic-test-value',
  timeoutMs: 100,
};

describe('Google Places : adaptateur interne sans stockage de contenu', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mappe un résultat et conserve son attribution, sans rating/photo/review', () => {
    const preview = mapGooglePlace({
      ...fixture,
      rating: 4.9,
      reviews: [{ text: 'Ne pas importer' }],
      photos: ['photo'],
    });
    expect(preview.displayName).toBe('Restaurant fictif');
    expect(preview.attributions).toEqual(fixture.attributions);
    expect(preview).not.toHaveProperty('rating');
    expect(preview).not.toHaveProperty('reviews');
    expect(preview).not.toHaveProperty('photos');
    expect(preview.retention).toBe('TRANSIENT_NO_STORE');
  });
  it('ne conserve que la référence externe dans la proposition de persistance', () => {
    expect(createReferenceSeed(mapGooglePlace(fixture))).toEqual({
      googlePlaceId: 'test_place_1',
      discoverySource: 'GOOGLE',
    });
  });
  it('accepte les champs facultatifs absents et les résultats vides', () => {
    expect(mapGooglePlace({ id: 'test_place_1' }).displayName).toBeUndefined();
    expect(mapGooglePage({}).data).toEqual([]);
  });
  it.each([
    { location: { latitude: 91, longitude: 15 } },
    { displayName: 'string' },
    { attributions: [{}] },
    { types: [1] },
  ])('rejette une structure fournisseur invalide %j', (patch) => {
    expect(() => mapGooglePlace({ ...fixture, ...patch })).toThrow(
      'GOOGLE_INVALID_RESPONSE',
    );
  });
  it('injecte le transport et envoie Text Search New avec masque fixé et sans clé dans URL', async () => {
    const transport = jest
      .fn<PlacesFetch>()
      .mockResolvedValue(
        Response.json({ places: [fixture], nextPageToken: 'next-test' }),
      );
    const module = await Test.createTestingModule({
      imports: [GooglePlacesModule.register(options)],
    })
      .overrideProvider(GOOGLE_PLACES_FETCH)
      .useValue(transport)
      .compile();
    try {
      const result = await module.get(GooglePlacesClient).searchText(input);
      expect(result.nextPageToken).toBe('next-test');
      const [url, init] = transport.mock.calls[0];
      expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
      expect(init.headers).toMatchObject({
        'X-Goog-FieldMask': SEARCH_FIELDS,
        'X-Goog-Api-Key': options.apiKey,
      });
      expect(JSON.parse(init.body as string)).toMatchObject({
        textQuery: input.query,
        pageSize: 10,
        locationBias: { circle: { radius: 1000 } },
      });
    } finally {
      await module.close();
    }
  });
  it('Nearby utilise une restriction circulaire, sans pagination ni fan-out Details', async () => {
    const transport = jest
      .fn<PlacesFetch>()
      .mockResolvedValue(Response.json({ places: [fixture] }));
    await new GooglePlacesClient(options, transport).nearby(input);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(transport.mock.calls[0][1].body as string)).toMatchObject(
      {
        includedTypes: ['restaurant'],
        maxResultCount: 10,
        locationRestriction: { circle: { radius: 1000 } },
      },
    );
    expect(transport.mock.calls[0][1].headers).toMatchObject({
      'X-Goog-FieldMask': expect.not.stringContaining('nextPageToken'),
    });
  });
  it('le profil contact est volontaire et plus large que identity', async () => {
    const transport = jest
      .fn<PlacesFetch>()
      .mockImplementation(async () => Response.json(fixture));
    const client = new GooglePlacesClient(options, transport);
    await client.details(fixture.id);
    await client.details(fixture.id, 'contact');
    expect(transport.mock.calls[0][1].headers).toMatchObject({
      'X-Goog-FieldMask': DETAILS_FIELDS,
    });
    expect(transport.mock.calls[1][1].headers).toMatchObject({
      'X-Goog-FieldMask': CONTACT_FIELDS,
    });
  });
  it.each([
    [400, 'GOOGLE_INVALID_INPUT'],
    [401, 'GOOGLE_ACCESS_DENIED'],
    [403, 'GOOGLE_ACCESS_DENIED'],
    [404, 'GOOGLE_NOT_FOUND'],
    [429, 'GOOGLE_QUOTA_EXCEEDED'],
    [503, 'GOOGLE_UNAVAILABLE'],
  ] as const)(
    'traduit HTTP %s sans fuite fournisseur ni retry',
    async (status, code) => {
      const transport = jest
        .fn<PlacesFetch>()
        .mockResolvedValue(
          Response.json({ message: 'private-upstream-message' }, { status }),
        );
      await expect(
        new GooglePlacesClient(options, transport).details(fixture.id),
      ).rejects.toMatchObject({ code, message: code });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(
        JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls),
      ).not.toContain('private-upstream-message');
      expect(
        JSON.stringify(jest.mocked(Logger.prototype.log).mock.calls),
      ).not.toContain(options.apiKey);
    },
  );
  it('refuse un module désactivé et les IDs transformant le chemin', async () => {
    const transport = jest.fn<PlacesFetch>();
    await expect(
      new GooglePlacesClient({ enabled: false }, transport).details('test'),
    ).rejects.toMatchObject({ code: 'GOOGLE_DISABLED' });
    await expect(
      new GooglePlacesClient(options, transport).details('../other?key=x'),
    ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_INPUT' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejette JSON invalide et payload démesuré', async () => {
    for (const value of ['invalid-json', 'x'.repeat(256 * 1024 + 1)]) {
      const transport: PlacesFetch = async () => new Response(value);
      await expect(
        new GooglePlacesClient(options, transport).details('test'),
      ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
    }
  });
  it('journalise une réponse sémantiquement invalide comme erreur, sans succès', async () => {
    const transport: PlacesFetch = async () =>
      Response.json({ displayName: { text: 'Sans ID' } });
    await expect(
      new GooglePlacesClient(options, transport).details('test'),
    ).rejects.toMatchObject({ code: 'GOOGLE_INVALID_RESPONSE' });
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'google_error',
        code: 'GOOGLE_INVALID_RESPONSE',
      }),
    );
    expect(Logger.prototype.log).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'google_success' }),
    );
  });
  it('annule un appel bloqué à la deadline', async () => {
    const transport: PlacesFetch = (_, init) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener(
          'abort',
          () => reject(new Error('sensitive-network-message')),
          { once: true },
        );
      });
    await expect(
      new GooglePlacesClient({ ...options, timeoutMs: 5 }, transport).details(
        'test',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_TIMEOUT' });
  });
  it('ne transforme pas une panne réseau en liste vide', async () => {
    const transport: PlacesFetch = async () => {
      throw new Error('sensitive-network-message');
    };
    await expect(
      new GooglePlacesClient(options, transport).searchText(input),
    ).rejects.toMatchObject({ code: 'GOOGLE_UNAVAILABLE' });
  });
});
