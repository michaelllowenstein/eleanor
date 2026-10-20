import { Injectable, computed, signal } from "@angular/core";
import type { EleanorUser } from "../schema/models/auth";

@Injectable({
    providedIn: "root"
})
export class AuthService {
  readonly state = signal<
    "loading" | "anonymous" | "authenticated"
  >("loading");

  readonly user = signal<EleanorUser | null>(null);

  readonly authenticated = computed(
    () => this.state() === "authenticated",
  );

  private readonly csrfToken = signal<string | null>(null);
  private loadingPromise: Promise<void> | null = null;

  ensureLoaded(): Promise<void> {
    if (this.state() !== "loading") {
      return Promise.resolve();
    }

    this.loadingPromise ??= this.load();
    return this.loadingPromise;
  }

  login(returnTo = "/assistant"): void {
    window.location.assign(
      `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
  }

  async logout(): Promise<void> {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: this.csrfHeaders(),
    });

    if (!response.ok) {
      throw new Error("Unable to sign out.");
    }

    const payload = (await response.json()) as {
      readonly logoutUrl: string;
    };

    this.user.set(null);
    this.csrfToken.set(null);
    this.state.set("anonymous");
    window.location.assign(payload.logoutUrl);
  }

  csrfHeaders(): Record<string, string> {
    const token = this.csrfToken();

    if (!token) {
      throw new Error("CSRF token is unavailable.");
    }

    return {
      "X-CSRF-Token": token,
    };
  }

  private async load(): Promise<void> {
    try {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(
          `Unable to load auth state (${response.status}).`,
        );
      }

      const session = (await response.json()) as {
        readonly authenticated: boolean;
        readonly user: EleanorUser | null;
        readonly csrfToken: string;
      };

      this.user.set(session.user);
      this.csrfToken.set(session.csrfToken);
      this.state.set(
        session.authenticated
          ? "authenticated"
          : "anonymous",
      );
    } catch (error) {
      console.error("Authentication bootstrap failed:", error);
      this.state.set("anonymous");
    }
  }
}