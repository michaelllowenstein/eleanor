import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { MockRealtimeTransport } from './core/transport/mock-realtime';
import { REALTIME_TRANSPORT } from './core/transport/realtime';
import { WebRTCRealtimeTransport } from './core/transport/webrtc-realtime';
import { routes } from './routes';
import { env } from '../envs/env';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes)
  ]
};
