#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { withServers, PREVIEW_DIR } from './orchestrate.mjs';

const argIndex = process.argv.indexOf('--browser-executable');
const executablePath = argIndex >= 0 ? process.argv[argIndex + 1] : process.env.EDUFISH_BROWSER_EXECUTABLE;
const output = join(PREVIEW_DIR, 'output', 'playwright');
await mkdir(output, { recursive: true });

await withServers(async ({ vite }) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const writes = [];
  const payloads = new Map();
  const assets = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (request.url().includes('/neurolab/niivue/')) assets.push(request.url());
    if (!request.url().includes('/api/v1/plugin/invoke') || request.method() !== 'POST') return;
    const body = request.postDataJSON();
    if (body.operation === 'edufish.lab.start') writes.push(body);
  });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/plugin/invoke')) return;
    try {
      const run = (await response.json())?.data?.run;
      if (run?.status !== 'completed') return;
      const data = run.artifacts.find((artifact) => artifact.artifact_type === 'signal_summary')?.data;
      if (data) payloads.set(run.id, data);
    } catch { /* Ignore a response cancelled while leaving the view. */ }
  });

  async function settle() { await page.waitForTimeout(600); }
  async function runSimulation() {
    const previous = writes.length;
    const responsePromise = page.waitForResponse((response) => {
      if (!response.url().includes('/api/v1/plugin/invoke')) return false;
      return response.request().postDataJSON()?.operation === 'edufish.lab.start';
    });
    await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
    const response = await responsePromise;
    assert(response.ok(), `Simulation returned HTTP ${response.status()}`);
    const body = await response.json();
    assert(body.success, 'Simulation returned an error envelope.');
    const runId = body.data.run.id;
    await page.waitForFunction((id) => document.body.textContent.includes(id), runId, { timeout: 30000 });
    const deadline = Date.now() + 30000;
    while (!payloads.has(runId) && Date.now() < deadline) await page.waitForTimeout(100);
    assert(payloads.has(runId), 'No completed numerical artifact reached the UI.');
    assert.equal(writes.length, previous + 1, 'One explicit click must create one write request.');
    await page.getByRole('img', { name: /Membrane potential over time/ }).locator('svg').waitFor({ state: 'visible', timeout: 30000 });
    return payloads.get(runId);
  }

  try {
    await page.goto(vite.url, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('neuron-workbench').waitFor({ state: 'visible', timeout: 60000 });
    await settle();
    assert.equal(writes.length, 0, 'Initial mount must not run an experiment.');
    assert.equal(assets.length, 0, 'Anatomical assets should not load before opening their tab.');

    // Switch the shared host locale; this is also an explicit keyboard check.
    await page.getByTestId('language-select').click();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Run simulation', exact: true }).waitFor({ state: 'visible' });
    const baseline = await runSimulation();
    assert.equal(baseline.model, 'hodgkin_huxley');
    assert(baseline.total_spikes > 0);
    assert.equal(await page.getByTestId('neuron-workbench').locator('figure svg').count(), 3, 'Render voltage, current and gate charts.');
    await settle();
    await page.screenshot({ path: join(output, 'laboratory-light.png'), fullPage: true });

    const sodiumScale = page.getByRole('spinbutton', { name: 'Na⁺ conductance scale', exact: true });
    await sodiumScale.fill('0');
    await sodiumScale.press('Tab');
    await page.getByText('Edited — not yet run', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(writes.length, 1, 'Editing model parameters must not submit.');
    const blocked = await runSimulation();
    assert.equal(blocked.total_spikes, 0);
    assert(blocked.currents.i_na.every((value) => value === 0));
    assert.notDeepEqual(blocked.membrane_potential.v_mv, baseline.membrane_potential.v_mv);

    // Verify that JS-rendered chart text follows the host appearance too.
    const axisText = page.getByRole('img', { name: /Membrane potential over time/ }).locator('svg text').first();
    const lightText = await axisText.getAttribute('fill');
    await page.getByTestId('theme-mode').getByText('Dark', { exact: true }).click();
    await page.waitForFunction((previous) => {
      const text = document.querySelector('[role="img"][aria-label^="Membrane potential"] svg text');
      return text && text.getAttribute('fill') !== previous;
    }, lightText, { timeout: 15000 });
    await settle();
    await page.screenshot({ path: join(output, 'laboratory-dark.png'), fullPage: true });
    assert.equal(writes.length, 2, 'Theme changes must not run the model.');

    await page.setViewportSize({ width: 390, height: 844 });
    await settle();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `Laboratory narrow layout overflows by ${overflow}px.`);
    await page.screenshot({ path: join(output, 'laboratory-narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.getByRole('tab', { name: 'Brain anatomy · 3D / MRI', exact: true }).click();
    const reset = page.getByRole('button', { name: 'Reset view', exact: true });
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Reset view"]');
      return button && !button.disabled;
    }, undefined, { timeout: 60000 });
    assert.equal(assets.filter((url) => url.endsWith('.nii.gz')).length, 0, 'MRI must load only on explicit selection.');
    assert(assets.filter((url) => url.endsWith('.mz3')).length >= 2, 'Both real hemisphere meshes must load.');
    const canvas = page.getByRole('img', { name: 'Interactive 3D brain anatomy canvas' });
    assert(await canvas.evaluate((el) => el.width > 0 && el.height > 0 && !!el.getContext('webgl2')), 'NiiVue must use a real WebGL2 canvas.');
    await settle();
    const beforeRotation = await canvas.screenshot();
    await page.getByRole('button', { name: 'Rotate left', exact: true }).click();
    await settle();
    assert(!beforeRotation.equals(await canvas.screenshot()), 'Rotating the surface must visibly change the rendered anatomy.');
    await reset.click();
    await settle();
    await page.screenshot({ path: join(output, 'brain-surface.png'), fullPage: true });
    await page.getByText('MRI slices', { exact: true }).click();
    await page.getByText(/Showing the MRI volume in multiplanar view/).waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(assets.filter((url) => url.endsWith('.nii.gz')).length, 1, 'MRI is fetched once after selection.');
    await settle();
    await page.screenshot({ path: join(output, 'brain-mri.png'), fullPage: true });
    assert.equal(writes.length, 2, 'Exploring anatomy must not create simulation runs.');

    // Unmount/replay: real GPU view and charts must clean up without errors.
    await page.getByRole('tab', { name: 'Electrophysiology', exact: true }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('neuron-workbench').waitFor({ state: 'visible', timeout: 30000 });
    await settle();
    assert.equal(writes.length, 2, 'Reload must not replay simulation writes.');
    assert.equal(errors.length, 0, `Browser errors:\n${errors.join('\n')}`);
    console.log('Lab browser acceptance passed: explicit real HH runs, parameter-dependent voltage and sodium blockade, three SVG scientific charts, host dark theme, 390px layout, real NiiVue mesh rotation, on-demand MRI, no mount/replay writes or console errors.');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    await page.screenshot({ path: join(output, 'lab-failure.png'), fullPage: true }).catch(() => {});
    console.error(`Lab browser acceptance failed: ${error.stack || error}`);
    console.error(`Console errors: ${JSON.stringify(errors)}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
});
