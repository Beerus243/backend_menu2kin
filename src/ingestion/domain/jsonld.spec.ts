import { readFileSync } from 'node:fs';
import { parseRestaurantJsonLd } from './jsonld';
import { phone, quality, safeUrl } from './discovery';
const fixture = (name: string) =>
  readFileSync(`src/ingestion/fixtures/restaurant-${name}.html`, 'utf8');
it('résout @graph et références sans importer images, prix ni notes', () => {
  const { candidates, invalidScripts } = parseRestaurantJsonLd(
    fixture('a'),
    'https://restaurant.example/',
  );
  expect(invalidScripts).toBe(0);
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({
    name: 'Table Test Kinshasa',
    latitude: -4.31,
    longitude: 15.3,
    address: 'Rue fictive 1, Gombe',
    phone: '+243800000000',
    cuisine: ['congolaise', 'grill'],
  });
  expect(candidates[0]).not.toHaveProperty('image');
  expect(candidates[0]).not.toHaveProperty('price');
  expect(candidates[0]).not.toHaveProperty('rating');
});
it('laisse les données manquantes nulles, ne devine pas un indicatif', () => {
  const c = parseRestaurantJsonLd(fixture('b'), 'https://restaurant.example/')
    .candidates[0];
  expect(c).toMatchObject({
    latitude: null,
    longitude: null,
    address: null,
    phone: null,
    website: null,
  });
  expect(quality(c).missingFields).toContain('geo');
});
it('conserve zéro valide, signale le JSON cassé et borne les entrées', () => {
  const result = parseRestaurantJsonLd(
    '<script type="application/ld+json">{</script><script type="application/ld+json">{"@type":"Restaurant","geo":{"latitude":0,"longitude":0}}</script>',
    'https://restaurant.example/',
  );
  expect(result.invalidScripts).toBe(1);
  expect(result.candidates[0].latitude).toBe(0);
  expect(() =>
    parseRestaurantJsonLd(
      'x'.repeat(2 * 1024 * 1024 + 1),
      'https://restaurant.example/',
    ),
  ).toThrow();
});
it('normalise seulement des téléphones et URLs sûrs', () => {
  expect(phone('+243 (800)-000.000')).toBe('+243800000000');
  expect(phone('800000000')).toBeNull();
  expect(safeUrl('https://user:secret@example.com')).toBeNull();
});
