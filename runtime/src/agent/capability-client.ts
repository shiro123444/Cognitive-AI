/**
 * HTTP client for the Python capability bridge.
 * Discovers available tools and invokes them via the backend REST API.
 */

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
}

export class CapabilityClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: CapabilityClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async discover(): Promise<CapabilityDescriptor[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/runtime/capabilities`, {
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`capability discover failed: ${response.status}`);
    }
    const body = (await response.json()) as { capabilities: CapabilityDescriptor[] };
    return body.capabilities;
  }

  async invoke(capabilityId: string, args: Record<string, unknown>): Promise<CapabilityResult> {
    const response = await fetch(`${this.baseUrl}/api/v1/runtime/capabilities/invoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability_id: capabilityId, arguments: args }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json()) as CapabilityResult;
    return body;
  }
}
