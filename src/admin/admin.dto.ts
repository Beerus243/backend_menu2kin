import {
  IsUUID,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ArrayMaxSize,
  ArrayMinSize,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
const provided = (_: unknown, v: unknown) => v !== undefined;
export class OsmImportDto {
  @ApiProperty({ type: Object }) @IsObject() payload!: Record<string, unknown>;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) area!: string;
  @ApiProperty() @IsString() @MaxLength(30) snapshotAt!: string;
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsNumber({}, { each: true })
  bbox!: [number, number, number, number];
  @ApiPropertyOptional({ default: true }) @IsBoolean() dryRun = true;
}
export class WebsiteImportDto {
  @ApiProperty() @IsString() @MaxLength(60000) html!: string;
  @ApiProperty() @IsString() @MaxLength(100) sourceKey!: string;
  @ApiProperty()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(1000)
  sourceUrl!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) area!: string;
  @ApiPropertyOptional({ default: true }) @IsBoolean() dryRun = true;
}
export class AdminRestaurantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'])
  status?: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit =
    20;
  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  offset = 0;
}
export class VersionDto {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
}
export class UpdateRestaurantDto extends VersionDto {
  @ApiPropertyOptional() @ValidateIf(provided) @IsBoolean() open?: boolean;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  area?: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  website?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  photo?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  openingHours?: string | null;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  cuisine?: string[];
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsIn(['DRAFT', 'PENDING_REVIEW', 'HIDDEN', 'ARCHIVED'])
  contentStatus?: 'DRAFT' | 'PENDING_REVIEW' | 'HIDDEN' | 'ARCHIVED';
  @ApiPropertyOptional() @ValidateIf(provided) @IsBoolean() verified?: boolean;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsString()
  @MaxLength(500)
  evidenceRef?: string;
}
export class CreateRestaurantDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) area!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
  @ApiProperty() @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) longitude!: number;
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
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) evidenceRef!: string;
}
export class DishDraftDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) category!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000000)
  price?: number | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  image?: string | null;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsString()
  @MaxLength(2000)
  description?: string;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsInt()
  @Min(1)
  @Max(100)
  servings?: number;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsString()
  @MaxLength(500)
  imageRightsRef?: string;
}

export class UpdateDishDto extends PartialType(DishDraftDto, {
  skipNullProperties: false,
}) {
  @ApiProperty() @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional() @ValidateIf(provided) @IsBoolean() available?: boolean;
  @ApiPropertyOptional() @ValidateIf(provided) @IsBoolean() daily?: boolean;
  @ApiPropertyOptional()
  @ValidateIf(provided)
  @IsIn(['DRAFT', 'PUBLISHED', 'HIDDEN', 'ARCHIVED'])
  contentStatus?: 'DRAFT' | 'PUBLISHED' | 'HIDDEN' | 'ARCHIVED';
}

export class LinkCandidateDto {
  @ApiProperty() @IsUUID() restaurantId!: string;
}
