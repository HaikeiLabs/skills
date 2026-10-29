import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preflightModel } from './preflight.mjs';

let server;
let baseUrl;
let modelRequests = 0;

before(async () => {
  server = http.createServer((req, res) => {
    modelRequests++;
    if (req.url !== '/v1/models') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [
      { id: 'served-model' },
      { id: 'other-model' },
      { id: 'nvidia/GLM-5.3-Flash-FP4-Local' },
    ] }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(async () => {
  const closed = new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  server.closeAllConnections();
  await closed;
});

test('preflight accepts an exact served model id', async () => {
  await preflightModel({ baseUrl, model: 'served-model' });
});

test('preflight matches a profile model after removing its eval provider prefix', async () => {
  await preflightModel({ baseUrl, model: 'eval/nvidia/GLM-5.3-Flash-FP4-Local' });
});

test('preflight reports endpoint URL, wanted model, and served models', async () => {
  await assert.rejects(
    preflightModel({ baseUrl, model: 'missing-model' }),
    /http:\/\/127\.0\.0\.1:\d+\/v1\/models.*missing-model.*served-model.*other-model/,
  );
});

test('runner preflights profiles and --no-preflight skips it with a fake harness', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'eval-preflight-runner-'));
  const skillsDir = path.join(dir, 'skills');
  const skillDir = path.join(skillsDir, 'fixture');
  const evalsDir = path.join(skillDir, 'evals');
  const binDir = path.join(dir, 'bin');
  const marker = path.join(dir, 'harness-calls.txt');
  const opencodePath = path.join(binDir, 'opencode');
  const runEvals = fileURLToPath(new URL('../run-evals.mjs', import.meta.url));
  const beforeRequests = modelRequests;
  mkdirSync(evalsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  writeFileSync(path.join(skillDir, 'SKILL.md'), 'Fixture skill.\n');
  writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({ evals: [{
    id: 1,
    prompt: 'Say fake answer.',
    expectations: ['Includes fake answer'],
    checks: [{ text: 'Includes fake answer', contains_any: ['fake answer'] }],
  }] }));
  writeFileSync(opencodePath, `#!/usr/bin/env node\nrequire('node:fs').appendFileSync(process.env.FAKE_HARNESS_MARKER, 'called\\n');\nprocess.stdout.write('fake answer\\n');\n`);
  chmodSync(opencodePath, 0o755);
  const env = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    EVAL_DEEPSEEK_BASE_URL: baseUrl,
    FAKE_HARNESS_MARKER: marker,
  };
  const run = (name, skipPreflight) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runEvals,
      '--skill', 'fixture', '--skills-dir', skillsDir, '--model-profile', 'glm-5.3-flash',
      '--jobs', '1', '--no-baseline', '--threshold', '0', '--out', path.join(dir, name),
      ...(skipPreflight ? ['--no-preflight'] : []),
    ], { encoding: 'utf8', env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  try {
    const preflightRun = await run('with-preflight', false);
    assert.equal(preflightRun.status, 0, preflightRun.stderr);
    assert.equal(modelRequests, beforeRequests + 1);

    const skippedRun = await run('without-preflight', true);
    assert.equal(skippedRun.status, 0, skippedRun.stderr);
    assert.equal(modelRequests, beforeRequests + 1);
    assert.equal(readFileSync(marker, 'utf8').trim().split('\n').length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
