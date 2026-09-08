import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { RegisterDto, LoginDto } from './auth.dto';

type UserRecord = {
  id: string;
  phone: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
};

type RefreshRecord = { userId: string; expiresAt: number; used: boolean };

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const secret = () => process.env.JWT_SECRET ?? 'development-only-change-me';

@Injectable()
export class AuthService {
  private readonly users = new Map<string, UserRecord>();
  private readonly refreshTokens = new Map<string, RefreshRecord>();

  async register(input: RegisterDto) {
    const phone = normalizePhone(input.phone);
    if (this.users.has(phone)) throw new ConflictException('Ce numéro est déjà utilisé');
    const user: UserRecord = {
      id: randomUUID(),
      phone,
      displayName: input.displayName.trim(),
      passwordHash: hashPassword(input.password),
      createdAt: new Date().toISOString(),
    };
    this.users.set(phone, user);
    return this.issue(user);
  }

  async login(input: LoginDto) {
    const user = this.users.get(normalizePhone(input.phone));
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException('Numéro ou mot de passe incorrect');
    }
    return this.issue(user);
  }

  refresh(rawToken: string) {
    const tokenHash = hashToken(rawToken);
    const current = this.refreshTokens.get(tokenHash);
    if (!current || current.used || current.expiresAt <= Date.now()) {
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
    current.used = true;
    const user = [...this.users.values()].find((candidate) => candidate.id === current.userId);
    if (!user) throw new UnauthorizedException('Compte introuvable');
    return this.issue(user);
  }

  logout(rawToken: string): void {
    const record = this.refreshTokens.get(hashToken(rawToken));
    if (record) record.used = true;
  }

  verifyAccessToken(token: string): { sub: string; phone: string } {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Access token invalide');
    const [encodedHeader, encodedPayload, signature] = parts;
    const expected = sign(`${encodedHeader}.${encodedPayload}`);
    if (!safeEqual(signature, expected)) throw new UnauthorizedException('Access token invalide');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as {
      sub?: string; phone?: string; exp?: number;
    };
    if (!payload.sub || !payload.phone || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Access token expiré');
    }
    return { sub: payload.sub, phone: payload.phone };
  }

  private issue(user: UserRecord) {
    const now = Math.floor(Date.now() / 1000);
    const header = encode({ alg: 'HS256', typ: 'JWT' });
    const payload = encode({ sub: user.id, phone: user.phone, name: user.displayName, iat: now, exp: now + ACCESS_TTL_SECONDS });
    const accessToken = `${header}.${payload}.${sign(`${header}.${payload}`)}`;
    const refreshToken = randomBytes(48).toString('base64url');
    this.refreshTokens.set(hashToken(refreshToken), {
      userId: user.id,
      expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
      used: false,
    });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TTL_SECONDS,
      user: { id: user.id, phone: user.phone, displayName: user.displayName, createdAt: user.createdAt },
    };
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, '');
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, digest] = stored.split(':');
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  return safeEqual(actual.toString('hex'), digest);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}