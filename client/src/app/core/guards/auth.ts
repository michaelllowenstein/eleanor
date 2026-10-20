
import { inject } from "@angular/core";
import type { CanActivateFn } from "@angular/router";
import { Router } from "@angular/router";

import { AuthService } from "../services/auth";

export const authGuard: CanActivateFn = async (
  _route,
  state,
) => {
  const auth: AuthService = inject(AuthService);
  const router: Router = inject(Router);

  await auth.ensureLoaded();

  return auth.authenticated()
    ? true
    : router.createUrlTree(
        ["/login"],
        {
          queryParams: {
            returnUrl: state.url,
          },
        },
      );
};