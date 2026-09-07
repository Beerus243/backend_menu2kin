import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import {
  GOOGLE_PLACES_FETCH,
  GOOGLE_PLACES_OPTIONS,
  GooglePlacesClient,
} from './infrastructure/google-places.client';
import type { GooglePlacesOptions } from './infrastructure/google-places.client';

@Module({})
export class GooglePlacesModule {
  static register(options: GooglePlacesOptions): DynamicModule {
    return {
      module: GooglePlacesModule,
      providers: [
        { provide: GOOGLE_PLACES_OPTIONS, useValue: { ...options } },
        {
          provide: GOOGLE_PLACES_FETCH,
          useValue: (url: string, init: RequestInit) => fetch(url, init),
        },
        GooglePlacesClient,
      ],
      exports: [GooglePlacesClient],
    };
  }
}
