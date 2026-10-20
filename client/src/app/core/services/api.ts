import { Injectable } from "@angular/core";
import { AuthService } from "./auth";

@Injectable({
  providedIn: "root",
})
export class ProfileApiService {
  constructor(
    private readonly auth: AuthService,
  ) {}

  async load(): Promise<string | null> {
    const response = await fetch("/api/assistant-profile", {
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(
        `Unable to load profile (${response.status}).`,
      );
    }

    const payload = (await response.json()) as {
      readonly profile: {
        readonly metric: string;
      } | null;
    };

    return payload.profile?.metric ?? null;
  }

  async save(metric: number): Promise<void> {
    const response = await fetch("/api/assistant-profile", {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...this.auth.csrfHeaders(),
      },
      body: JSON.stringify({
        metric: String(metric),
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Unable to save profile (${response.status}).`,
      );
    }
  }
}
