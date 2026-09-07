import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const provided = (_: unknown, value: unknown): boolean => value !== undefined;
const queryInteger = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const queryBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class PageQuery {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 1000 })
  @Transform(queryInteger)
  @IsInt()
  @Min(0)
  @Max(1000)
  offset = 0;
}
export class CatalogQuery extends PageQuery {
  @ApiPropertyOptional({ maxLength: 120 })
  @ValidateIf(provided)
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(provided)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(provided)
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(provided)
  @IsString()
  @MaxLength(100)
  restaurantId?: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 10000000,
    description: 'Plafond en FC entiers du contrat mobile initial.',
  })
  @ValidateIf(provided)
  @Transform(queryInteger)
  @IsInt()
  @Min(1)
  @Max(10000000)
  maxPrice?: number;

  @ApiPropertyOptional()
  @ValidateIf(provided)
  @Transform(queryBoolean)
  @IsBoolean()
  available?: boolean;
}
export class BudgetSearchDto extends PageQuery {
  @ApiProperty({
    minimum: 1,
    maximum: 10000000,
    example: 30000,
    description:
      'FC entiers ; décimales refusées dans ce contrat mobile initial.',
  })
  @IsInt()
  @Min(1)
  @Max(10000000)
  budget!: number;

  @ApiProperty({ minimum: 1, maximum: 20, example: 2 })
  @IsInt()
  @Min(1)
  @Max(20)
  people!: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf(provided)
  @IsString()
  @MaxLength(100)
  area?: string;
}
