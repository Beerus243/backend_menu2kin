import {
  classifyDuplicate,
  normalizeName,
  normalizeOsmElement,
  osmIdentity,
  parseOverpassResponse,
  proposeRefresh,
} from './osm-candidate';
const node = {
  type: 'node',
  id: 42,
  version: 1,
  lat: -4.31,
  lon: 15.3,
  tags: {
    amenity: 'restaurant',
    name: ' Chez Mámá ',
    cuisine: 'pizza; african;pizza',
  },
};
describe('OSM adaptation hors ligne', () => {
  it('normalise sans inventer menu, prix ou vérification', () => {
    const result = normalizeOsmElement(node)!;
    expect(result.name).toBe('Chez Mámá');
    expect(result.cuisine).toEqual(['pizza', 'african']);
    expect(result.osmId).toBe('42');
    expect(result.license).toBe('ODbL-1.0');
    expect(result).not.toHaveProperty('price');
    expect(result).not.toHaveProperty('status');
    expect(normalizeName(result.name!)).toBe('chez mama');
  });
  it('distingue node/way et préserve les grands identifiants', () => {
    expect(osmIdentity('relation', '9007199254740993').osmId).toBe(
      '9007199254740993',
    );
    expect(osmIdentity('way', 42)).not.toEqual(osmIdentity('node', 42));
    expect(() => osmIdentity('node', Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'INVALID_OSM',
    );
  });
  it.each(['-1', '0', '1e4', '9223372036854775808'])(
    'rejette un ID incorrect %s',
    (id) => {
      expect(() => osmIdentity('node', id)).toThrow('INVALID_OSM');
    },
  );
  it('ne transforme pas un centre de bounding box en entrée vérifiée', () => {
    const result = normalizeOsmElement({
      ...node,
      type: 'way',
      center: { lat: -4.3, lon: 15.3 },
    })!;
    expect(result.point?.method).toBe('OVERPASS_BBOX_CENTER');
    expect(result.warnings).toContain('APPROXIMATE_POINT');
  });
  it('conserve les manques sans faux nom ni 0,0', () => {
    const result = normalizeOsmElement({
      type: 'node',
      id: 1,
      tags: { amenity: 'cafe' },
    })!;
    expect(result.point).toBeUndefined();
    expect(result.name).toBeUndefined();
    expect(result.warnings).toEqual(
      expect.arrayContaining(['MISSING_POINT', 'MISSING_NAME']),
    );
  });
  it('écarte les catégories hors périmètre', () => {
    expect(
      normalizeOsmElement({ ...node, tags: { amenity: 'bank' } }),
    ).toBeNull();
  });
  it('préserve contact/horaires comme texte non interprété et rejette URL active', () => {
    const result = normalizeOsmElement({
      ...node,
      tags: {
        ...node.tags,
        'contact:phone': '081 ?',
        opening_hours: 'unknown',
        website: 'javascript:alert(1)',
      },
    })!;
    expect(result.phoneRaw).toBe('081 ?');
    expect(result.openingHoursRaw).toBe('unknown');
    expect(result.website).toBeUndefined();
    expect(result.warnings).toContain('INVALID_WEBSITE');
  });
  it.each([{ lat: 91 }, { lon: NaN }, { tags: { amenity: 12 } }])(
    'rejette des données invalides %j',
    (patch) => {
      expect(() => normalizeOsmElement({ ...node, ...patch })).toThrow(
        'INVALID_OSM',
      );
    },
  );
  it('refuse résultat partiel, doublon interne et enveloppe incorrecte', () => {
    expect(() =>
      parseOverpassResponse({ elements: [node], remark: 'timeout' }),
    ).toThrow('INCOMPLETE_RESPONSE');
    expect(() => parseOverpassResponse({ elements: [node, node] })).toThrow(
      'INVALID_OSM',
    );
    expect(() => parseOverpassResponse({})).toThrow('INVALID_OSM');
    expect(parseOverpassResponse({ elements: [] })).toEqual([]);
  });
  it('signale les indices de fermeture sans publier ni supprimer', () => {
    expect(
      normalizeOsmElement({ ...node, tags: { ...node.tags, disused: 'yes' } })
        ?.warnings,
    ).toContain('LIFECYCLE_REVIEW');
  });
  it('distingue exact, probable à 80m, et aucun résultat', () => {
    const match = {
      sameSourceReference: false,
      nameSimilarity: 0.8,
      distanceMeters: 80,
      samePhone: false,
      sameWebsite: false,
    };
    expect(classifyDuplicate(match)).toBe('POSSIBLE_MATCH');
    expect(classifyDuplicate({ ...match, sameSourceReference: true })).toBe(
      'EXACT_MATCH',
    );
    expect(classifyDuplicate({ ...match, distanceMeters: 2000 })).toBe(
      'NO_MATCH',
    );
    expect(
      classifyDuplicate({ ...match, distanceMeters: 2000, samePhone: true }),
    ).toBe('POSSIBLE_MATCH');
  });
  it('protège la valeur manuelle et ne synchronise jamais automatiquement', () => {
    expect(proposeRefresh('A', 'B', 'TEAM', false)).toMatchObject({
      changed: true,
      canAcceptOsm: false,
      automaticallyApply: false,
    });
    expect(proposeRefresh('A', 'B', 'OSM', true).canAcceptOsm).toBe(false);
    expect(proposeRefresh('A', 'B', 'OSM', false).canAcceptOsm).toBe(true);
    expect(proposeRefresh('A', undefined, 'OSM', false).changed).toBe(false);
  });
});
