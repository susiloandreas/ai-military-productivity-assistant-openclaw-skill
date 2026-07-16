import { pool } from '../db/connection';
import { GoogleOAuthToken } from '../types';

/** Fields written on an upsert. expiry_date is epoch milliseconds. */
export interface GoogleTokenUpsert {
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expiry_date: number | null;
}

/**
 * Persistence for per-user Google OAuth tokens. The service layer owns the
 * refresh logic; this class only reads and upserts rows.
 */
export class GoogleTokenRepository {
  /** The user's token row, or null if they have never authorized. */
  async get(userId: string): Promise<GoogleOAuthToken | null> {
    const { rows } = await pool.query<GoogleOAuthToken>(
      `SELECT user_id, access_token, refresh_token, scope, token_type,
              expiry_date, created_at, updated_at
         FROM google_oauth_tokens
        WHERE user_id = $1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  /**
   * Upsert the token row. The refresh_token is COALESCE-preserved: Google only
   * returns it on the first offline consent, so a later exchange/refresh that
   * omits it must NOT wipe the stored one. Pass a non-null refresh_token only
   * when Google actually returned a fresh one.
   */
  async upsert(userId: string, t: GoogleTokenUpsert): Promise<void> {
    await pool.query(
      `INSERT INTO google_oauth_tokens
         (user_id, access_token, refresh_token, scope, token_type, expiry_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET access_token  = EXCLUDED.access_token,
                     refresh_token = COALESCE(EXCLUDED.refresh_token, google_oauth_tokens.refresh_token),
                     scope         = EXCLUDED.scope,
                     token_type    = EXCLUDED.token_type,
                     expiry_date   = EXCLUDED.expiry_date,
                     updated_at    = NOW()`,
      [userId, t.access_token, t.refresh_token, t.scope, t.token_type, t.expiry_date]
    );
  }

  /** Persist only a refreshed access token + new expiry (leaves refresh_token intact). */
  async updateAccessToken(userId: string, accessToken: string, expiryDate: number): Promise<void> {
    await pool.query(
      `UPDATE google_oauth_tokens
          SET access_token = $2, expiry_date = $3, updated_at = NOW()
        WHERE user_id = $1`,
      [userId, accessToken, expiryDate]
    );
  }
}
