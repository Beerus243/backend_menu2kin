import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OsmImportDto {
  @ApiProperty({ type: Object })
  payload!: Record<string, unknown>;

  @ApiProperty({ example: 'editor-kinshasa' })
  @IsString()
  @MaxLength(100)
  actor!: string;

  @ApiProperty({ example: 'Gombe' })
  @IsString()
  @MaxLength(100)
  area!: string;

  @ApiProperty({ example: '2026-09-08T08:00:00Z' })
  @IsString()
  @MaxLength(30)
  snapshotAt!: string;

  @ApiProperty({ example: [15.25, -4.35, 15.35, -4.25], type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  bbox!: [number, number, number, number];
}

export class AdminRestaurantQueryDto {
  @ApiPropertyOptional({ enum: ['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'])
  status?: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
}

export class UpdateRestaurantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  website?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  cuisine?: string[];

  @ApiPropertyOptional({ minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ minimum: -180, maximum: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ description: 'Statut éditorial, publication réservée à la route dédiée.' })
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_REVIEW', 'HIDDEN', 'ARCHIVED'])
  contentStatus?: 'DRAFT' | 'PENDING_REVIEW' | 'HIDDEN' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'Restaurant vérifié par l’équipe.' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}