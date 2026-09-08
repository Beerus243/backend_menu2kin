import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DatabaseService, catalogSource } from '../database/database.service';
import { OsmImportService } from '../osm/application/osm-import.service';
import type { OsmImportDto, AdminRestaurantQueryDto, UpdateRestaurantDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  private database() {
    if (catalogSource() !== 'postgres') {
      throw new ServiceUnavailableException('Les fonctions admin nécessitent CATALOG_SOURCE=postgres');
    }
    return this.db.client;
  }

  async importOsm(input: OsmImportDto) {
    return new OsmImportService(this.database()).import(input.payload, {
      actor: input.actor,
      area: input.area,
      snapshotAt: input.snapshotAt,
      bbox: input.bbox,
    });
  }

  async restaurants(query: AdminRestaurantQueryDto) {
    const rows = await this.database().restaurant.findMany({
      where: query.status ? { contentStatus: query.status } : {},
      include: { osmRecords: { orderBy: { snapshotAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      skip: query.offset,
      take: query.limit + 1,
    });
    const hasNextPage = rows.length > query.limit;
    return {
      data: rows.slice(0, query.limit),
      meta: { offset: query.offset, limit: query.limit, hasNextPage, nextOffset: hasNextPage ? query.offset + query.limit : null },
    };
  }

  async restaurant(id: string) {
    const row = await this.database().restaurant.findUnique({
      where: { id },
      include: { osmRecords: { orderBy: { snapshotAt: 'desc' }, take: 5 } },
    });
    if (!row) throw new NotFoundException('Restaurant introuvable');
    return { data: row };
  }

  async updateRestaurant(id: string, input: UpdateRestaurantDto) {
    const database = this.database();
    const current = await database.restaurant.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Restaurant introuvable');
    const hasLatitude = input.latitude !== undefined;
    const hasLongitude = input.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new ConflictException('latitude et longitude doivent être modifiées ensemble');
    }
    const { contentStatus, verified, ...editable } = input;
    const data = {
      ...editable,
      ...(contentStatus === undefined ? {} : { contentStatus }),
      ...(verified === undefined ? {} : { verified }),
      ...(input.name === undefined ? {} : { normalizedName: normalizeName(input.name) }),
      version: { increment: 1 },
      fieldProvenance: mergeProvenance(current.fieldProvenance, Object.keys(input), 'TEAM'),
    };
    return { data: await database.restaurant.update({ where: { id }, data }) };
  }

  async publish(id: string) {
    const database = this.database();
    const current = await database.restaurant.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Restaurant introuvable');
    if (!current.name.trim() || !current.address.trim()) throw new ConflictException('Nom et adresse requis avant publication');
    return {
      data: await database.restaurant.update({
        where: { id },
        data: { contentStatus: 'PUBLISHED', verified: true, version: { increment: 1 } },
      }),
    };
  }
}

function normalizeName(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function mergeProvenance(current: unknown, fields: string[], source: string) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return { ...base, ...Object.fromEntries(fields.map((field) => [field, { source, updatedAt: new Date().toISOString() }])) };
}