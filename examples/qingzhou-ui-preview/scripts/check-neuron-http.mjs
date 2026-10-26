#!/usr/bin/env node
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEduFishPlugin, createHttpTransport } from '@edufish/plugin';
import { startFixture } from './orchestrate.mjs';

const fixture = await startFixture();
let plugin;
try {
  const response = await fetch(`${fixture.baseUrl}/__fixture__/token?user_id=fixture-student`, {
    headers: { 'X-Fixture-Handshake': fixture.handshake },
  });
  const token = (await response.json())?.data?.token;
  assert.equal(typeof token, 'string');
  plugin = createEduFishPlugin({ transport: createHttpTransport({
    baseUrl: fixture.baseUrl,
    getAccessToken: () => token,
    timeoutMs: 20000,
  }) });
  const scope = { userId: 'fixture-student', sessionId: randomUUID() };
  const course_id = 'course-fixture-published';
  const invocation = () => ({ scope, requestId: randomUUID() });

  async function complete(output) {
    const deadline = Date.now() + 20000;
    while (!['completed', 'failed'].includes(output.run.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      output = await plugin.invoke('edufish.lab.status', { course_id, run_id: output.run.id }, { scope });
    }
    assert.equal(output.run.status, 'completed', 'The real backend experiment must finish successfully.');
    const payload = output.run.artifacts.find((artifact) => artifact.artifact_type === 'signal_summary')?.data;
    assert(payload, 'The persisted run must contain numerical data.');
    assert.equal(payload.membrane_potential.t_ms.length, payload.membrane_potential.v_mv.length);
    return { output, payload };
  }

  async function run(template_id, params) {
    return complete(await plugin.invoke('edufish.lab.start', { course_id, template_id, params }, invocation()));
  }

  const args = { course_id, template_id: 'exp-hodgkin-huxley', params: { stimulus_current: 10, duration_ms: 120, g_na_scale: 1, g_k_scale: 1 } };
  const trusted = invocation();
  const started = await plugin.invoke('edufish.lab.start', args, trusted);
  const replay = await plugin.invoke('edufish.lab.start', args, trusted);
  assert.equal(replay.run.id, started.run.id, 'Idempotent replay must not launch a second experiment.');
  const baseline = await complete(started);
  assert.equal(baseline.payload.model, 'hodgkin_huxley');
  assert(baseline.payload.total_spikes > 0);
  assert(Math.max(...baseline.payload.membrane_potential.v_mv) > 20);
  assert.equal(baseline.payload.currents.i_na.length, baseline.payload.membrane_potential.t_ms.length);
  assert.equal(baseline.payload.gating.n.length, baseline.payload.membrane_potential.t_ms.length);

  const blocked = await run('exp-hodgkin-huxley', { ...args.params, g_na_scale: 0 });
  assert.equal(blocked.payload.total_spikes, 0);
  assert(blocked.payload.currents.i_na.every((current) => current === 0));
  assert.notDeepEqual(blocked.payload.membrane_potential.v_mv, baseline.payload.membrane_potential.v_mv);

  const longest = await run('exp-hodgkin-huxley', { ...args.params, duration_ms: 300 });
  assert.equal(longest.payload.membrane_potential.t_ms.length, 12001);
  assert.equal(longest.payload.membrane_potential.t_ms.at(-1), 300);
  const low = await run('exp-neuron-spike', { stimulus_current: 2, duration_ms: 120 });
  const high = await run('exp-neuron-spike', { stimulus_current: 8, duration_ms: 120 });
  assert.equal(low.payload.total_spikes, 0);
  assert(high.payload.total_spikes > low.payload.total_spikes);

  console.log('Neuron HTTP acceptance passed: production routes, persisted HH/LIF artifacts, request replay, sodium blockade, maximum-duration response, parameter-dependent output.');
  console.log(JSON.stringify({
    hhSpikes: baseline.payload.total_spikes,
    hhSamples: baseline.payload.membrane_potential.t_ms.length,
    blockedSpikes: blocked.payload.total_spikes,
    longestSamples: longest.payload.membrane_potential.t_ms.length,
    lifLowSpikes: low.payload.total_spikes,
    lifHighSpikes: high.payload.total_spikes,
  }));
} finally {
  plugin?.dispose();
  await fixture.stop();
}
