/** Noyau d'adaptation hors ligne ; pas de transport, DB ou route HTTP active. */
export type OsmType = 'node' | 'way' | 'relation';
export interface OsmCandidate {
  source: 'OSM';
  license: 'ODbL-1.0';
  sourceUrl: string;
  osmType: OsmType;
  osmId: string;
  osmVersion?: number;
  name?: string;
  amenity: string;
  cuisine: string[];
  phoneRaw?: string;
  website?: string;
  openingHoursRaw?: string;
  address: Partial<
    Record<'street' | 'housenumber' | 'postcode' | 'city' | 'district', string>
  >;
  point?: {
    latitude: number;
    longitude: number;
    method: 'OSM_NODE' | 'OVERPASS_BBOX_CENTER';
  };
  warnings: string[];
}
export class OsmInputError extends Error {
  constructor(public readonly code: 'INVALID_OSM' | 'INCOMPLETE_RESPONSE') {
    super(code);
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new OsmInputError('INVALID_OSM');
  return value as Record<string, unknown>;
}
export function osmIdentity(
  type: unknown,
  id: unknown,
): { osmType: OsmType; osmId: string } {
  if (type !== 'node' && type !== 'way' && type !== 'relation')
    throw new OsmInputError('INVALID_OSM');
  // Refuser un number déjà arrondi ; en JSON/DB les identifiants sont des chaînes décimales.
  if (typeof id === 'number' && (!Number.isSafeInteger(id) || id <= 0))
    throw new OsmInputError('INVALID_OSM');
  const value =
    typeof id === 'string' ? id : typeof id === 'number' ? String(id) : '';
  if (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new OsmInputError('INVALID_OSM');
  return { osmType: type, osmId: value };
}
export function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
export function normalizeOsmElement(value: unknown): OsmCandidate | null {
  const element = record(value);
  const identity = osmIdentity(element.type, element.id);
  const tags = record(element.tags ?? {});
  for (const [key, item] of Object.entries(tags)) {
    if (key.length > 255 || typeof item !== 'string' || item.length > 4096)
      throw new OsmInputError('INVALID_OSM');
  }
  const tag = (key: string): string | undefined =>
    (tags[key] as string | undefined)?.trim() || undefined;
  const amenity = tag('amenity');
  if (!amenity || !['restaurant', 'fast_food', 'cafe'].includes(amenity))
    return null;
  const warnings: string[] = [];
  if (
    element.visible === false ||
    ['disused', 'abandoned', 'demolished'].some(
      (key) => tag(key) === 'yes' || tag(`${key}:amenity`) !== undefined,
    )
  ) {
    warnings.push('LIFECYCLE_REVIEW');
  }
  let point: OsmCandidate['point'];
  const coordinates =
    identity.osmType === 'node'
      ? element
      : element.center === undefined
        ? undefined
        : record(element.center);
  if (
    coordinates &&
    (coordinates.lat !== undefined || coordinates.lon !== undefined)
  ) {
    const { lat, lon } = coordinates;
    if (
      typeof lat !== 'number' ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      typeof lon !== 'number' ||
      !Number.isFinite(lon) ||
      Math.abs(lon) > 180
    )
      throw new OsmInputError('INVALID_OSM');
    point = {
      latitude: lat,
      longitude: lon,
      method: identity.osmType === 'node' ? 'OSM_NODE' : 'OVERPASS_BBOX_CENTER',
    };
    if (identity.osmType !== 'node') warnings.push('APPROXIMATE_POINT');
  }
  if (!point) warnings.push('MISSING_POINT');
  const name = tag('name') ?? tag('name:fr');
  if (!name) warnings.push('MISSING_NAME');
  let website: string | undefined;
  const rawWebsite = tag('contact:website') ?? tag('website');
  if (rawWebsite) {
    try {
      const url = new URL(rawWebsite);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
      website = url.toString();
    } catch {
      warnings.push('INVALID_WEBSITE');
    }
  }
  let osmVersion: number | undefined;
  if (element.version !== undefined) {
    if (
      !Number.isSafeInteger(element.version) ||
      (element.version as number) < 1
    )
      throw new OsmInputError('INVALID_OSM');
    osmVersion = element.version as number;
  }
  return {
    ...identity,
    source: 'OSM',
    license: 'ODbL-1.0',
    sourceUrl: `https://www.openstreetmap.org/${identity.osmType}/${identity.osmId}`,
    osmVersion,
    name,
    amenity,
    cuisine: [
      ...new Set(
        (tag('cuisine') ?? '')
          .split(';')
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
    phoneRaw: tag('contact:phone') ?? tag('phone'),
    website,
    openingHoursRaw: tag('opening_hours'),
    address: {
      street: tag('addr:street'),
      housenumber: tag('addr:housenumber'),
      postcode: tag('addr:postcode'),
      city: tag('addr:city'),
      district: tag('addr:district'),
    },
    point,
    warnings,
  };
}
export function parseOverpassResponse(value: unknown): OsmCandidate[] {
  const payload = record(value);
  // Overpass peut signaler une erreur dans un HTTP 200 contenant des résultats partiels.
  if (payload.remark !== undefined)
    throw new OsmInputError('INCOMPLETE_RESPONSE');
  if (!Array.isArray(payload.elements) || payload.elements.length > 5000)
    throw new OsmInputError('INVALID_OSM');
  const candidates = payload.elements
    .map(normalizeOsmElement)
    .filter((item): item is OsmCandidate => item !== null);
  const ids = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.osmType}/${candidate.osmId}`;
    if (ids.has(key)) throw new OsmInputError('INVALID_OSM');
    ids.add(key);
  }
  return candidates;
}
export interface IdentityComparison {
  sameSourceReference: boolean;
  nameSimilarity: number;
  distanceMeters?: number;
  samePhone: boolean;
  sameWebsite: boolean;
}
/** Les candidats et distances sont fournis par la future requête PostGIS bornée. */
export function classifyDuplicate(
  input: IdentityComparison,
): 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH' {
  if (
    !Number.isFinite(input.nameSimilarity) ||
    input.nameSimilarity < 0 ||
    input.nameSimilarity > 1 ||
    (input.distanceMeters !== undefined &&
      (!Number.isFinite(input.distanceMeters) || input.distanceMeters < 0))
  )
    throw new OsmInputError('INVALID_OSM');
  if (input.sameSourceReference) return 'EXACT_MATCH';
  if (
    input.samePhone ||
    (input.sameWebsite && input.nameSimilarity >= 0.6) ||
    (input.nameSimilarity >= 0.65 &&
      input.distanceMeters !== undefined &&
      input.distanceMeters <= 250)
  )
    return 'POSSIBLE_MATCH';
  return 'NO_MATCH';
}
export function proposeRefresh(
  current: string | undefined,
  incoming: string | undefined,
  source: 'OSM' | 'TEAM' | 'RESTAURANT' | 'PARTNER',
  locked: boolean,
) {
  return {
    changed: incoming !== undefined && incoming !== current,
    current,
    incoming,
    canAcceptOsm: source === 'OSM' && !locked && incoming !== undefined,
    automaticallyApply: false as const,
  };
}
