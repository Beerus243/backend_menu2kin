import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '../../generated/prisma/client';
import { normalizeName, parseOverpassResponse } from '../domain/osm-candidate';
import type { OsmCandidate } from '../domain/osm-candidate';

export interface ImportOptions {
  actor: string;
  area: string;
  snapshotAt: string;
  bbox: [number, number, number, number]; // west,south,east,north : zone éditoriale, pas limite de commune
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
}
const asJson = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
    throw new Error('Actor et area requis (100 caractères maximum)');
  if (
    !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(options.snapshotAt) ||
    !Number.isFinite(Date.parse(options.snapshotAt)) ||
    Date.parse(options.snapshotAt) > Date.now()
  )
    throw new Error('snapshotAt doit être une date UTC passée valide');
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
    e - w > 0.5 ||
    n - s > 0.5
  )
    throw new Error(
      'BBox invalide : west,south,east,north ; dimensions maximum 0.5 degré',
    );
  const candidates = parseOverpassResponse(payload);
  if (candidates.length > 100)
    throw new Error('Sélectionner au maximum 100 candidats par import');
  return candidates;
}
/** Commande locale privilégiée, transactionnelle ; aucune publication ou modification canonique de fiche existante. */
export class OsmImportService {
  constructor(private readonly db: PrismaClient) {}
  async import(payload: unknown, options: ImportOptions) {
    const candidates = prepareImport(payload, options);
    const commandHash = createHash('sha256')
      .update(JSON.stringify({ candidates, options }))
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        // Tous les chemins de création éditoriale futurs doivent partager ce verrou.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(72421601)`;
        const previous = await tx.osmImportRun.findUnique({
          where: { commandHash },
        });
        if (previous) return { replayed: true, result: previous.result };
        const items: ImportItem[] = [];
        for (const candidate of candidates) {
          const source = `${candidate.osmType}/${candidate.osmId}`;
          const point = candidate.point;
          const [west, south, east, north] = options.bbox;
          if (
            point &&
            (point.longitude < west ||
              point.longitude > east ||
              point.latitude < south ||
              point.latitude > north)
          ) {
            items.push({ source, outcome: 'OUTSIDE_ZONE' });
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
          const record = await tx.osmRecord.upsert({
            where,
            create: {
              osmType: candidate.osmType,
              osmId: BigInt(candidate.osmId),
              osmVersion: candidate.osmVersion,
              snapshotAt: new Date(options.snapshotAt),
              candidate: asJson(candidate),
            },
            update: {
              osmVersion: candidate.osmVersion,
              snapshotAt: new Date(options.snapshotAt),
              candidate: asJson(candidate),
            },
          });
          if (record.restaurantId) {
            items.push({
              source,
              outcome: 'EXACT_MATCH',
              restaurantId: record.restaurantId,
            });
            continue;
          }
          if (!candidate.name || !point || !candidate.address.street) {
            items.push({ source, outcome: 'NEEDS_DATA' });
            continue;
          }
          if (
            candidate.name.length > 200 ||
            candidate.warnings.includes('APPROXIMATE_POINT') ||
            candidate.warnings.includes('LIFECYCLE_REVIEW')
          ) {
            items.push({ source, outcome: 'NEEDS_REVIEW' });
            continue;
          }
          const address = [
            candidate.address.housenumber,
            candidate.address.street,
            candidate.address.city,
          ]
            .filter(Boolean)
            .join(', ');
          if (address.length > 500) {
            items.push({ source, outcome: 'NEEDS_REVIEW' });
            continue;
          }
          // Recherche spatiale bornée + correspondance de nom forte pour repérer les déplacements.
          const matches = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "Restaurant"
          WHERE (ST_DWithin(location, ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}),4326)::geography,250)
                 AND "normalizedName" % ${normalizeName(candidate.name)} AND similarity("normalizedName", ${normalizeName(candidate.name)}) >= 0.45)
             OR "normalizedName" = ${normalizeName(candidate.name)}
          ORDER BY id LIMIT 21`;
          if (matches.length) {
            items.push({
              source,
              outcome: 'NEEDS_REVIEW',
              possibleRestaurantIds: matches.map((m) => m.id),
            });
            continue;
          }
          const restaurantId = randomUUID();
          const evidence = {
            source: 'OSM',
            sourceRecordId: record.id,
            osmVersion: candidate.osmVersion,
            snapshotAt: options.snapshotAt,
            importedBy: options.actor,
            license: 'ODbL-1.0',
          };
          await tx.restaurant.create({
            data: {
              id: restaurantId,
              name: candidate.name,
              area: options.area,
              address,
              latitude: point.latitude,
              longitude: point.longitude,
              fieldProvenance: asJson({
                name: evidence,
                address: evidence,
                geo: evidence,
                area: { source: 'EDITORIAL_ZONE', actor: options.actor },
              }),
            },
          });
          await tx.osmRecord.update({
            where: { id: record.id },
            data: { restaurantId },
          });
          items.push({ source, outcome: 'DRAFT_CREATED', restaurantId });
        }
        const result = asJson({
          items,
          total: items.length,
          created: items.filter((i) => i.outcome === 'DRAFT_CREATED').length,
        });
        await tx.osmImportRun.create({
          data: {
            commandHash,
            actor: options.actor,
            snapshotAt: new Date(options.snapshotAt),
            result,
          },
        });
        return { replayed: false, result };
      },
      { timeout: 30000, maxWait: 10000 },
    );
  }
}
