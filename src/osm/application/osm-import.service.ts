import { createHash } from 'node:crypto';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { parseOverpassResponse } from '../domain/osm-candidate';
import type { OsmCandidate } from '../domain/osm-candidate';
import {
  DiscoveryCandidate,
  duplicates,
  jsonValue,
  phone,
  quality,
  safeUrl,
} from '../../ingestion/domain/discovery';
export interface ImportOptions {
  actor: string;
  area: string;
  snapshotAt: string;
  bbox: [number, number, number, number];
}
export interface ImportItem {
  source: string;
  outcome:
    | 'DRAFT_CREATED'
    | 'EXACT_MATCH'
    | 'NEEDS_DATA'
    | 'NEEDS_REVIEW'
    | 'OUTSIDE_ZONE'
    | 'STALE_SOURCE';
  restaurantId?: string;
  possibleRestaurantIds?: string[];
  quality?: ReturnType<typeof quality>;
}
export function prepareImport(
  payload: unknown,
  options: ImportOptions,
): OsmCandidate[] {
  if (
    !options.actor?.trim() ||
    options.actor.length > 100 ||
    !options.area?.trim() ||
    options.area.length > 100
  )
    throw new Error('INVALID_IMPORT_OPTIONS');
  if (
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(options.snapshotAt) ||
    !Number.isFinite(Date.parse(options.snapshotAt)) ||
    Date.parse(options.snapshotAt) > Date.now()
  )
    throw new Error('INVALID_SNAPSHOT');
  const [w, s, e, n] = options.bbox;
  if (
    options.bbox.length !== 4 ||
    !options.bbox.every(Number.isFinite) ||
    w < -180 ||
    e > 180 ||
    s < -90 ||
    n > 90 ||
    w >= e ||
    s >= n ||
    e - w > 3 ||
    n - s > 3
  )
    throw new Error('INVALID_BBOX');
  const candidates = parseOverpassResponse(payload);
  if (candidates.length > 1000) throw new Error('IMPORT_LIMIT_1000');
  return candidates;
}
function discovery(c: OsmCandidate): DiscoveryCandidate {
  const address = c.address.street
    ? [c.address.housenumber, c.address.street, c.address.city]
        .filter(Boolean)
        .join(', ')
    : null;
  return {
    externalId: `${c.osmType}/${c.osmId}`,
    name: c.name ?? null,
    address: address && address.length <= 500 ? address : null,
    latitude: c.point?.latitude ?? null,
    longitude: c.point?.longitude ?? null,
    phone: phone(c.phoneRaw),
    website: c.website && c.website.length <= 500 ? safeUrl(c.website) : null,
    openingHours:
      c.openingHoursRaw && c.openingHoursRaw.length <= 1000
        ? c.openingHoursRaw
        : null,
    cuisine: c.cuisine.slice(0, 20),
    warnings: c.warnings,
  };
}
async function plannedDuplicate(
  tx: Prisma.TransactionClient,
  c: DiscoveryCandidate,
  planned: DiscoveryCandidate[],
) {
  if (!planned.length) return false;
  const result = await tx.$queryRaw<{ matched: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(planned)}::jsonb)
      AS p(name text,latitude float8,longitude float8,phone text,website text)
      WHERE trim(regexp_replace(unaccent(lower(p.name)), '[^[:alnum:]]+', ' ', 'g'))=trim(regexp_replace(unaccent(lower(${c.name})), '[^[:alnum:]]+', ' ', 'g'))
        OR (${c.phone}::text IS NOT NULL AND p.phone=${c.phone})
        OR (${c.website}::text IS NOT NULL AND p.website=${c.website})
        OR (ST_DWithin(ST_SetSRID(ST_MakePoint(p.longitude,p.latitude),4326)::geography,ST_SetSRID(ST_MakePoint(${c.longitude}::float8,${c.latitude}::float8),4326)::geography,250)
          AND similarity(trim(regexp_replace(unaccent(lower(p.name)), '[^[:alnum:]]+', ' ', 'g')),unaccent(lower(${c.name})))>=0.45)) AS matched`;
  return result[0]?.matched ?? false;
}
export class OsmImportService {
  constructor(private readonly db: PrismaClient) {}
  async import(payload: unknown, options: ImportOptions, dryRun = false) {
    const candidates = prepareImport(payload, options);
    const commandHash = createHash('sha256')
      .update(JSON.stringify({ version: 2, candidates, options }))
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        if (dryRun) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        else {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(72421601)`;
          const previous = await tx.osmImportRun.findUnique({
            where: { commandHash },
          });
          if (previous)
            return { replayed: true, dryRun: false, result: previous.result };
        }
        const items: ImportItem[] = [];
        const planned: DiscoveryCandidate[] = [];
        for (const candidate of candidates) {
          const c = discovery(candidate),
            source = c.externalId,
            score = quality(c);
          const [w, s, e, n] = options.bbox;
          if (
            c.latitude !== null &&
            c.longitude !== null &&
            (c.longitude < w ||
              c.longitude > e ||
              c.latitude < s ||
              c.latitude > n)
          ) {
            items.push({ source, outcome: 'OUTSIDE_ZONE', quality: score });
            continue;
          }
          const where = {
            osmType_osmId: {
              osmType: candidate.osmType,
              osmId: BigInt(candidate.osmId),
            },
          };
          const existing = await tx.osmRecord.findUnique({ where });
          if (
            existing &&
            (existing.snapshotAt > new Date(options.snapshotAt) ||
              (existing.osmVersion !== null &&
                (candidate.osmVersion === undefined ||
                  existing.osmVersion > candidate.osmVersion)))
          ) {
            items.push({ source, outcome: 'STALE_SOURCE' });
            continue;
          }
          const values = {
            osmVersion: candidate.osmVersion,
            snapshotAt: new Date(options.snapshotAt),
            candidate: jsonValue({ ...candidate, quality: score }),
          };
          const record = dryRun
            ? existing
            : await tx.osmRecord.upsert({
                where,
                create: {
                  osmType: candidate.osmType,
                  osmId: BigInt(candidate.osmId),
                  ...values,
                },
                update: values,
              });
          if (record?.restaurantId) {
            items.push({
              source,
              outcome: 'EXACT_MATCH',
              restaurantId: record.restaurantId,
              quality: score,
            });
            continue;
          }
          if (!c.name || c.latitude === null || c.longitude === null) {
            items.push({ source, outcome: 'NEEDS_DATA', quality: score });
            continue;
          }
          if (c.name.length > 200 || c.warnings.includes('LIFECYCLE_REVIEW')) {
            items.push({ source, outcome: 'NEEDS_REVIEW', quality: score });
            continue;
          }
          const matches = await duplicates(tx, c);
          if (
            matches.length ||
            (dryRun && (await plannedDuplicate(tx, c, planned)))
          ) {
            items.push({
              source,
              outcome: 'NEEDS_REVIEW',
              possibleRestaurantIds: matches.map((m) => m.id),
              quality: score,
            });
            continue;
          }
          let restaurantId: string | undefined;
          if (!dryRun) {
            const evidence = {
              source: 'OSM',
              sourceRecordId: record!.id,
              osmVersion: candidate.osmVersion,
              snapshotAt: options.snapshotAt,
              importedBy: options.actor,
              license: 'ODbL-1.0',
              geometryMethod: candidate.point?.method,
            };
            const restaurant = await tx.restaurant.create({
              data: {
                name: c.name,
                area: options.area,
                address: c.address,
                phone: c.phone,
                website: c.website,
                openingHours: c.openingHours,
                cuisine: c.cuisine,
                latitude: c.latitude,
                longitude: c.longitude,
                fieldProvenance: jsonValue({
                  name: evidence,
                  address: evidence,
                  geo: evidence,
                  phone: evidence,
                  website: evidence,
                  cuisine: evidence,
                  openingHours: evidence,
                  area: { source: 'EDITORIAL_ZONE', actor: options.actor },
                }),
              },
            });
            restaurantId = restaurant.id;
            await tx.osmRecord.update({
              where: { id: record!.id },
              data: { restaurantId },
            });
          } else planned.push(c);
          items.push({
            source,
            outcome: 'DRAFT_CREATED',
            ...(restaurantId ? { restaurantId } : {}),
            quality: score,
          });
        }
        const result = jsonValue({
          items,
          total: items.length,
          found: items.length,
          created: items.filter((i) => i.outcome === 'DRAFT_CREATED').length,
          duplicates: items.filter(
            (i) =>
              i.outcome === 'EXACT_MATCH' ||
              (i.outcome === 'NEEDS_REVIEW' &&
                i.possibleRestaurantIds !== undefined),
          ).length,
          needsData: items.filter((i) => i.outcome === 'NEEDS_DATA').length,
          needsReview: items.filter((i) => i.outcome === 'NEEDS_REVIEW').length,
          outside: items.filter((i) => i.outcome === 'OUTSIDE_ZONE').length,
          stale: items.filter((i) => i.outcome === 'STALE_SOURCE').length,
        });
        if (!dryRun)
          await tx.osmImportRun.create({
            data: {
              commandHash,
              actor: options.actor,
              snapshotAt: new Date(options.snapshotAt),
              result,
            },
          });
        return { replayed: false, dryRun, result };
      },
      {
        timeout: 60000,
        maxWait: 10000,
        isolationLevel: dryRun ? 'RepeatableRead' : 'ReadCommitted',
      },
    );
  }
}
