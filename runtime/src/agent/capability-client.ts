/**
 * HTTP client for the Python capability bridge.
 * Discovers available tools and invokes them via the backend REST API.
 */

import type { RuntimeTokenProvider } from './runtime-token-provider.js';

export interface CapabilityDescriptor {
  capability_id: string;
  kind: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CapabilityResult {
  status: 'completed' | 'failed';
  result: Record<string, unknown>;
  events: Array<{ type: string; message: string }>;
}

export interface CapabilityClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  /** Token provider for the runtime service JWT (enables SSO). */
  tokenProvider?: RuntimeTokenProvider;
  /** User the runtime is acting on behalf of (required when tokenProvider is set). */
  userContext?: { id: string; role: string };
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
}

export class CapabilityClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly tokenProvider?: RuntimeTokenProvider;
  private readonly userContext?: { id: string; role: string };
  private readonly fetchImpl: typeof fetch;

  constructor(options: CapabilityClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.tokenProvider = options.tokenProvider;
    this.userContext = options.userContext;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Build the standard auth headers for a runtime-brokered request.
   * When ``tokenProvider`` is set, attaches ``Authorization`` + user context;
   * otherwise returns an empty record so callers without auth still work.
   */
  private async authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    if (!this.tokenProvider) return { ...extra };
    const token = await this.tokenProvider.currentToken();
    const headers: Record<string, string> = {
      ...extra,
      Authorization: `Bearer ${token}`,
    };
    if (this.userContext?.id) {
      headers['X-Runtime-User-Id'] = this.userContext.id;
      headers['X-Runtime-User-Role'] = this.userContext.role ?? 'student';
    }
    return headers;
  }

  async discover(): Promise<CapabilityDescriptor[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/runtime/capabilities`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: await this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`capability discover failed: ${response.status}`);
    }
    const body = (await response.json()) as { capabilities: CapabilityDescriptor[] };
    return body.capabilities;
  }

  async invoke(capabilityId: string, args: Record<string, unknown>): Promise<CapabilityResult> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/runtime/capabilities/invoke`, {
      method: 'POST',
      headers: await this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ capability_id: capabilityId, arguments: args }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json()) as CapabilityResult;
    return body;
  }
}
