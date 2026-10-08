import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBenchmark } from './benchmark.mjs';
import { DEFAULT_RUN_TIMEOUT_SECONDS, parseModelProfile, resolveRunTimeoutSeconds, runCommand, runError,
  timeoutSummary, timingRecord } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profiles = readFileSync(path.join(ROOT, 'evals/model-profiles.yaml'), 'utf8');

test('qwen3.8-27b profile sets an 1800 s run timeout; deepseek keeps the default', () => {
  assert.deepEqual(parseModelProfile(profiles, 'qwen3.8-27b'),
    { model: 'eval/qwen3.8-27b', baseUrlEnv: 'EVAL_QWEN_BASE_URL', runTimeoutSeconds: 1800 });
  const deepseek = parseModelProfile(profiles, 'deepseek-v4-flash');
  assert.equal(deepseek.runTimeoutSeconds, undefined);
  assert.equal(resolveRunTimeoutSeconds({ profile: deepseek.runTimeoutSeconds }), DEFAULT_RUN_TIMEOUT_SECONDS);
  assert.equal(parseModelProfile(profiles, 'no-such-profile'), null);
});

test('parses profile fields in any order and stops at the next profile', () => {
  const yaml = 'profiles:\n  a:\n    run_timeout_seconds: 90\n    # note\n\n    opencode_model: eval/a\n  b:\n    opencode_model: eval/b\n';
  assert.deepEqual(parseModelProfile(yaml, 'a'), { model: 'eval/a', baseUrlEnv: undefined, runTimeoutSeconds: 90 });
  assert.equal(parseModelProfile(yaml, 'b').runTimeoutSeconds, undefined);
  assert.throws(() => parseModelProfile('profiles:\n  c:\n    opencode_model: m\n    run_timeout_seconds: soon\n', 'c'),
    /c\.run_timeout_seconds must be a positive number/);
});

test('--run-timeout overrides the profile, which overrides the default', () => {
  assert.equal(resolveRunTimeoutSeconds(), 600);
  assert.equal(resolveRunTimeoutSeconds({ profile: 1800 }), 1800);
  assert.equal(resolveRunTimeoutSeconds({ flag: '900', profile: 1800 }), 900);
  for (const bad of ['0', '-5', 'abc']) {
    assert.throws(() => resolveRunTimeoutSeconds({ flag: bad }), /--run-timeout must be a positive number/);
  }
});

test('a run killed at the timeout is recorded as timed out and reported as "timeout"', async () => {
  const res = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'],
    { cwd: ROOT, timeoutMs: 200 });
  assert.equal(res.timedOut, true);
  assert.equal(res.code, null);
  assert.deepEqual({ ...timingRecord(res, 0.2), total_duration_seconds: undefined },
    { total_duration_seconds: undefined, exit_code: null, timed_out: true, timeout_seconds: 0.2 });
  assert.equal(runError(res, 'partial answer'), 'timeout');
});

test('the timeout also ends subprocesses that hold the output pipe open', async () => {
  const res = await runCommand('/bin/sh', ['-c', 'sleep 30'], { cwd: ROOT, timeoutMs: 200 });
  assert.equal(res.timedOut, true);
  assert.ok(res.ms < 5_000, `run lasted ${res.ms} ms after a 200 ms timeout`);
});

test('a run that finishes in time is not marked timed out', async () => {
  const res = await runCommand(process.execPath, ['-e', 'process.stdout.write("ok")'], { cwd: ROOT, timeoutMs: 10_000 });
  assert.equal(res.timedOut, false);
  assert.equal(res.code, 0);
  assert.equal(timingRecord(res, 10).timed_out, false);
  assert.equal(runError(res, res.stdout), null);
  assert.equal(runError({ code: 1, stderr: 'boom\nlast line\n', timedOut: false }, ''), 'last line');
});

test('timeouts count as benchmark errors with reason "timeout" and get a summary line', () => {
  const rows = [
    { skill: 's', id: 1, config: 'with_skill', repeat: 1, passed: 0, failed: 0, total: 1, error: 'timeout', timedOut: true },
    { skill: 's', id: 2, config: 'with_skill', repeat: 1, passed: 1, failed: 0, total: 1, casePassed: true },
    { skill: 's', id: 1, config: 'without_skill', repeat: 1, passed: 0, failed: 0, total: 1, error: 'timeout', timedOut: true },
  ];
  const [suite] = makeBenchmark(rows, { harness: 'opencode', gitSha: 'abc' }).results;
  assert.equal(suite.errors, 1);
  assert.equal(suite.passed, 1);
  assert.equal(suite.cases.find((c) => c.id === 1).reason, 'repeat 1: timeout');
  assert.equal(timeoutSummary(rows, 1800), '2 runs timed out after 1800s');
  assert.equal(timeoutSummary(rows.slice(0, 1), 600), '1 run timed out after 600s');
  assert.equal(timeoutSummary(rows.slice(1, 2), 600), null);
});
