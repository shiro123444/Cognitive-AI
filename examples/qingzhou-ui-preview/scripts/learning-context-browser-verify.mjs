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
    const concept = graph.context.concepts.find((item) => item.concept_id === 'concept-neural-networks');
    assert(concept.activities.some((item) => item.activity_id === 'activity-fixture-neuron'));
    const expectedContext = {
      concept_id: concept.concept_id,
      graph_snapshot_id: graph.context.snapshot_id,
    };
    const expectedSavedContext = {
      version: 1,
      course_id: graph.context.course_id,
      chapter_id: null,
      activity_id: null,
      ...expectedContext,
    };
    const launcher = page.getByTestId('actual-graph-lab-card');
    const activityButton = graphCard.getByRole('button', { name: 'Open activity: Explore neuron simulation', exact: true });

    async function openExperiment(templateId) {
      const experiment = concept.experiments.find((item) => item.template_id === templateId);
      assert(experiment, `The fixture concept must expose ${templateId}`);
      const countBefore = requests.length;
      await graphCard.getByRole('button', { name: `Open experiment: ${experiment.title}`, exact: true }).click();
      await launcher.waitFor({ state: 'visible' });
      assert.deepEqual(JSON.parse(await page.getByTestId('actual-lab-learning-context').innerText()), expectedContext,
        'A graph activity without a verified template binding must not supply activity or chapter context');
      assert.equal(requests.length, countBefore, 'Opening or switching an experiment must not invoke operations');
      const intent = JSON.parse(await page.getByTestId('actual-host-action').innerText());
      assert.equal(intent.kind, 'experiment');
      assert.equal(intent.payload.experiment.template_id, templateId);
      assert.deepEqual(intent.payload.origin, { messageId: 'preview-graph-message', toolCallId: 'preview-graph-tool' });
      return intent;
    }

    async function startExperiment(templateId) {
      const countBefore = requests.length;
      const result = await invokeByClick('edufish.lab.start', launcher.getByRole('button', { name: 'Start experiment', exact: true }));
      assert.equal(requests.length, countBefore + 1, 'One explicit click must issue exactly one start');
      assert.equal(result.run.template_id, templateId);
      assert.equal(result.run.status, 'completed');
      assert(result.run.artifacts.length > 0 && result.run.report, 'Real experiment artifacts and report must persist');
      assert.deepEqual(result.learning_context, expectedSavedContext);
      assert.deepEqual(requests.at(-1).arguments.learning_context, expectedContext);
      assert(!('origin' in requests.at(-1).arguments.learning_context), 'Host message provenance must not become model arguments');
      assert(!('learning_context' in result.run.params), 'Calculation params must remain separate');
      await launcher.getByText('completed', { exact: true }).waitFor({ state: 'visible' });
      return result;
    }

    await graphCard.getByRole('button', { name: 'Neural Networks', exact: true }).click();
    await activityButton.click();
    await openExperiment('exp-hodgkin-huxley');
    assert.equal(requests.length, 1, 'Selecting an activity and opening a different template must not start a run');
    const first = await startExperiment('exp-hodgkin-huxley');
    await launcher.screenshot({ path: join(output, 'learning-context-alternative-template.png') });

    await openExperiment('exp-neuron-spike');
    const countBeforeActivity = requests.length;
    await activityButton.click();
    assert.equal(requests.length, countBeforeActivity, 'Opening an activity must not invoke operations');
    assert.deepEqual(JSON.parse(await page.getByTestId('actual-lab-learning-context').innerText()), expectedContext);
    const second = await startExperiment('exp-neuron-spike');
    await launcher.screenshot({ path: join(output, 'learning-context-run.png') });

    await activityButton.click();
    const intent = await openExperiment('exp-hodgkin-huxley');
    assert.equal(await launcher.getByText('completed', { exact: true }).count(), 0, 'Switching templates must clear the previous local result');
    const started = await startExperiment('exp-hodgkin-huxley');
    const runs = [first, second, started];
    assert.equal(new Set(runs.map((result) => result.run.id)).size, 3);
    const writes = requests.filter((request) => request.operation === 'edufish.lab.start');
    assert.equal(writes.length, 3, 'Three explicit clicks must issue exactly three starts');
    assert.equal(new Set(writes.map((request) => request.request_id)).size, 3, 'Each deliberate run needs its own request id');
    await launcher.screenshot({ path: join(output, 'learning-context-template-switch.png') });

    const status = await invokeByClick('edufish.lab.status', page.getByTestId('actual-lab-status'));
    assert.equal(status.run.id, started.run.id);
    assert.deepEqual(status.learning_context, started.learning_context);
    assert.equal(requests.at(-1).arguments.include_context, true);
    const progress = await invokeByClick('edufish.progress.read', page.getByTestId('actual-read-progress'));
    assert.equal(progress.event_counts.ran_lab, 3);
    assert.equal(progress.event_counts.completed ?? 0, 0, 'Successful simulation must not complete a chapter/activity');
    assert.equal(progress.lab_evidence.runs.length, 3);
    for (const result of runs) {
      const evidence = progress.lab_evidence.runs.find((item) => item.run_id === result.run.id);
      assert(evidence, 'Every explicit completed run must have completion evidence');
      assert.equal(evidence.status, 'completed');
      assert.deepEqual(evidence.learning_context, result.learning_context);
      assert.equal(evidence.artifact_count, result.run.artifacts.length);
      assert.equal(evidence.report_id, result.run.report.id);
    }
    const progressCard = page.getByTestId('actual-progress-card');
    await progressCard.getByRole('heading', { name: 'Completed experiment evidence', exact: true }).waitFor({ state: 'visible' });
    await progressCard.getByText(/proof of mastery/).waitFor({ state: 'visible' });
    await progressCard.screenshot({ path: join(output, 'learning-context-evidence.png') });

    assert.equal(requests.length, 6, 'Only the explicit graph/three starts/status/progress operations should run');
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
    console.log('Learning context browser acceptance passed: activity selection and template switching -> three explicit real runs with concept-only context -> persisted status and current-user completion evidence; three starts, six operations, no appearance/replay requests or console errors.');
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
