import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBenchmark } from './benchmark.mjs';
import { DEFAULT_RUN_TIMEOUT_SECONDS, noAnswer, parseModelProfile, resolveRunTimeoutSeconds, runCommand, runError, stripAnsi,
  timeoutSummary, timingRecord } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profiles = readFileSync(path.join(ROOT, 'evals/model-profiles.yaml'), 'utf8');

test('both shipped profiles set an 1800 s run timeout, temperature 0, a fixed seed and no thinking', () => {
  assert.deepEqual(parseModelProfile(profiles, 'qwen3.8-27b'),
    { model: 'eval/qwen3.8-27b', baseUrlEnv: 'EVAL_QWEN_BASE_URL', runTimeoutSeconds: 1800, temperature: 0, seed: 42,
      thinking: false });
  assert.deepEqual(parseModelProfile(profiles, 'deepseek-v4-flash'),
    { model: 'eval/deepseek-ai/DeepSeek-V4-Flash', baseUrlEnv: 'EVAL_DEEPSEEK_BASE_URL', runTimeoutSeconds: 1800,
      temperature: 0, seed: 42, thinking: false });
  assert.equal(parseModelProfile(profiles, 'no-such-profile'), null);
});

test('parses profile fields in any order and stops at the next profile', () => {
  const yaml = 'profiles:\n  a:\n    run_timeout_seconds: 90\n    # note\n\n    opencode_model: eval/a\n  b:\n    opencode_model: eval/b\n';
  assert.deepEqual(parseModelProfile(yaml, 'a'),
    { model: 'eval/a', baseUrlEnv: undefined, runTimeoutSeconds: 90, temperature: undefined, seed: undefined,
      thinking: undefined });
  const b = parseModelProfile(yaml, 'b');
  assert.equal(b.runTimeoutSeconds, undefined);
  assert.equal(resolveRunTimeoutSeconds({ profile: b.runTimeoutSeconds }), DEFAULT_RUN_TIMEOUT_SECONDS);
  assert.throws(() => parseModelProfile('profiles:\n  c:\n    opencode_model: m\n    run_timeout_seconds: soon\n', 'c'),
    /c\.run_timeout_seconds must be a positive number/);
});

test('validates temperature, seed and thinking', () => {
  const p = (field) => parseModelProfile(`profiles:\n  c:\n    opencode_model: m\n    ${field}\n`, 'c');
  assert.equal(p('temperature: 0.2').temperature, 0.2);
  assert.equal(p('seed: 7').seed, 7);
  assert.throws(() => p('temperature: -1'), /c\.temperature must be a number >= 0/);
  assert.throws(() => p('temperature: hot'), /c\.temperature must be a number >= 0/);
  for (const bad of ['seed: 1.5', 'seed: -3', 'seed: abc']) {
    assert.throws(() => p(bad), /c\.seed must be a non-negative integer/, bad);
  }
  assert.equal(p('thinking: false').thinking, false);
  assert.equal(p('thinking: true').thinking, true);
  for (const bad of ['thinking: no', 'thinking: 0', 'thinking: False']) {
    assert.throws(() => p(bad), /c\.thinking must be true or false/, bad);
  }
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
  assert.equal(runError(res), null);
  assert.equal(runError({ code: 1, stderr: 'boom\nlast line\n', timedOut: false }), 'exit 1: last line');
  assert.equal(runError({ code: 3, stderr: '', timedOut: false }), 'exit 3');
});

test('a clean exit with no answer is a failed run, not an error', () => {
  const stderr = '\u001b[0m→ \u001b[0mSkill "kei-proxy"\n';
  const res = { code: 0, stderr, timedOut: false };
  assert.equal(runError(res), null);
  assert.equal(noAnswer(res, '  \n'), 'no answer (the run ended after: → Skill "kei-proxy")');
  assert.equal(noAnswer({ code: 0, stderr: '', timedOut: false }, ''), 'no answer');
  assert.equal(noAnswer(res, 'an answer'), null);
  assert.equal(noAnswer({ code: 1, stderr, timedOut: false }, ''), null);
  assert.equal(noAnswer({ code: null, stderr, timedOut: true }, ''), null);
  assert.equal(runError({ code: 2, stderr, timedOut: false }), 'exit 2: → Skill "kei-proxy"');
});

test('stripAnsi removes colour codes', () => {
  assert.equal(stripAnsi('\u001b[0m→ \u001b[1;32mok\u001b[0m'), '→ ok');
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
