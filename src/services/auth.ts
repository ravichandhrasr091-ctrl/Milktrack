const TOKEN_STORAGE_KEY = 'milktrack.auth.tokens';
const OAUTH_STATE_KEY = 'milktrack.auth.oauth-state';
const OAUTH_VERIFIER_KEY = 'milktrack.auth.oauth-verifier';

interface AuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
}

interface AuthConfiguration {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
}

let googleSignInCompletion: Promise<AuthUser> | null = null;

function getConfiguration(): AuthConfiguration | null {
  const { VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID } = import.meta.env;
  if (!VITE_COGNITO_DOMAIN || !VITE_COGNITO_CLIENT_ID) return null;

  const redirectUri =
    import.meta.env.VITE_COGNITO_REDIRECT_URI ??
    `${window.location.origin}/auth/callback`;
  const logoutUri =
    import.meta.env.VITE_COGNITO_LOGOUT_URI ?? `${window.location.origin}/`;

  return {
    domain: VITE_COGNITO_DOMAIN.replace(/\/+$/, ''),
    clientId: VITE_COGNITO_CLIENT_ID,
    redirectUri,
    logoutUri,
  };
}

export function isGoogleSignInConfigured(): boolean {
  return getConfiguration() !== null;
}

export async function beginGoogleSignIn(): Promise<void> {
  const configuration = getConfiguration();
  if (!configuration) {
    throw new Error(
      'Google sign-in is not configured yet. Add the Cognito settings to the deployment environment first.',
    );
  }

  const state = createRandomValue();
  const verifier = createRandomValue();
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);
  sessionStorage.setItem(OAUTH_VERIFIER_KEY, verifier);

  const authorizationUrl = new URL(`${configuration.domain}/oauth2/authorize`);
  authorizationUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: configuration.redirectUri,
    identity_provider: 'Google',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  window.location.assign(authorizationUrl.toString());
}

export function completeGoogleSignIn(): Promise<AuthUser> {
  if (googleSignInCompletion) return googleSignInCompletion;

  googleSignInCompletion = completeGoogleSignInRequest().finally(() => {
    googleSignInCompletion = null;
  });
  return googleSignInCompletion;
}

async function completeGoogleSignInRequest(): Promise<AuthUser> {
  const configuration = getConfiguration();
  if (!configuration) throw new Error('Google sign-in is not configured.');

  const currentUrl = new URL(window.location.href);
  const returnedState = currentUrl.searchParams.get('state');
  const savedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(OAUTH_VERIFIER_KEY);
  const code = currentUrl.searchParams.get('code');

  sessionStorage.removeItem(OAUTH_STATE_KEY);
  sessionStorage.removeItem(OAUTH_VERIFIER_KEY);

  if (!returnedState || !savedState || returnedState !== savedState || !verifier) {
    throw new Error(
      'Google sign-in could not be verified. Please start the sign-in process again.',
    );
  }
  if (!code) {
    const error = currentUrl.searchParams.get('error_description');
    throw new Error(
      error
        ? `Google sign-in was not completed: ${error}`
        : 'Google sign-in returned no authorization code.',
    );
  }

  const response = await fetch(`${configuration.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: configuration.clientId,
      code,
      redirect_uri: configuration.redirectUri,
      code_verifier: verifier,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(getOAuthError(payload));
  }

  const tokens = parseTokenResponse(payload);
  saveTokens(tokens);
  return getUserFromIdToken(tokens.idToken);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  const usableTokens =
    tokens.expiresAt > Date.now() + 60_000
      ? tokens
      : await refreshTokens(tokens);
  return getUserFromIdToken(usableTokens.idToken);
}

export async function getIdToken(): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new Error('Sign in to MilkTrack to continue.');
  const usableTokens =
    tokens.expiresAt > Date.now() + 60_000
      ? tokens
      : await refreshTokens(tokens);
  return usableTokens.idToken;
}

export function clearLocalSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function signOut(): void {
  clearLocalSession();
  const configuration = getConfiguration();
  if (!configuration) {
    window.location.assign(import.meta.env.BASE_URL);
    return;
  }

  const logoutUrl = new URL(`${configuration.domain}/logout`);
  logoutUrl.search = new URLSearchParams({
    client_id: configuration.clientId,
    logout_uri: configuration.logoutUri,
  }).toString();
  window.location.assign(logoutUrl.toString());
}

function readTokens(): AuthTokens | null {
  const value = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!value) return null;
  try {
    return parseStoredTokens(JSON.parse(value));
  } catch {
    clearLocalSession();
    return null;
  }
}

function parseStoredTokens(value: unknown): AuthTokens {
  const refreshToken =
    typeof value === 'object' && value !== null && 'refreshToken' in value
      ? value.refreshToken
      : undefined;

  if (
    typeof value !== 'object' ||
    value === null ||
    !('idToken' in value) ||
    typeof value.idToken !== 'string' ||
    !('accessToken' in value) ||
    typeof value.accessToken !== 'string' ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    (refreshToken !== undefined && typeof refreshToken !== 'string')
  ) {
    throw new Error('Stored sign-in tokens are invalid.');
  }

  return {
    idToken: value.idToken,
    accessToken: value.accessToken,
    ...(typeof refreshToken === 'string'
      ? { refreshToken }
      : {}),
    expiresAt: value.expiresAt,
  };
}

function saveTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

async function refreshTokens(tokens: AuthTokens): Promise<AuthTokens> {
  const configuration = getConfiguration();
  if (!configuration || !tokens.refreshToken) {
    clearLocalSession();
    throw new Error('Your sign-in expired. Sign in to MilkTrack again.');
  }

  const response = await fetch(`${configuration.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: configuration.clientId,
      refresh_token: tokens.refreshToken,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    clearLocalSession();
    throw new Error(getOAuthError(payload));
  }

  const refreshed = parseTokenResponse(payload, tokens.refreshToken);
  saveTokens(refreshed);
  return refreshed;
}

function parseTokenResponse(value: unknown, existingRefreshToken?: string): AuthTokens {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id_token' in value) ||
    typeof value.id_token !== 'string' ||
    !('access_token' in value) ||
    typeof value.access_token !== 'string' ||
    !('expires_in' in value) ||
    typeof value.expires_in !== 'number'
  ) {
    throw new Error('Cognito returned an invalid sign-in response.');
  }

  const refreshToken =
    'refresh_token' in value && typeof value.refresh_token === 'string'
      ? value.refresh_token
      : existingRefreshToken;

  return {
    idToken: value.id_token,
    accessToken: value.access_token,
    ...(refreshToken ? { refreshToken } : {}),
    expiresAt: Date.now() + value.expires_in * 1000,
  };
}

function getUserFromIdToken(idToken: string): AuthUser {
  const segments = idToken.split('.');
  if (segments.length !== 3) throw new Error('Cognito returned an invalid ID token.');
  const payload = JSON.parse(decodeBase64Url(segments[1])) as Record<string, unknown>;
  if (typeof payload.sub !== 'string') {
    throw new Error('Cognito ID token is missing the user identifier.');
  }
  return {
    sub: payload.sub,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
  };
}

function getOAuthError(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error_description' in value &&
    typeof value.error_description === 'string'
  ) {
    return value.error_description;
  }
  return 'Google sign-in failed. Check the Cognito and Google OAuth configuration.';
}

function createRandomValue(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return atob(padded);
}
