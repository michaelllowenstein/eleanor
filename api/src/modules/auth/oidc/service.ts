import * as oidc from "openid-client";

import type {
  EleanorUser,
  OidcTransaction,
} from "../session/types.js";

export interface OidcServiceConfig {
  readonly issuer: string;

  readonly clientId: string;

  readonly clientSecret: string;

  readonly publicApiOrigin: string;

  readonly publicAppOrigin: string;
}

export interface CompletedAuthentication {
  readonly user: EleanorUser;

  readonly idTokenHint?: string;
}

/** The subset of OidcService the routes depend on (replaceable in tests). */
export interface OidcClient {
  begin(
    returnTo: string,
    options?: { readonly forceReauthentication?: boolean },
  ): Promise<{ readonly transaction: OidcTransaction; readonly authorizationUrl: URL }>;
  complete(callbackUrl: URL, transaction: OidcTransaction): Promise<CompletedAuthentication>;
  logoutUrl(idTokenHint?: string): string | null;
}

export class OidcService implements OidcClient {
  private constructor(
    private readonly configuration: oidc.Configuration,

    private readonly config: OidcServiceConfig,
  ) {}

  static async create(config: OidcServiceConfig): Promise<OidcService> {
    const issuer = new URL(config.issuer);
    const insecure = issuer.protocol === "http:";

    if (insecure && process.env.NODE_ENV === "production") {
      throw new Error("OIDC_ISSUER must use HTTPS in production.");
    }

    const configuration = await oidc.discovery(
      issuer,
      config.clientId,
      config.clientSecret,
      undefined,
      insecure ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );

    return new OidcService(configuration, config);
  }

  async begin(
    returnTo: string,
    options: { readonly forceReauthentication?: boolean } = {},
  ): Promise<{
    readonly transaction: OidcTransaction;

    readonly authorizationUrl: URL;
  }> {
    const codeVerifier = oidc.randomPKCECodeVerifier();

    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const state = oidc.randomState();

    const nonce = oidc.randomNonce();

    const transaction: OidcTransaction = {
      codeVerifier,
      state,
      nonce,

      returnTo: sanitizeReturnTo(returnTo),

      createdAt: Date.now(),
    };

    const authorizationUrl = oidc.buildAuthorizationUrl(this.configuration, {
      redirect_uri: this.callbackUrl(),

      scope: "openid profile email",

      code_challenge: codeChallenge,

      code_challenge_method: "S256",

      state,

      nonce,

      // Used when the server needs a *fresh* identity-provider login, e.g.
      // first-passkey enrolment after PASSKEY_ENROLLMENT_MAX_OIDC_AGE_SECONDS.
      ...(options.forceReauthentication
        ? { prompt: "login", max_age: "0" }
        : {}),
    });

    return {
      transaction,
      authorizationUrl,
    };
  }

  async complete(
    callbackUrl: URL,

    transaction: OidcTransaction,
  ): Promise<CompletedAuthentication> {
    if (Date.now() - transaction.createdAt > 10 * 60 * 1000) {
      throw new Error("Authentication transaction expired.");
    }

    const tokens = await oidc.authorizationCodeGrant(
      this.configuration,

      callbackUrl,

      {
        pkceCodeVerifier: transaction.codeVerifier,

        expectedState: transaction.state,

        expectedNonce: transaction.nonce,

        idTokenExpected: true,
      },
    );

    const claims = tokens.claims();

    if (!claims?.sub) {
      throw new Error("OIDC provider did not return a subject identifier.");
    }

    return {
      user: {
        id: claims.sub,

        name: optionalString(claims.name),

        email: optionalString(claims.email),

        picture: optionalString(claims.picture),
      },

      idTokenHint: tokens.id_token,
    };
  }

  logoutUrl(idTokenHint?: string): string | null {
    try {
      const parameters: Record<string, string> = {
        post_logout_redirect_uri: this.config.publicAppOrigin,
      };

      if (idTokenHint) {
        parameters.id_token_hint = idTokenHint;
      }

      return oidc.buildEndSessionUrl(this.configuration, parameters).href;
    } catch {
      return null;
    }
  }

  callbackUrl(): string {
    return new URL("/api/auth/callback", this.config.publicApiOrigin).href;
  }
}

function sanitizeReturnTo(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/assistant";
  }

  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
