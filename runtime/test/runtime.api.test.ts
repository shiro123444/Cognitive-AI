import { describe, expect, it } from 'vitest';

import { buildServer } from '../src/server.js';

describe('runtime api', () => {
  it('creates a session through the HTTP API', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'POST',
      url: '/runtime/sessions',
      payload: {
        protocol_version: 'v1alpha1',
        session_id: 'session-http-1',
        participants: ['user:ada'],
        branch_heads: { main: 'entry-1' },
        policy_refs: [],
        shared_resource_refs: [],
        audit_settings: { enabled: true }
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().session_id).toBe('session-http-1');
  });

  it('lists runtime events since a sequence number', async () => {
    const app = buildServer();
    const response = await app.inject({
      method: 'GET',
      url: '/runtime/events/session-http-1?last_seen_seq=5'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      session_id: 'session-http-1',
      last_seen_seq: 5,
      events: []
    });
  });
});
