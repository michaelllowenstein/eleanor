import { Component, inject } from '@angular/core';
import { PlatformService } from '../../../core/services/platform';

@Component({
  selector: 'app-titlebar',
  standalone: true,
  template: `
    @if (platform.isDesktop()) {
      <header class="titlebar" [class.darwin]="platform.platform() === 'darwin'">
        <span class="titlebar-title">Eleanor</span>
      </header>
    }
  `,
  styles: [`
    .titlebar {
      -webkit-app-region: drag;
      height: 38px;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.02em;
      color: var(--text-secondary, #888);
      border-bottom: 1px solid var(--border-subtle, rgba(128,128,128,0.15));
      position: relative;
      z-index: 1000;
    }
    .titlebar.darwin {
      padding-left: 78px;
    }
  `],
})
export class Titlebar {
  readonly platform = inject(PlatformService);
}
