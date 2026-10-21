import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";

import { env } from "../../../../envs/env";
import { APP_PATHS } from "../../../core/schema/constants";
import { AuthService } from "../../../core/services/auth";
import { PlatformService } from "../../../core/services/platform";

@Component({
  selector: "app-footer",
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block",
  },
  templateUrl: "./index.html",
})
export class Footer {
  readonly auth = inject(AuthService);
  readonly platform = inject(PlatformService);

  readonly paths = APP_PATHS;
  readonly year = new Date().getFullYear();

  /** Shown so nobody mistakes a mock session for a real one. */
  readonly mockTransport = env.realtimeTransport === "mock";
}