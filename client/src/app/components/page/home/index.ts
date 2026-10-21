import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from "@angular/core";

import {
  RouterLink,
} from "@angular/router";

import { APP_PATHS } from "../../../core/schema/constants";

import {
  RealtimeVoiceService,
} from "../../../core/services/realtime";

import {
  VoiceOrbIsland,
} from "../../feature/orb";

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    RouterLink,
    VoiceOrbIsland
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "flex flex-1 flex-col"
  },
  templateUrl: './index.html'
})
export class HomePage {
  readonly voice =
    inject(RealtimeVoiceService);

  readonly paths = APP_PATHS;

  readonly stateLabel = () => {
    switch (this.voice.state()) {
      case "offline":
        return "Assistant offline";

      case "connecting":
        return "Connecting";

      case "listening":
        return "Listening";

      case "thinking":
        return "Thinking";

      case "speaking":
        return "Speaking";

      case "error":
        return "Connection error";
    }
  };

  async start(): Promise<void> {
    await this.voice.connect();
  }

  stop(): void {
    this.voice.disconnect();
  }
}