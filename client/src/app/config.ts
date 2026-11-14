import {
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { LogService } from './core/services/log';
import { MockRealtimeTransport } from './core/transport/mock-realtime';
import { REALTIME_TRANSPORT } from './core/transport/realtime';
import { WebRTCRealtimeTransport } from './core/transport/webrtc-realtime';
import { routes } from './routes';
import { env } from '../envs/env';

/** Sends uncaught errors (including window errors and rejections) to LogService. */
@Injectable()
class LoggingErrorHandler implements ErrorHandler {
  private readonly log = inject(LogService).scope('app');

  handleError(error: unknown): void {
    this.log.error('unhandled', { error });
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: ErrorHandler, useClass: LoggingErrorHandler },
    {
      provide: REALTIME_TRANSPORT,
      useFactory: () => {
        const log = inject(LogService).scope('realtime').child('webrtc');
        return () =>
          env.realtimeTransport === 'mock'
            ? new MockRealtimeTransport()
            : new WebRTCRealtimeTransport(log);
      },
    },
  ],
};
