/**
 * RuntimeTokenProvider — mints + caches a JWT for the Node Runtime's service
 * account on the backend.
 *
 * On first call to ``currentToken()`` (or when the cached token is within
 * 60s of expiry), the provider POSTs to ``/runtime/sessions/runtime-token``
 * and stores the result. The request is signed with the shared engine key
 * (``ENGINE_API_KEY`` / ``config.engineApiKey``) when one is configured;
 * in dev/test the endpoint accepts the request with no auth.
 *
 * All capability calls then carry ``Authorization: Bearer <token>`` plus the
 * ``X-Runtime-User-Id`` / ``X-Runtime-User-Role`` headers so the backend
 * can attribute the work to the originating user.
 */

export interface RuntimeTokenProviderOptions {
  backendBaseUrl: string;
  /** Shared engine key sent as X-API-Key when minting. Optional in dev. */
  engineApiKey?: string;
  /** Refresh this many ms before expiry. Default 60_000. */
  refreshLeadMs?: number;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
  /** Override clock for tests. */
  now?: () => number;
}

export interface CachedToken {
  token: string;
  expiresAt: number;
}

interface MintResponse {
  success: boolean;
  data?: {
    token: string;
    expires_at: number;
    role: string;
    ttl_hours: number;
  };
  error?: { code?: string; message?: string };
}

export class RuntimeTokenProvider {
  private cache: CachedToken | null = null;
  private inflight: Promise<CachedToken> | null = null;
  private readonly baseUrl: string;
  private readonly engineApiKey: string;
  private readonly refreshLeadMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: RuntimeTokenProviderOptions) {
    this.baseUrl = options.backendBaseUrl.replace(/\/$/, '');
    this.engineApiKey = options.engineApiKey ?? '';
    this.refreshLeadMs = options.refreshLeadMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
  }

  /** Whether the cached token is still valid for at least refreshLeadMs more. */
  isFresh(): boolean {
    if (!this.cache) return false;
    return this.cache.expiresAt - this.now() > this.refreshLeadMs;
  }

  /**
   * Return a valid bearer token, minting a fresh one if needed. Multiple
   * concurrent callers share a single in-flight mint request.
   */
  async currentToken(): Promise<string> {
    if (this.isFresh() && this.cache) return this.cache.token;
    if (this.inflight) {
      const next = await this.inflight;
      return next.token;
    }
    this.inflight = this.mint().finally(() => {
      this.inflight = null;
    });
    const token = await this.inflight;
    return token.token;
  }

  /** Forget the cached token. Useful in tests or after a 401 from the backend. */
  invalidate(): void {
    this.cache = null;
  }

  private async mint(): Promise<CachedToken> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.engineApiKey) headers['X-API-Key'] = this.engineApiKey;

    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/runtime/sessions/runtime-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(
        `runtime token mint failed: ${response.status} ${await response.text().catch(() => '')}`,
      );
    }
    const body = (await response.json()) as MintResponse;
    if (!body.success || !body.data?.token) {
      throw new Error(`runtime token mint returned no token: ${body.error?.message ?? 'unknown'}`);
    }
    const cached: CachedToken = {
      token: body.data.token,
      expiresAt: body.data.expires_at * 1000,
    };
    this.cache = cached;
    return cached;
  }
}
