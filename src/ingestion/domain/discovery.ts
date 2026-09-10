import type { Prisma } from '../../generated/prisma/client';
export interface DiscoveryCandidate {
  externalId: string;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  openingHours: string | null;
  cuisine: string[];
  warnings: string[];
  externalLinks?: string[];
}
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function phone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}
export function quality(
  candidate: Pick<
    DiscoveryCandidate,
    | 'name'
    | 'address'
    | 'latitude'
    | 'longitude'
    | 'phone'
    | 'website'
    | 'openingHours'
    | 'cuisine'
    | 'warnings'
  >,
) {
  const present = {
    name: !!candidate.name,
    address: !!candidate.address,
    geo: candidate.latitude !== null && candidate.longitude !== null,
    phone: !!candidate.phone,
    website: !!candidate.website,
    openingHours: !!candidate.openingHours,
    cuisine: candidate.cuisine.length > 0,
  };
  return {
    score:
      (present.name ? 20 : 0) +
      (present.address ? 15 : 0) +
      (present.geo
        ? candidate.warnings.includes('APPROXIMATE_POINT')
          ? 20
          : 35
        : 0) +
      (present.phone ? 10 : 0) +
      (present.website ? 5 : 0) +
      (present.openingHours ? 10 : 0) +
      (present.cuisine ? 5 : 0),
    missingFields: Object.entries(present)
      .filter(([, v]) => !v)
      .map(([k]) => k),
  };
}
export async function duplicates(
  tx: Prisma.TransactionClient,
  c: Pick<
    DiscoveryCandidate,
    'name' | 'latitude' | 'longitude' | 'phone' | 'website'
  >,
) {
  if (!c.name) return [];
  return tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Restaurant" WHERE
      "normalizedName" = trim(regexp_replace(unaccent(lower(${c.name})), '[^[:alnum:]]+', ' ', 'g'))
      OR (${c.phone}::text IS NOT NULL AND phone=${c.phone})
      OR (${c.website}::text IS NOT NULL AND website=${c.website})
      OR (ST_DWithin(location,ST_SetSRID(ST_MakePoint(${c.longitude}::float8,${c.latitude}::float8),4326)::geography,250)
        AND "normalizedName" % unaccent(lower(${c.name})) AND similarity("normalizedName",unaccent(lower(${c.name}))) >= 0.45)
    ORDER BY id LIMIT 21`;
}
export const jsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export const publicJson = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ) as T;
