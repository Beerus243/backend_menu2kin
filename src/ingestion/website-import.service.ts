import { createHash } from 'node:crypto';
import { PrismaClient } from '../generated/prisma/client';
import { duplicates, jsonValue, quality } from './domain/discovery';
import { parseRestaurantJsonLd } from './domain/jsonld';
import { approvedWebsiteSource } from './infrastructure/website-sources';
export class WebsiteImportService {
  constructor(private readonly db: PrismaClient) {}
  async import(
    input: {
      html: string;
      sourceKey: string;
      sourceUrl: string;
      area: string;
      actor: string;
    },
    dryRun = true,
  ) {
    const source = await approvedWebsiteSource(
      input.sourceKey,
      input.sourceUrl,
    );
    if (
      !input.actor.trim() ||
      input.actor.length > 100 ||
      !input.area.trim() ||
      input.area.length > 100
    )
      throw new Error('INVALID_IMPORT_OPTIONS');
    const parsed = parseRestaurantJsonLd(input.html, input.sourceUrl);
    if (parsed.invalidScripts) throw new Error('INVALID_JSONLD_SCRIPTS');
    if (parsed.candidates.length > 100) throw new Error('WEBSITE_IMPORT_LIMIT');
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          input: { ...input, html: undefined },
          source,
          candidates: parsed.candidates,
        }),
      )
      .digest('hex');
    return this.db.$transaction(
      async (tx) => {
        if (dryRun) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        else await tx.$executeRaw`SELECT pg_advisory_xact_lock(72421601)`;
        if (!dryRun) {
          const prior = await tx.osmImportRun.findUnique({
            where: { commandHash: hash },
          });
          if (prior)
            return { dryRun: false, replayed: true, result: prior.result };
        }
        const items: object[] = [];
        // Multi-entity pages are staged for explicit selection; no uncertain automatic merging.
        for (const c of parsed.candidates) {
          const where = {
            sourceKey_externalId: {
              sourceKey: source.key,
              externalId: c.externalId,
            },
          };
          const old = await tx.sourceRecord.findUnique({ where });
          const record = dryRun
            ? old
            : await tx.sourceRecord.upsert({
                where,
                create: {
                  sourceKey: source.key,
                  externalId: c.externalId,
                  sourceUrl: input.sourceUrl,
                  rights: jsonValue(source),
                  candidate: jsonValue(c),
                  snapshotAt: new Date(),
                },
                update: { candidate: jsonValue(c), snapshotAt: new Date() },
              });
          if (record?.restaurantId) {
            items.push({
              source: c.externalId,
              outcome: 'EXACT_MATCH',
              restaurantId: record.restaurantId,
            });
            continue;
          }
          const score = quality(c);
          if (!c.name || c.latitude === null || c.longitude === null) {
            items.push({
              source: c.externalId,
              outcome: 'NEEDS_DATA',
              quality: score,
            });
            continue;
          }
          if (
            parsed.candidates.length > 1 ||
            c.warnings.includes('AMBIGUOUS_BUSINESS_TYPE')
          ) {
            items.push({
              source: c.externalId,
              outcome: 'NEEDS_REVIEW',
              quality: score,
            });
            continue;
          }
          const matches = await duplicates(tx, c);
          if (matches.length) {
            items.push({
              source: c.externalId,
              outcome: 'NEEDS_REVIEW',
              possibleRestaurantIds: matches.map((m) => m.id),
              quality: score,
            });
            continue;
          }
          let restaurantId: string | undefined;
          if (!dryRun) {
            const evidence = {
              source: 'WEBSITE',
              sourceRecordId: record!.id,
              sourceUrl: input.sourceUrl,
              license: source.license,
              evidenceRef: source.evidenceRef,
              actor: input.actor,
            };
            const created = await tx.restaurant.create({
              data: {
                name: c.name,
                address: c.address,
                area: input.area,
                latitude: c.latitude,
                longitude: c.longitude,
                phone: c.phone,
                website: c.website,
                openingHours: c.openingHours,
                cuisine: c.cuisine,
                fieldProvenance: jsonValue(
                  Object.fromEntries(
                    [
                      'name',
                      'address',
                      'geo',
                      'phone',
                      'website',
                      'cuisine',
                      'openingHours',
                    ].map((field) => [field, evidence]),
                  ),
                ),
              },
            });
            restaurantId = created.id;
            await tx.sourceRecord.update({
              where: { id: record!.id },
              data: { restaurantId },
            });
          }
          items.push({
            source: c.externalId,
            outcome: 'DRAFT_CREATED',
            restaurantId,
            quality: score,
          });
        }
        const result = jsonValue({ items, found: parsed.candidates.length });
        if (!dryRun)
          await tx.osmImportRun.create({
            data: {
              commandHash: hash,
              actor: input.actor,
              snapshotAt: new Date(),
              result,
            },
          });
        return { dryRun, replayed: false, result };
      },
      {
        timeout: 30000,
        isolationLevel: dryRun ? 'RepeatableRead' : 'ReadCommitted',
      },
    );
  }
}
