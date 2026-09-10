import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
@Injectable()
export class AdminGuard implements CanActivate {
  private requests: number[] = [];
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.headers['x-admin-key'],
      configured = process.env.ADMIN_API_KEY;
    if (
      !configured ||
      configured.length < 32 ||
      typeof key !== 'string' ||
      key.length > 1024 ||
      !timingSafeEqual(
        createHash('sha256').update(key).digest(),
        createHash('sha256').update(configured).digest(),
      )
    )
      throw new UnauthorizedException('Accès admin requis');
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < 60000);
    if (this.requests.length >= 100)
      throw new HttpException('Limite admin atteinte', 429);
    this.requests.push(now);
    return true;
  }
}
export const adminActor = () =>
  (process.env.ADMIN_ACTOR ?? 'local-admin').slice(0, 100);
