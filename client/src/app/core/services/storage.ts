import {
  isPlatformBrowser,
} from "@angular/common";

import {
  Injectable,
  PLATFORM_ID,
  inject,
} from "@angular/core";

import type {
  AssistantProfile,
  AssistantSettings,
  PersistedAssistantProfiles,
} from "../schema/models/settings";

const STORAGE_KEY =
  "eleanor.assistant-profiles.v1";

@Injectable({
  providedIn: "root"
})
export class AssistantProfileStorageService {
  private readonly platformId =
    inject(PLATFORM_ID);

  load(): PersistedAssistantProfiles | null {
    if (!isPlatformBrowser(this.platformId)) {
      return null;
    }

    try {
      const value =
        localStorage.getItem(STORAGE_KEY);

      if (!value) {
        return null;
      }

      const parsed: unknown =
        JSON.parse(value);

      return this.isPersistedProfiles(parsed)
        ? parsed
        : null;
    } catch (error) {
      console.warn(
        "Unable to load assistant profiles:",
        error,
      );

      return null;
    }
  }

  save(
    state: PersistedAssistantProfiles,
  ): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch (error) {
      console.error(
        "Unable to persist assistant profiles:",
        error,
      );
    }
  }

  clear(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
  }

  private isPersistedProfiles(
    value: unknown,
  ): value is PersistedAssistantProfiles {
    if (!this.isRecord(value)) {
      return false;
    }

    if (
      value["version"] !== 1 ||
      typeof value["activeProfileId"] !== "string" ||
      !Array.isArray(value["profiles"])
    ) {
      return false;
    }

    if (value["profiles"].length === 0) {
      return false;
    }

    const profilesValid =
      value["profiles"].every(
        (profile) =>
          this.isAssistantProfile(profile),
      );

    if (!profilesValid) {
      return false;
    }

    return value["profiles"].some(
      (profile) =>
        this.isRecord(profile) &&
        profile["id"] ===
          value["activeProfileId"],
    );
  }

  private isAssistantProfile(
    value: unknown,
  ): value is AssistantProfile {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value["id"] === "string" &&
      typeof value["name"] === "string" &&
      typeof value["createdAt"] === "string" &&
      typeof value["updatedAt"] === "string" &&
      this.isAssistantSettings(
        value["settings"],
      )
    );
  }

  private isAssistantSettings(
    value: unknown,
  ): value is AssistantSettings {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value["personality"] === "string" &&
      typeof value["verbosity"] === "string" &&
      typeof value["formality"] === "string" &&
      typeof value["initiative"] === "string" &&
      typeof value["turnTaking"] === "string" &&
      typeof value["humor"] === "number" &&
      typeof value["speechSpeed"] === "number" &&
      typeof value["voice"] === "string"
    );
  }

  private isRecord(
    value: unknown,
  ): value is Record<string, unknown> {
    return (
      typeof value === "object" &&
      value !== null
    );
  }
}
