import {
  Controller,
  Get,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsNumber, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { DatabaseService, catalogSource } from '../database/database.service';
import { osmAttribution } from './postgres-catalog.service';
const numeric = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
    ? Number(value)
    : value;
class NearbyQuery {
  @ApiProperty({ example: -4.31 })
  @Transform(numeric)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;
  @ApiProperty({ example: 15.3 })
  @Transform(numeric)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;
  @ApiPropertyOptional({ default: 2000 })
  @Transform(numeric)
  @IsInt()
  @Min(100)
  @Max(10000)
  radiusMeters = 2000;
  @ApiPropertyOptional({ default: 20 })
  @Transform(numeric)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
@ApiTags('Géographie — PostgreSQL')
@Controller('restaurants/nearby')
export class NearbyController {
  constructor(private readonly db: DatabaseService) {}
  @Get()
  async nearby(@Query() query: NearbyQuery) {
    if (catalogSource() !== 'postgres')
      throw new ServiceUnavailableException(
        'La proximité nécessite CATALOG_SOURCE=postgres',
      );
    const rows = await this.db.client.$queryRaw<
      {
        id: string;
        name: string;
        area: string;
        open: boolean;
        latitude: number;
        longitude: number;
        distanceMeters: number;
      }[]
    >`
      SELECT id,name,area,open,latitude,longitude,
             ST_Distance(location, ST_SetSRID(ST_MakePoint(${query.lon},${query.lat}),4326)::geography) AS "distanceMeters"
      FROM "Restaurant"
      WHERE "contentStatus"='PUBLISHED' AND verified
        AND ST_DWithin(location,ST_SetSRID(ST_MakePoint(${query.lon},${query.lat}),4326)::geography,${query.radiusMeters})
      ORDER BY ST_Distance(location,ST_SetSRID(ST_MakePoint(${query.lon},${query.lat}),4326)::geography),id
      LIMIT ${query.limit + 1}`;
    return {
      data: rows.slice(0, query.limit),
      meta: {
        source: 'postgres',
        hasMore: rows.length > query.limit,
        attributions: [osmAttribution],
        distanceBasis: 'STRAIGHT_LINE',
      },
    };
  }
}
