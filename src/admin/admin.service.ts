import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService, catalogSource } from '../database/database.service';
import { OsmImportService } from '../osm/application/osm-import.service';
import { WebsiteImportService } from '../ingestion/website-import.service';
import {
  duplicates,
  jsonValue,
  publicJson,
  quality,
} from '../ingestion/domain/discovery';
import type {
  UpdateDishDto,
  AdminRestaurantQueryDto,
  CreateRestaurantDto,
  DishDraftDto,
  OsmImportDto,
  UpdateRestaurantDto,
  VersionDto,
  WebsiteImportDto,
} from './admin.dto';
import { adminActor } from './admin.guard';
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  constructor(private readonly db: DatabaseService) {}
  private database() {
    if (catalogSource() !== 'postgres')
      throw new ServiceUnavailableException('CATALOG_SOURCE=postgres requis');
    return this.db.client;
  }
  async importOsm(input: OsmImportDto) {
    try {
      this.logger.log({ event: 'osm_import_started', dryRun: input.dryRun });
      const result = await new OsmImportService(this.database()).import(
        input.payload,
        {
          actor: adminActor(),
          area: input.area,
          snapshotAt: input.snapshotAt,
          bbox: input.bbox,
        },
        input.dryRun,
      );
      this.logger.log({
        event: 'osm_import_completed',
        dryRun: input.dryRun,
        replayed: result.replayed,
      });
      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new BadRequestException(
        'Import refusé : vérifier fichier, options et état de la source',
      );
    }
  }
  async importWebsite(input: WebsiteImportDto) {
    try {
      return await new WebsiteImportService(this.database()).import(
        { ...input, actor: adminActor() },
        input.dryRun,
      );
    } catch {
      throw new BadRequestException(
        'Source non autorisée ou données invalides',
      );
    }
  }
  async candidates(query: AdminRestaurantQueryDto) {
    const rows = await this.database().osmRecord.findMany({
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: query.offset,
      take: query.limit + 1,
    });
    return publicJson({
      data: rows.slice(0, query.limit),
      meta: { hasNextPage: rows.length > query.limit },
    });
  }
  async restaurants(query: AdminRestaurantQueryDto) {
    const rows = await this.database().restaurant.findMany({
      where: query.status ? { contentStatus: query.status } : {},
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: query.offset,
      take: query.limit + 1,
    });
    return {
      data: rows.slice(0, query.limit).map((r) => {
        const geo = (r.fieldProvenance as Record<string, unknown>).geo as
          { geometryMethod?: string } | undefined;
        return {
          ...r,
          quality: quality({
            ...r,
            warnings:
              geo?.geometryMethod === 'OVERPASS_BBOX_CENTER'
                ? ['APPROXIMATE_POINT']
                : [],
          }),
        };
      }),
      meta: {
        offset: query.offset,
        limit: query.limit,
        hasNextPage: rows.length > query.limit,
        nextOffset:
          rows.length > query.limit ? query.offset + query.limit : null,
      },
    };
  }
  async restaurant(id: string) {
    const row = await this.database().restaurant.findUnique({
      where: { id },
      include: {
        osmRecords: { take: 5, orderBy: { snapshotAt: 'desc' } },
        sourceRecords: { take: 5 },
      },
    });
    if (!row) throw new NotFoundException('Restaurant introuvable');
    return publicJson({ data: row });
  }
  async createRestaurant(input: CreateRestaurantDto) {
    if (!input.name.trim() || !input.area.trim() || !input.evidenceRef.trim())
      throw new BadRequestException('Champs requis vides');
    return this.database().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72421601)`;
      const matches = await duplicates(tx, {
        ...input,
        phone: input.phone ?? null,
        website: input.website ?? null,
      });
      if (matches.length)
        throw new ConflictException({
          message: 'Doublon possible à examiner',
          candidateIds: matches.map((m) => m.id),
        });
      const { evidenceRef, ...data } = input;
      const evidence = {
        source: 'TEAM_FIELD_VISIT',
        actor: adminActor(),
        evidenceRef,
        at: new Date().toISOString(),
      };
      const row = await tx.restaurant.create({
        data: {
          ...data,
          name: data.name.trim(),
          area: data.area.trim(),
          fieldProvenance: jsonValue(
            Object.fromEntries(
              ['name', 'address', 'geo', 'phone', 'website', 'area'].map(
                (f) => [f, evidence],
              ),
            ),
          ),
        },
      });
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'restaurant_created',
          resourceId: row.id,
          fields: Object.keys(data),
        },
      });
      return { data: row };
    });
  }
  async updateRestaurant(id: string, input: UpdateRestaurantDto) {
    if ((input.latitude !== undefined) !== (input.longitude !== undefined))
      throw new BadRequestException('Modifier latitude/longitude ensemble');
    if (
      (input.name !== undefined && !input.name.trim()) ||
      (input.area !== undefined && !input.area.trim())
    )
      throw new BadRequestException('Nom/zone vide');
    if ((input.photo || input.verified === true) && !input.evidenceRef?.trim())
      throw new BadRequestException(
        'Preuve requise pour photo ou vérification',
      );
    return this.database().$transaction(async (tx) => {
      const current = await tx.restaurant.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Restaurant introuvable');
      const { expectedVersion, evidenceRef, ...editable } = input;
      const base =
        current.fieldProvenance &&
        typeof current.fieldProvenance === 'object' &&
        !Array.isArray(current.fieldProvenance)
          ? current.fieldProvenance
          : {};
      const provenance = { ...base };
      for (const field of Object.keys(editable)) {
        const group =
          field === 'latitude' || field === 'longitude' ? 'geo' : field;
        provenance[group] = {
          source: 'MENU2KIN_EDIT',
          actor: adminActor(),
          evidenceRef: evidenceRef ?? null,
          at: new Date().toISOString(),
          derivedFrom:
            base[group] &&
            typeof base[group] === 'object' &&
            !Array.isArray(base[group])
              ? ((base[group] as Record<string, unknown>).derivedFrom ??
                base[group])
              : (base[group] ?? null),
        };
      }
      // Une édition invalide la vérification précédente sauf attestation explicite ; pas de publication implicite.
      const count = await tx.restaurant.updateMany({
        where: { id, version: expectedVersion },
        data: {
          ...editable,
          ...(Object.keys(editable).some((k) =>
            ['name', 'latitude', 'longitude', 'address'].includes(k),
          ) && input.verified === undefined
            ? { verified: false }
            : {}),
          version: { increment: 1 },
          fieldProvenance: jsonValue(provenance),
        },
      });
      if (!count.count)
        throw new ConflictException('Version modifiée : recharger la fiche');
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'restaurant_updated',
          resourceId: id,
          fields: Object.keys(editable),
        },
      });
      return { data: await tx.restaurant.findUniqueOrThrow({ where: { id } }) };
    });
  }
  async publish(id: string, input: VersionDto) {
    return this.database().$transaction(async (tx) => {
      const current = await tx.restaurant.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Restaurant introuvable');
      if (!current.verified || !current.name.trim())
        throw new ConflictException(
          'Vérification humaine de l’identité et du GPS requise',
        );
      const updated = await tx.restaurant.updateMany({
        where: { id, version: input.expectedVersion },
        data: { contentStatus: 'PUBLISHED', version: { increment: 1 } },
      });
      if (!updated.count) throw new ConflictException('Version modifiée');
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'restaurant_published',
          resourceId: id,
          fields: ['contentStatus'],
        },
      });
      return { data: await tx.restaurant.findUniqueOrThrow({ where: { id } }) };
    });
  }
  async dishes(id: string) {
    await this.restaurant(id);
    return {
      data: await this.database().dish.findMany({
        where: { restaurantId: id },
        orderBy: { id: 'asc' },
        take: 100,
      }),
    };
  }
  async createDish(id: string, input: DishDraftDto) {
    await this.restaurant(id);
    if (input.image && !input.imageRightsRef?.trim())
      throw new BadRequestException('Preuve de droits image requise');
    const { imageRightsRef, ...data } = input;
    return this.database().$transaction(async (tx) => {
      const dish = await tx.dish.create({
        data: {
          ...data,
          description: data.description ?? '',
          servings: data.servings ?? 1,
          restaurantId: id,
          fieldProvenance: jsonValue({
            actor: adminActor(),
            imageRightsRef: imageRightsRef ?? null,
          }),
        },
      });
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'dish_draft_created',
          resourceId: dish.id,
          fields: Object.keys(data),
        },
      });
      return { data: dish };
    });
  }

  async updateDish(id: string, input: UpdateDishDto) {
    if (input.image && !input.imageRightsRef?.trim())
      throw new BadRequestException('Preuve de droits image requise');
    return this.database().$transaction(async (tx) => {
      const current = await tx.dish.findUnique({
        where: { id },
        include: { restaurant: true },
      });
      if (!current) throw new NotFoundException('Plat introuvable');
      const { expectedVersion, imageRightsRef, ...data } = input;
      const price = input.price === undefined ? current.price : input.price;
      if (
        (input.contentStatus ?? current.contentStatus) === 'PUBLISHED' &&
        (price === null ||
          !current.restaurant.verified ||
          current.restaurant.contentStatus !== 'PUBLISHED')
      )
        throw new ConflictException('Prix et restaurant vérifié publié requis');
      const prior = current.fieldProvenance as Record<string, unknown>;
      const count = await tx.dish.updateMany({
        where: { id, version: expectedVersion },
        data: {
          ...data,
          version: { increment: 1 },
          fieldProvenance: jsonValue({
            ...prior,
            actor: adminActor(),
            ...(imageRightsRef ? { imageRightsRef } : {}),
            updatedAt: new Date().toISOString(),
          }),
        },
      });
      if (!count.count) throw new ConflictException('Version modifiée');
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'dish_updated',
          resourceId: id,
          fields: Object.keys(data),
        },
      });
      return { data: await tx.dish.findUniqueOrThrow({ where: { id } }) };
    });
  }

  async websiteCandidates(query: AdminRestaurantQueryDto) {
    return {
      data: await this.database().sourceRecord.findMany({
        orderBy: { id: 'asc' },
        skip: query.offset,
        take: query.limit,
      }),
    };
  }
  async linkCandidate(id: string, restaurantId: string) {
    return this.database().$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(72421601)`;
      const source = await tx.osmRecord.findUnique({ where: { id } });
      if (
        !source ||
        !(await tx.restaurant.findUnique({ where: { id: restaurantId } }))
      )
        throw new NotFoundException('Source ou restaurant introuvable');
      if (source.restaurantId && source.restaurantId !== restaurantId)
        throw new ConflictException('Source déjà liée');
      await tx.osmRecord.update({ where: { id }, data: { restaurantId } });
      await tx.adminAudit.create({
        data: {
          actor: adminActor(),
          action: 'osm_candidate_linked',
          resourceId: restaurantId,
          fields: [`osmRecord:${id}`],
        },
      });
      return { data: { sourceRecordId: id, restaurantId } };
    });
  }
}
