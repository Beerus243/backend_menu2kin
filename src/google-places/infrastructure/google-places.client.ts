import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  GooglePlacesError,
  mapGooglePage,
  mapGooglePlace,
  validatePlaceId,
} from '../domain/google-place';

export const GOOGLE_PLACES_OPTIONS = Symbol('GOOGLE_PLACES_OPTIONS');
export const GOOGLE_PLACES_FETCH = Symbol('GOOGLE_PLACES_FETCH');
export interface GooglePlacesOptions {
  enabled: boolean;
  apiKey?: string;
  timeoutMs?: number;
}
export type PlacesFetch = (url: string, init: RequestInit) => Promise<Response>;
export interface SearchTextInput {
  query: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  pageToken?: string;
}
export const SEARCH_FIELDS =
  'places.id,places.displayName,places.formattedAddress,places.location,places.attributions,nextPageToken';
export const NEARBY_FIELDS =
  'places.id,places.displayName,places.formattedAddress,places.location,places.attributions';
export const DETAILS_FIELDS =
  'id,displayName,formattedAddress,location,types,attributions';
export const CONTACT_FIELDS = `${DETAILS_FIELDS},internationalPhoneNumber,regularOpeningHours`;

/** Adaptateur interne testé. Non exposé en HTTP et non monté dans AppModule. */
@Injectable()
export class GooglePlacesClient {
  private readonly logger = new Logger(GooglePlacesClient.name);
  constructor(
    @Inject(GOOGLE_PLACES_OPTIONS)
    private readonly options: GooglePlacesOptions,
    @Inject(GOOGLE_PLACES_FETCH) private readonly transport: PlacesFetch,
  ) {}

  async searchText(input: SearchTextInput) {
    this.validateCircle(input);
    if (
      typeof input.query !== 'string' ||
      input.query.trim().length < 2 ||
      input.query.length > 120 ||
      (input.pageToken !== undefined &&
        (typeof input.pageToken !== 'string' ||
          input.pageToken.length < 1 ||
          input.pageToken.length > 4096))
    ) {
      throw new GooglePlacesError('GOOGLE_INVALID_INPUT');
    }
    return this.request(
      'text_search',
      '/places:searchText',
      SEARCH_FIELDS,
      mapGooglePage,
      {
        textQuery: input.query.trim(),
        languageCode: 'fr',
        regionCode: 'CD',
        includedType: 'restaurant',
        pageSize: 10,
        locationBias: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters,
          },
        },
        ...(input.pageToken ? { pageToken: input.pageToken } : {}),
      },
    );
  }

  async nearby(input: Omit<SearchTextInput, 'query' | 'pageToken'>) {
    this.validateCircle(input);
    return this.request(
      'nearby_search',
      '/places:searchNearby',
      NEARBY_FIELDS,
      mapGooglePage,
      {
        includedTypes: ['restaurant'],
        maxResultCount: 10,
        languageCode: 'fr',
        regionCode: 'CD',
        rankPreference: 'DISTANCE',
        locationRestriction: {
          circle: {
            center: { latitude: input.latitude, longitude: input.longitude },
            radius: input.radiusMeters,
          },
        },
      },
    );
  }

  async details(placeId: string, profile: 'identity' | 'contact' = 'identity') {
    validatePlaceId(placeId);
    if (profile !== 'identity' && profile !== 'contact')
      throw new GooglePlacesError('GOOGLE_INVALID_INPUT');
    return this.request(
      'details',
      `/places/${encodeURIComponent(placeId)}?languageCode=fr&regionCode=CD`,
      profile === 'contact' ? CONTACT_FIELDS : DETAILS_FIELDS,
      mapGooglePlace,
    );
  }

  private validateCircle(
    input: Omit<SearchTextInput, 'query' | 'pageToken'>,
  ): void {
    if (
      !Number.isFinite(input.latitude) ||
      Math.abs(input.latitude) > 90 ||
      !Number.isFinite(input.longitude) ||
      Math.abs(input.longitude) > 180 ||
      !Number.isFinite(input.radiusMeters) ||
      input.radiusMeters < 100 ||
      input.radiusMeters > 10000
    ) {
      throw new GooglePlacesError('GOOGLE_INVALID_INPUT');
    }
  }

  private async request<T>(
    operation: string,
    path: string,
    mask: string,
    mapper: (value: unknown) => T,
    body?: object,
  ): Promise<T> {
    if (!this.options.enabled || !this.options.apiKey?.trim())
      throw new GooglePlacesError('GOOGLE_DISABLED');
    const timeoutMs = this.options.timeoutMs ?? 4000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
      throw new GooglePlacesError('GOOGLE_DISABLED');
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    this.logger.log({ event: 'google_request', operation });
    try {
      const response = await this.transport(
        `https://places.googleapis.com/v1${path}`,
        {
          method: body ? 'POST' : 'GET',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            'X-Goog-Api-Key': this.options.apiKey,
            'X-Goog-FieldMask': mask,
            'Content-Type': 'application/json',
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (!response.ok) {
        await response.body?.cancel(); // ne pas lire ou loguer le message fournisseur
        throw new GooglePlacesError(
          response.status === 429
            ? 'GOOGLE_QUOTA_EXCEEDED'
            : response.status === 401 || response.status === 403
              ? 'GOOGLE_ACCESS_DENIED'
              : response.status === 404
                ? 'GOOGLE_NOT_FOUND'
                : response.status === 400
                  ? 'GOOGLE_INVALID_INPUT'
                  : 'GOOGLE_UNAVAILABLE',
        );
      }
      // Aucun cache applicatif et taille bornée avant JSON.parse.
      const reader = response.body?.getReader();
      if (!reader) throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 256 * 1024) {
            await reader.cancel();
            throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      let result: unknown;
      try {
        result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new GooglePlacesError('GOOGLE_INVALID_RESPONSE');
      }
      const mapped = mapper(result);
      this.logger.log({
        event: 'google_success',
        operation,
        durationMs: Date.now() - started,
      });
      return mapped;
    } catch (error) {
      const safe = controller.signal.aborted
        ? new GooglePlacesError('GOOGLE_TIMEOUT')
        : error instanceof GooglePlacesError
          ? error
          : new GooglePlacesError('GOOGLE_UNAVAILABLE');
      this.logger.warn({
        event: 'google_error',
        operation,
        code: safe.code,
        durationMs: Date.now() - started,
      });
      throw safe;
    } finally {
      clearTimeout(deadline);
    }
  }
}
