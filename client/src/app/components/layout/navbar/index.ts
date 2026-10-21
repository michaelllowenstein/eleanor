import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
} from "@angular/core";
import { RouterLink, RouterLinkActive } from "@angular/router";

import { APP_PATHS } from "../../../core/schema/constants";
import type { VoiceConnectionState } from "../../../core/schema/models/realtime";
import { AuthService } from "../../../core/services/auth";
import { RealtimeVoiceService } from "../../../core/services/realtime";

interface StatusPresentation {
  readonly label: string;
  readonly dot: string;
}

const STATUS: Record<VoiceConnectionState, StatusPresentation> = {
  offline: { label: "Offline", dot: "bg-slate-500" },
  connecting: { label: "Connecting", dot: "bg-amber-300 animate-pulse" },
  listening: { label: "Listening", dot: "bg-eleanor-300" },
  thinking: { label: "Thinking", dot: "bg-violet-300 animate-pulse" },
  speaking: { label: "Speaking", dot: "bg-eleanor-400 eleanor-dot-glow" },
  error: { label: "Connection error", dot: "bg-rose-400" },
};

@Component({
  selector: "app-navbar",
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "sticky top-0 z-40 block",
    "(document:click)": "onDocumentClick($event)",
    "(document:keydown.escape)": "closeMenus()",
  },
  templateUrl: "./index.html",
})
export class Navbar {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly auth = inject(AuthService);
  readonly voice = inject(RealtimeVoiceService);

  readonly paths = APP_PATHS;

  readonly links = [
    { label: "Assistant", path: APP_PATHS.assistant },
    { label: "Settings", path: APP_PATHS.settings },
    { label: "Security", path: APP_PATHS.security },
  ] as const;

  readonly accountOpen = signal(false);
  readonly mobileOpen = signal(false);
  readonly signingOut = signal(false);

  readonly status = computed(() => STATUS[this.voice.state()]);

  /** The status chip only appears once a session is starting or running. */
  readonly showStatus = computed(() => this.voice.state() !== "offline");

  readonly displayName = computed(() => {
    const user = this.auth.user();
    return user?.name ?? user?.email ?? "Signed in";
  });

  readonly initials = computed(() => {
    const source = this.auth.user()?.name ?? this.auth.user()?.email ?? "";
    const parts = source.split(/[\s@._-]+/).filter(Boolean);
    const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2);
    return letters.toUpperCase() || "E";
  });

  toggleAccount(): void {
    this.mobileOpen.set(false);
    this.accountOpen.update((open) => !open);
  }

  toggleMobile(): void {
    this.accountOpen.set(false);
    this.mobileOpen.update((open) => !open);
  }

  closeMenus(): void {
    this.accountOpen.set(false);
    this.mobileOpen.set(false);
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.closeMenus();
    }
  }

  async signOut(): Promise<void> {
    if (this.signingOut()) {
      return;
    }

    this.signingOut.set(true);
    this.voice.disconnect();

    try {
      await this.auth.logout();
    } catch (error) {
      console.error("Sign-out failed:", error);
      this.signingOut.set(false);
    }
  }
}