export interface EleanorUser {
  readonly id: string;
  readonly name?: string;
  readonly email?: string;
  readonly picture?: string;
}

export interface OidcTransaction {
  readonly codeVerifier: string;
  readonly state: string;
  readonly nonce: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

export interface WebAuthnCeremony {
  readonly type: "registration" | "authentication";
  readonly challenge: string;
  readonly createdAt: number;
}

export interface EleanorSession {
  readonly csrfToken: string;
  readonly createdAt: number;
  readonly authenticatedAt?: number;
  readonly user?: EleanorUser;
  readonly oidc?: OidcTransaction;
  readonly idTokenHint?: string;
  readonly webauthn?: WebAuthnCeremony;
  readonly stepUpVerifiedAt?: number;
  readonly stepUpCredentialId?: string;
}

export interface SessionContext {
  readonly id: string;
  readonly data: EleanorSession;
}
