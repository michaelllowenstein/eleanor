import { Injectable, signal, computed } from '@angular/core';
import { EleanorDesktopBridge } from '../../../types/electron';

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly bridge = signal<EleanorDesktopBridge | undefined>(
    (globalThis as any).eleanor
  );

  readonly isDesktop = computed(() => this.bridge()?.isDesktop === true);
  readonly isBrowser = computed(() => !this.isDesktop());
  readonly platform = computed(() => this.bridge()?.platform ?? 'browser');
  readonly versions = computed(() => this.bridge()?.versions);
}
