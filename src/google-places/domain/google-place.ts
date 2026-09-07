/** Données externes transitoires : jamais une entrée Prisma Restaurant. */
export interface GooglePlacePreview {
  googlePlaceId: string;
  source: 'GOOGLE';
  retention: 'TRANSIENT_NO_STORE';
  displayName?: string;
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  types?: string[];
  internationalPhoneNumber?: string;
  regularOpeningHours?: Record<string, unknown>;
  attributions: { provider: string; providerUri: string }[];
}
export interface GooglePlacePage {
  data: GooglePlacePreview[];
  nextPageToken?: string;
}
export type PlacesErrorCode =
  | 'GOOGLE_DISABLED'
  | 'GOOGLE_INVALID_INPUT'
  | 'GOOGLE_ACCESS_DENIED'
  | 'GOOGLE_QUOTA_EXCEEDED'
  | 'GOOGLE_NOT_FOUND'
  | 'GOOGLE_UNAVAILABLE'
  | 'GOOGLE_TIMEOUT'
  | 'GOOGLE_INVALID_RESPONSE';

export class GooglePlacesError extends Error {
  constructor(public readonly code: PlacesErrorCode) {
    super(code); // jamais de réponse Google brute, clé ou URL dans le message
    this.name = 'GooglePlacesError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  }
  return value as Record<string, unknown>;
}
function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string')
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  return value;
}
export function validatePlaceId(value: unknown): asserts value is string {
  // Plafond défensif applicatif, pas une longueur maximale Google supposée.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(value)) {
    throw new GooglePlacesError('GOOGLE_INVALID_INPUT');
  }
}
export function mapGooglePlace(value: unknown): GooglePlacePreview {
  const input = record(value);
  try {
    validatePlaceId(input.id);
  } catch {
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  }
  let location: GooglePlacePreview['location'];
  if (input.location !== undefined) {
    const point = record(input.location);
    if (
      typeof point.latitude !== 'number' ||
      !Number.isFinite(point.latitude) ||
      Math.abs(point.latitude) > 90 ||
      typeof point.longitude !== 'number' ||
      !Number.isFinite(point.longitude) ||
      Math.abs(point.longitude) > 180
    ) {
      throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
    }
    location = { latitude: point.latitude, longitude: point.longitude };
  }
  if (
    input.types !== undefined &&
    (!Array.isArray(input.types) ||
      !input.types.every((item) => typeof item === 'string'))
  ) {
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  }
  if (input.attributions !== undefined && !Array.isArray(input.attributions)) {
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  }
  const attributions = ((input.attributions ?? []) as unknown[]).map((item) => {
    const entry = record(item);
    if (
      typeof entry.provider !== 'string' ||
      typeof entry.providerUri !== 'string'
    ) {
      throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
    }
    // Valeurs restituées comme données; aucun fetch automatique de ces URLs.
    return { provider: entry.provider, providerUri: entry.providerUri };
  });
  return {
    googlePlaceId: input.id as string,
    source: 'GOOGLE',
    retention: 'TRANSIENT_NO_STORE',
    displayName:
      input.displayName === undefined
        ? undefined
        : optionalString(record(input.displayName).text),
    formattedAddress: optionalString(input.formattedAddress),
    location,
    types: input.types as string[] | undefined,
    internationalPhoneNumber: optionalString(input.internationalPhoneNumber),
    regularOpeningHours:
      input.regularOpeningHours === undefined
        ? undefined
        : record(input.regularOpeningHours),
    attributions,
  };
}
export function mapGooglePage(value: unknown): GooglePlacePage {
  const input = record(value);
  if (input.places !== undefined && !Array.isArray(input.places)) {
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  }
  const places = (input.places ?? []) as unknown[];
  if (places.length > 20)
    throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
  return {
    data: places.map(mapGooglePlace),
    nextPageToken: optionalString(input.nextPageToken),
  };
}
/** Whitelist de persistance. Les autres données ne deviennent pas des données propriétaires. */
export function createReferenceSeed(preview: GooglePlacePreview) {
  validatePlaceId(preview.googlePlaceId);
  return {
    googlePlaceId: preview.googlePlaceId,
    discoverySource: 'GOOGLE' as const,
  };
}
