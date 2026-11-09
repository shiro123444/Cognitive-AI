#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { PREVIEW_DIR, withServers } from './orchestrate.mjs';

const argIndex = process.argv.indexOf('--browser-executable');
const executablePath = argIndex >= 0 ? process.argv[argIndex + 1] : process.env.EDUFISH_BROWSER_EXECUTABLE;
const output = join(PREVIEW_DIR, 'output', 'playwright');
await mkdir(output, { recursive: true });

await withServers(async ({ vite }) => {
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/v1/plugin/invoke')) requests.push(request.postDataJSON());
  });

  async function invokeByClick(operation, locator) {
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/v1/plugin/invoke') && response.request().postDataJSON()?.operation === operation,
    );
    await locator.click();
    const response = await responsePromise;
    assert(response.ok(), `${operation} returned HTTP ${response.status()}`);
    const envelope = await response.json();
    assert(envelope.success, `${operation} returned an error envelope`);
    return envelope.data;
  }

  try {
    await page.goto(`${vite.url}/?view=validation`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('transport-mode').getByText('Actual HTTP (loopback fixture)', { exact: true }).click();
    await page.getByTestId('actual-panel').waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(500);
    assert.equal(requests.length, 0, 'Mounting actual mode must not issue operations');

    const graph = await invokeByClick('edufish.graph.neighborhood', page.getByTestId('actual-read-graph'));
    const graphCard = page.getByTestId('actual-graph-card');
    await graphCard.getByRole('button', { name: 'Neural Networks', exact: true }).click();
    await graphCard.getByRole('button', { name: 'Open activity: Explore neuron simulation', exact: true }).click();
    await graphCard.getByRole('button', { name: 'Open experiment: Neuron Spike Lab', exact: true }).click();
    const launcher = page.getByTestId('actual-graph-lab-card');
    await launcher.waitFor({ state: 'visible' });
    assert.equal(requests.length, 1, 'Graph navigation must not start an experiment');
    const intent = JSON.parse(await page.getByTestId('actual-host-action').innerText());
    assert.equal(intent.kind, 'experiment');
    assert.deepEqual(intent.payload.origin, { messageId: 'preview-graph-message', toolCallId: 'preview-graph-tool' });
    const expectedContext = {
      chapter_id: 'chapter-fixture-lab',
      activity_id: 'activity-fixture-neuron',
      concept_id: 'concept-neural-networks',
      graph_snapshot_id: graph.context.snapshot_id,
    };
    assert.deepEqual(JSON.parse(await page.getByTestId('actual-lab-learning-context').innerText()), expectedContext);

    const started = await invokeByClick('edufish.lab.start', launcher.getByRole('button', { name: 'Start experiment', exact: true }));
    assert.equal(started.run.status, 'completed');
    assert(started.run.artifacts.length > 0 && started.run.report, 'Real experiment artifacts and report must persist');
    assert.deepEqual(started.learning_context, { version: 1, course_id: 'course-fixture-published', ...expectedContext });
    const writes = requests.filter((request) => request.operation === 'edufish.lab.start');
    assert.equal(writes.length, 1, 'One explicit click must issue exactly one start');
    assert.deepEqual(writes[0].arguments.learning_context, expectedContext);
    assert(!('origin' in writes[0].arguments.learning_context), 'Host message provenance must not become model arguments');
    assert(!('learning_context' in started.run.params), 'Calculation params must remain separate');
    await launcher.getByText('completed', { exact: true }).waitFor({ state: 'visible' });
    await launcher.screenshot({ path: join(output, 'learning-context-run.png') });

    const status = await invokeByClick('edufish.lab.status', page.getByTestId('actual-lab-status'));
    assert.deepEqual(status.learning_context, started.learning_context);
    assert.equal(requests.at(-1).arguments.include_context, true);
    const progress = await invokeByClick('edufish.progress.read', page.getByTestId('actual-read-progress'));
    assert.equal(progress.event_counts.ran_lab, 1);
    assert.equal(progress.event_counts.completed ?? 0, 0, 'Successful simulation must not complete a chapter/activity');
    assert.equal(progress.lab_evidence.runs.length, 1);
    const evidence = progress.lab_evidence.runs[0];
    assert.equal(evidence.run_id, started.run.id);
    assert.equal(evidence.status, 'completed');
    assert.deepEqual(evidence.learning_context, started.learning_context);
    assert.equal(evidence.artifact_count, started.run.artifacts.length);
    assert.equal(evidence.report_id, started.run.report.id);
    const progressCard = page.getByTestId('actual-progress-card');
    await progressCard.getByRole('heading', { name: 'Completed experiment evidence', exact: true }).waitFor({ state: 'visible' });
    await progressCard.getByText(/proof of mastery/).waitFor({ state: 'visible' });
    await progressCard.screenshot({ path: join(output, 'learning-context-evidence.png') });

    assert.equal(requests.length, 4, 'Only the four explicit graph/start/status/progress operations should run');
    const countBeforeAppearance = requests.length;
    const hostActionCount = intent.count;
    await page.getByTestId('theme-mode').getByText('Dark', { exact: true }).click();
    await page.getByTestId('language-select').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await progressCard.getByRole('heading', { name: '已完成实验的证据', exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    assert.equal(requests.length, countBeforeAppearance, 'Appearance and locale changes must not invoke operations');
    assert.equal(JSON.parse(await page.getByTestId('actual-host-action').innerText()).count, hostActionCount);
    await progressCard.screenshot({ path: join(output, 'learning-context-evidence-dark-zh.png') });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('preview-root').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    assert.equal(requests.length, countBeforeAppearance, 'Reload/history rendering must not replay reads or writes');
    assert.equal(errors.length, 0, `Browser errors: ${errors.join('\n')}`);
    console.log('Learning context browser acceptance passed: graph activity/concept -> explicit real experiment -> persisted context/status -> current-user completion evidence; one start, four operations, no appearance/replay requests or console errors.');
    console.log(`Screenshots: ${output}`);
  } catch (error) {
    await page.screenshot({ path: join(output, 'learning-context-failure.png'), fullPage: true }).catch(() => {});
    console.error(`Learning context browser acceptance failed: ${error.stack || error}`);
    console.error(`Console errors: ${JSON.stringify(errors)}`);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
});
