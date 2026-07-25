import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export enum RegisterAs {
  CUSTOMER = 'CUSTOMER',
  SELLER = 'SELLER',
}

export class RegisterDto {
  @ApiProperty({ example: 'asha@example.com' })
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(255)
  email!: string;

  /**
   * Length is the dominant factor in password strength, so the minimum is 8 and
   * the composition rule is deliberately mild. Rules like "must contain a
   * symbol" mostly produce `Password1!` — predictable, and no stronger.
   * The 72-byte ceiling is bcrypt/Argon2 input truncation, enforced explicitly
   * rather than silently.
   */
  @ApiProperty({ example: 'correct-horse-battery', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72)
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;

  @ApiProperty({ example: 'Asha' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Menon' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsPhoneNumber('IN', { message: 'Enter a valid Indian phone number' })
  phone?: string;

  @ApiPropertyOptional({ enum: RegisterAs, default: RegisterAs.CUSTOMER })
  @IsOptional()
  @IsEnum(RegisterAs)
  registerAs: RegisterAs = RegisterAs.CUSTOMER;
}

export class LoginDto {
  @ApiProperty({ example: 'asha@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'correct-horse-battery' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ description: 'Stable per-device id, for the sessions list' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @ApiPropertyOptional({ example: "Asha's iPhone" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceName?: string;
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain digits only' })
  otp!: string;
}

export class RequestOtpDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiPropertyOptional({ enum: ['EMAIL', 'SMS'], default: 'EMAIL' })
  @IsOptional()
  @IsEnum(['EMAIL', 'SMS'])
  channel: 'EMAIL' | 'SMS' = 'EMAIL';
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Omitted when the refresh token is sent as a cookie' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

// --- Responses ---

export class AuthUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty() isVerified!: boolean;
}

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived. Keep in memory, never in localStorage.' })
  accessToken!: string;

  @ApiProperty({ description: 'Also set as an HttpOnly cookie; rotates on every use.' })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
