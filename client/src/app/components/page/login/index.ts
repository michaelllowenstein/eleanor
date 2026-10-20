import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from "@angular/core";

import {
  ActivatedRoute,
  Router,
  RouterLink,
} from "@angular/router";

import { AuthService } from "../../../core/services/auth";

@Component({
  selector: "app-login",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: "block min-h-screen"
  },
  templateUrl: './index.html'
})
export class LoginPage implements OnInit {
  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.auth.ensureLoaded();

    if (this.auth.authenticated()) {
      await this.router.navigateByUrl(this.returnUrl());
    }
  }

  login(): void {
    this.auth.login(this.returnUrl());
  }

  private returnUrl(): string {
    const value =
      this.route.snapshot.queryParamMap.get("returnUrl");

    return (
      value?.startsWith("/") &&
      !value.startsWith("//")
    )
      ? value
      : "/assistant";
  }
}
