import https from 'https';

/**
 * Minimal Google OAuth 2.0 client for the authorization-code flow — raw https,
 * no SDK, mirroring utils/gemini.ts and utils/telegram.ts. Covers exactly the
 * three moves the Calendar integration needs: build the consent URL, exchange an
 * authorization code for tokens, and refresh an expired access token. Requires
 * GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI.
 */

/** Default scope: create/read/update/delete Calendar events (least privilege for
 *  syncing missions & habits). Override via GOOGLE_OAUTH_SCOPES (space-separated). */
export const DEFAULT_SCOPES = 'https://www.googleapis.com/auth/calendar.events';

const AUTH_HOST = 'accounts.google.com';
const AUTH_PATH = '/o/oauth2/v2/auth';
const TOKEN_HOST = 'oauth2.googleapis.com';
const TOKEN_PATH = '/token';

/** The subset of Google's token response we care about. */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number; // seconds until the access token expires
  refresh_token?: string; // only present on the first offline consent
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

/** Read + validate the OAuth config from the environment. Throws if incomplete. */
export function loadGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI must be set'
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env.GOOGLE_OAUTH_SCOPES ?? DEFAULT_SCOPES,
  };
}

/**
 * Build the Google consent URL to redirect the user to. `access_type=offline`
 * + `prompt=consent` are what make Google return a refresh_token (and re-issue
 * one even if the user has consented before). `state` is echoed back to the
 * callback — use it to carry/verify which user is authorizing.
 */
export function buildConsentUrl(cfg: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scopes,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://${AUTH_HOST}${AUTH_PATH}?${params.toString()}`;
}

/** POST an x-www-form-urlencoded body to Google's token endpoint. */
function postToken(form: Record<string, string>): Promise<GoogleTokenResponse> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(form).toString();
    const options: https.RequestOptions = {
      hostname: TOKEN_HOST,
      path: TOKEN_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`Google token endpoint error: HTTP ${status} ${data.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data) as GoogleTokenResponse);
        } catch (err) {
          reject(new Error(`Google token parse error: ${(err as Error).message}`));
        }
      });
    });

    req.setTimeout(30000, () => req.destroy(new Error('Google token request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Exchange the authorization code from the callback for access + refresh tokens. */
export function exchangeCodeForTokens(cfg: GoogleOAuthConfig, code: string): Promise<GoogleTokenResponse> {
  return postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  });
}

/**
 * Mint a fresh access token from a stored refresh token. Google does NOT return
 * a new refresh_token here — the caller keeps the existing one.
 */
export function refreshAccessToken(cfg: GoogleOAuthConfig, refreshToken: string): Promise<GoogleTokenResponse> {
  return postToken({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  });
}
