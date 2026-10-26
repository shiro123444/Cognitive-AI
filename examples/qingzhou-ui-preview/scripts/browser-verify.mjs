#!/usr/bin/env node
/**
 * Real-browser acceptance for the preview harness.
 *
 * Requires the preview package dependencies and a Chromium build
 * (`npx playwright install chromium`). Starts the existing Python fixture
 * server and Vite through the shared orchestration script, then verifies:
 * host-provider token inheritance, light/dark/narrow layouts, locale switch,
 * keyboard operation, zero writes on mount/history replay, explicit demo
 * writes, and the complete actual HTTP flow (course, search, graph, quiz,
 * submit, progress, lab start/status).
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PREVIEW_DIR, withServers } from './orchestrate.mjs';

const OUTPUT_DIR = join(PREVIEW_DIR, 'output', 'playwright');
const VIEWPORT = { width: 1280, height: 900 };
const NARROW = { width: 390, height: 844 };
const browserArg = process.argv.indexOf('--browser-executable');
const browserExecutable = browserArg >= 0
  ? process.argv[browserArg + 1]
  : process.env.EDUFISH_BROWSER_EXECUTABLE;

const ADAPTER_DIST = join(PREVIEW_DIR, '..', '..', 'packages', 'edufish-qingzhou-ui', 'dist', 'index.js');
const CORE_DIST = join(PREVIEW_DIR, '..', '..', 'packages', 'edufish-plugin', 'dist', 'index.js');
if (!existsSync(ADAPTER_DIST) || !existsSync(CORE_DIST)) {
  console.error(
    'Built packages are missing. Build packages/edufish-plugin and packages/edufish-qingzhou-ui first (see docs/plugin/QINGZHOU-UI-GUIDE.md).',
  );
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    'Playwright is not installed. Run `npm install` in examples/qingzhou-ui-preview, then `npx playwright install chromium`.',
  );
  process.exit(2);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, { timeout = 30_000, interval = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(interval);
  }
  throw new Error(
    `Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function textOf(locator) {
  return (await locator.innerText()).trim();
}

async function clickAndInvoke(page, locator, operation, timeout = 60_000) {
  const responsePromise = page.waitForResponse(
    (response) => {
      if (!response.url().includes('/api/v1/plugin/invoke')) return false;
      try {
        return JSON.parse(response.request().postData() || '{}').operation === operation;
      } catch {
        return false;
      }
    },
    { timeout },
  );
  await locator.click();
  const response = await responsePromise;
  assert(response.ok(), `${operation} returned HTTP ${response.status()}.`);
  const body = await response.json();
  assert(body?.success === true, `${operation} returned an error envelope.`);
  return body.data;
}

async function findActionButton(scope, namePattern) {
  const named = scope.getByRole('button', { name: namePattern });
  if ((await named.count()) > 0) return named.first();
  const typed = scope.locator('button[type="submit"]');
  if ((await typed.count()) > 0) return typed.first();
  const all = scope.getByRole('button');
  const count = await all.count();
  if (count === 0) throw new Error('No button found in the interaction component.');
  return all.nth(count - 1);
}

async function fillQuiz(scope, answers) {
  const boxes = scope.getByRole('textbox');
  const count = await boxes.count();
  assert(count > 0, 'QuizInteraction rendered no labelled answer fields.');
  for (let index = 0; index < count; index += 1) {
    await boxes.nth(index).fill(answers[index % answers.length]);
  }
  return { boxes, count };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  return withServers(async ({ vite }) => {
    const browser = await chromium.launch({
      headless: true,
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    });
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const consoleErrors = [];
    const writeRequests = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
    page.on('request', (request) => {
      if (request.method() !== 'POST' || !request.url().includes('/api/v1/plugin/invoke')) return;
      try {
        const body = JSON.parse(request.postData() || '{}');
        if (body.operation === 'edufish.quiz.submit' || body.operation === 'edufish.lab.start') {
          writeRequests.push(body.operation);
        }
      } catch {
        // Ignore non-JSON requests.
      }
    });

    try {
      await page.goto(`${vite.url}/?view=validation`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('preview-root').waitFor({ state: 'visible', timeout: 30_000 });
      await sleep(1200);

      // -- Mount / StrictMode / history rendering must not write. ----------
      assert(writeRequests.length === 0, 'A write request was issued on mount.');
      assert(
        (await page.getByTestId('demo-quiz-count').innerText()).trim() === '0',
        'Demo quiz write counter was not zero on mount.',
      );
      assert(
        (await page.getByTestId('demo-lab-count').innerText()).trim() === '0',
        'Demo lab write counter was not zero on mount.',
      );

      // -- All eight snapshots, including the graph SVG. -------------------
      const snapshotIds = [
        'course-read',
        'material-search',
        'graph-neighborhood',
        'quiz-read',
        'quiz-submit',
        'progress-read',
        'lab-start',
        'lab-status',
      ];
      for (const id of snapshotIds) {
        const card = page.getByTestId(`snapshot-${id}`);
        await card.waitFor({ state: 'visible', timeout: 15_000 });
        assert((await textOf(card)).length > 0, `Snapshot ${id} rendered empty.`);
      }
      assert(
        (await page.getByTestId('snapshot-graph-neighborhood').locator('svg').count()) > 0,
        'GraphResult did not render an SVG.',
      );

      // -- Light appearance, then a real computed-token change. ------------
      const surface = page.getByTestId('surface-probe');
      const lightSurface = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
      const graphLabel = page.getByTestId('snapshot-graph-neighborhood').locator('svg text').nth(1);
      const graphPrimaryLabel = page.getByTestId('snapshot-graph-neighborhood').locator('svg text').first();
      const lightGraphText = await graphLabel.evaluate((el) => getComputedStyle(el).fill);
      await page.screenshot({ path: join(OUTPUT_DIR, 'light.png'), fullPage: true });

      await page.getByTestId('theme-mode').getByText('Dark', { exact: true }).click();
      await page.waitForFunction(
        (previous) =>
          getComputedStyle(document.querySelector('[data-testid="surface-probe"]')).backgroundColor !==
          previous,
        lightSurface,
        { timeout: 15_000 },
      );
      const darkSurface = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
      assert(darkSurface !== lightSurface, 'Dark mode did not change the host surface token.');
      await page.waitForFunction(
        (previous) => getComputedStyle(document.querySelectorAll('[data-testid="snapshot-graph-neighborhood"] svg text')[1]).fill !== previous,
        lightGraphText,
        { timeout: 15_000 },
      );
      const darkGraphText = await graphLabel.evaluate((el) => getComputedStyle(el).fill);
      assert(darkGraphText !== lightGraphText, 'Adapter SVG text did not inherit dark-mode tokens.');
      await sleep(500);
      await page.screenshot({ path: join(OUTPUT_DIR, 'dark.png'), fullPage: true });

      // -- Primary color control changes the host component token. ---------
      const previousPrimary = await page.getByTestId('token-probe').evaluate((el) => getComputedStyle(el).backgroundColor);
      const previousGraphPrimary = await graphPrimaryLabel.evaluate((el) => getComputedStyle(el).fill);
      await page.getByTestId('primary-color').getByText('Cyan', { exact: true }).click();
      await page.waitForFunction(
        (previous) => {
          const style = getComputedStyle(document.querySelector('[data-testid="token-probe"]'));
          return style.backgroundColor !== previous;
        },
        previousPrimary,
        { timeout: 15_000 },
      );

      await page.waitForFunction(
        (previous) => getComputedStyle(document.querySelector('[data-testid="snapshot-graph-neighborhood"] svg text')).fill !== previous,
        previousGraphPrimary,
        { timeout: 15_000 },
      );

      // -- Language switch through the same i18next instance. --------------
      await page.getByTestId('language-select').click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="preview-heading"]')?.textContent?.includes('清舟'),
        undefined,
        { timeout: 15_000 },
      );
      await page.waitForFunction(
        () => document.querySelector('[data-testid="quiz-interaction"]')?.textContent?.includes('题目'),
        undefined,
        { timeout: 15_000 },
      );
      await page.getByTestId('language-select').click();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="preview-heading"]')
            ?.textContent?.includes('EduFish Qingzhou UI preview'),
        undefined,
        { timeout: 15_000 },
      );

      // -- Narrow viewport must remain usable without horizontal overflow. -
      await page.setViewportSize(NARROW);
      await sleep(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 1) console.error('Overflowing elements:', await page.evaluate(() =>
        [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map((el) => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })),
      ));
      assert(overflow <= 1, `Narrow viewport overflows horizontally by ${overflow}px.`);
      await page.screenshot({ path: join(OUTPUT_DIR, 'narrow.png'), fullPage: true });
      await page.setViewportSize(VIEWPORT);
      await sleep(300);

      // -- Keyboard access and explicit demo writes. -----------------------
      const demoQuiz = page.getByTestId('quiz-interaction');
      const firstBox = demoQuiz.getByRole('textbox').first();
      await firstBox.focus();
      const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
      assert(
        focusedTag === 'INPUT' || focusedTag === 'TEXTAREA',
        'Quiz answer field is not keyboard focusable.',
      );
      await page.keyboard.press('Tab');
      const nextTag = await page.evaluate(() => document.activeElement?.tagName);
      assert(
        nextTag === 'INPUT' || nextTag === 'TEXTAREA' || nextTag === 'BUTTON',
        'Tab did not move focus to a usable control.',
      );

      await fillQuiz(demoQuiz, [
        'It estimates which states are more promising.',
        'A* combines path cost and a heuristic estimate.',
        'A heuristic checklist.',
      ]);
      const demoSave = await findActionButton(demoQuiz, /submit|save|check/i);
      await demoSave.focus();
      await page.keyboard.press('Enter');
      await page.getByTestId('demo-quiz-result').waitFor({ state: 'visible', timeout: 20_000 });
      await waitFor(
        async () => (await page.getByTestId('demo-quiz-count').innerText()).trim() === '1',
        { label: 'demo quiz write count 1' },
      );

      const demoLab = page.getByTestId('lab-launcher');
      const demoStart = await findActionButton(demoLab, /start|run|launch|begin/i);
      await demoStart.click();
      await page.getByTestId('demo-lab-result').waitFor({ state: 'visible', timeout: 20_000 });
      await waitFor(
        async () => (await page.getByTestId('demo-lab-count').innerText()).trim() === '1',
        { label: 'demo lab write count 1' },
      );
      assert(writeRequests.length === 0, 'Demo mode issued an HTTP write request.');

      // -- Actual HTTP mode. ----------------------------------------------
      await page.getByTestId('transport-mode').getByText('Actual HTTP (loopback fixture)', { exact: true }).click();
      await page.getByTestId('actual-panel').waitFor({ state: 'visible', timeout: 15_000 });
      await sleep(800);
      assert(writeRequests.length === 0, 'Entering actual mode issued a write request.');

      const course = await clickAndInvoke(page, page.getByTestId('actual-load-course'), 'edufish.course.read');
      assert(course.course.title === 'Plugin Fixture Course', 'Actual course title mismatch.');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="actual-course-card"]')?.textContent?.includes('Plugin Fixture Course'),
        undefined,
        { timeout: 15_000 },
      );

      const search = await clickAndInvoke(page, page.getByTestId('actual-search'), 'edufish.material.search');
      assert(search.results.length > 0, 'Actual material search returned no results.');
      assert(
        search.results.some((item) => item.filename === 'heuristic-search.md'),
        'Actual material search missed the fixture reading.',
      );

      const graph = await clickAndInvoke(page, page.getByTestId('actual-read-graph'), 'edufish.graph.neighborhood');
      assert(graph.nodes.length >= 3 && graph.edges.length >= 1, 'Actual graph neighborhood was incomplete.');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="actual-graph-card"]')?.querySelector('svg'),
        undefined,
        { timeout: 15_000 },
      );

      const quiz = await clickAndInvoke(page, page.getByTestId('actual-read-quiz'), 'edufish.quiz.read');
      assert(quiz.items.length >= 1, 'Actual quiz read returned no items.');
      const actualQuiz = page.getByTestId('actual-quiz-interaction');
      await actualQuiz.waitFor({ state: 'visible', timeout: 15_000 });
      await waitFor(
        async () => (await actualQuiz.getByRole('textbox').count()) === quiz.items.length,
        { label: 'actual quiz answer fields' },
      );
      await fillQuiz(actualQuiz, [
        'A* combines path cost and a heuristic estimate.',
        'It estimates which states are more promising.',
        'A heuristic checklist.',
      ]);
      const actualSubmit = await findActionButton(actualQuiz, /submit|save|check/i);
      await actualSubmit.focus();
      const submission = await clickAndInvoke(
        page,
        actualSubmit,
        'edufish.quiz.submit',
        60_000,
      );
      assert(submission.total >= 1, 'Actual quiz submission returned an empty total.');
      await page.getByTestId('actual-quiz-submission').waitFor({ state: 'visible', timeout: 20_000 });
      assert(writeRequests.includes('edufish.quiz.submit'), 'Explicit quiz submit was not observed.');

      const progress = await clickAndInvoke(
        page,
        page.getByTestId('actual-read-progress'),
        'edufish.progress.read',
      );
      assert(progress.student_id === 'fixture-student', 'Actual progress identity mismatch.');
      assert(
        progress.quiz_submissions.length >= 1,
        'Actual progress did not include the explicit submission.',
      );

      const actualLab = page.getByTestId('actual-lab-interaction');
      const actualStart = await findActionButton(actualLab, /start|run|launch|begin/i);
      const started = await clickAndInvoke(page, actualStart, 'edufish.lab.start', 90_000);
      assert(started.run?.id, 'Actual lab start returned no run id.');
      assert(writeRequests.includes('edufish.lab.start'), 'Explicit lab start was not observed.');
      await page.getByTestId('actual-lab-result').waitFor({ state: 'visible', timeout: 30_000 });

      const status = await clickAndInvoke(
        page,
        page.getByTestId('actual-lab-status'),
        'edufish.lab.status',
        60_000,
      );
      assert(status.run?.id === started.run.id, 'Actual lab status returned a different run.');
      await page.getByTestId('actual-lab-status-card').waitFor({ state: 'visible', timeout: 15_000 });

      assert(writeRequests.length === 2, `Expected exactly two actual writes, saw ${writeRequests.length}.`);
      await page.screenshot({ path: join(OUTPUT_DIR, 'actual.png'), fullPage: true });

      // -- Token is memory-only and never printed. -------------------------
      const browserStorage = await page.evaluate(() => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
        cookie: document.cookie,
        text: document.body.innerText,
      }));
      assert(
        !JSON.stringify(browserStorage.local).includes('token') &&
          !JSON.stringify(browserStorage.session).includes('token'),
        'A token was persisted to browser storage.',
      );
      assert(!browserStorage.cookie, 'The preview wrote a cookie.');
      assert(!browserStorage.text.includes('eyJ'), 'A JWT-shaped string was printed in the page.');

      // -- History replay / mount must not write. --------------------------
      page.on('requestfailed', () => undefined);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByTestId('preview-root').waitFor({ state: 'visible', timeout: 30_000 });
      await sleep(1500);
      assert(
        writeRequests.length === 2,
        `Reloading issued new writes (${writeRequests.length} total).`,
      );

      assert(consoleErrors.length === 0, `Console/runtime errors:\n${consoleErrors.join('\n')}`);

      console.log('Browser acceptance passed.');
      console.log(`Screenshots: ${OUTPUT_DIR}`);
      console.log('Checks: snapshots=8, graph=svg, light/dark=computed token change,');
      console.log('primary-color=computed token change, language=zh/en, narrow=no overflow,');
      console.log('keyboard=answer fields + Enter submit, history replay=zero writes,');
      console.log('actual HTTP=course/search/graph/quiz/submit/progress/lab.start/lab.status.');
    } catch (error) {
      await page.screenshot({ path: join(OUTPUT_DIR, 'failure.png'), fullPage: true }).catch(() => {});
      throw error;
    } finally {
      await browser.close();
    }
  });
}

try {
  await main();
  process.exitCode = 0;
} catch (error) {
  console.error(`Browser acceptance failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
}
