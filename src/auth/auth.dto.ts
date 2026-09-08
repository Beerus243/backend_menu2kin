import { IsPhoneNumber, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: '+243812345678' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ example: 'Maman Rose' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;

  @ApiProperty({ example: 'Menu2Kin!2026' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/[A-Za-z]/)
  @Matches(/[0-9]/)
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: '+243812345678' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ example: 'Menu2Kin!2026' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MinLength(40)
  @MaxLength(256)
  refreshToken!: string;
}