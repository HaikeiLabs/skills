import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBenchmark } from './benchmark.mjs';
import { DEFAULT_RUN_TIMEOUT_SECONDS, noAnswer, parseModelProfile, resolveRunTimeoutSeconds, runCommand, runError, stripAnsi,
  timeoutSummary, timingRecord } from './run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const profiles = readFileSync(path.join(ROOT, 'evals/model-profiles.yaml'), 'utf8');

test('both shipped profiles set an 1800 s run timeout, a fixed seed and thinking on; Qwen samples as its docs recommend', () => {
  assert.deepEqual(parseModelProfile(profiles, 'qwen3.8-27b'),
    { model: 'eval/qwen3.8-27b', baseUrlEnv: 'EVAL_QWEN_BASE_URL', runTimeoutSeconds: 1800, temperature: 0.6,
      topP: 0.95, topK: 20, seed: 42, thinking: true });
  assert.deepEqual(parseModelProfile(profiles, 'glm-5.3-flash'),
    { model: 'eval/nvidia/GLM-5.3-Flash-FP4-Local', baseUrlEnv: 'EVAL_DEEPSEEK_BASE_URL', runTimeoutSeconds: 1800,
      temperature: 0, topP: undefined, topK: undefined, seed: 42, thinking: true });
  // The DeepSeek V4 Flash server was removed; its profile is gone too.
  assert.equal(parseModelProfile(profiles, 'deepseek-v4-flash'), null);
  assert.equal(parseModelProfile(profiles, 'no-such-profile'), null);
});

test('the agent-evals gate runs exactly the shipped profiles', () => {
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/agent-evals.yaml'), 'utf8');
  const line = workflow.match(/^  EVAL_PROFILES: (.+)$/m)?.[1];
  assert.ok(line, 'agent-evals.yaml sets EVAL_PROFILES');
  // YAML single quotes around the flow sequence.
  const gate = JSON.parse(line.replace(/^'|'$/g, '')).sort();
  const shipped = [...profiles.matchAll(/^  ([a-z0-9][a-z0-9._-]*):\s*$/gm)].map((m) => m[1]).sort();
  assert.ok(shipped.length >= 1, 'model-profiles.yaml ships at least one profile');
  assert.deepEqual(gate, shipped);
});

test('parses profile fields in any order and stops at the next profile', () => {
  const yaml = 'profiles:\n  a:\n    run_timeout_seconds: 90\n    # note\n\n    opencode_model: eval/a\n  b:\n    opencode_model: eval/b\n';
  assert.deepEqual(parseModelProfile(yaml, 'a'),
    { model: 'eval/a', baseUrlEnv: undefined, runTimeoutSeconds: 90, temperature: undefined, topP: undefined,
      topK: undefined, seed: undefined, thinking: undefined });
  const b = parseModelProfile(yaml, 'b');
  assert.equal(b.runTimeoutSeconds, undefined);
  assert.equal(resolveRunTimeoutSeconds({ profile: b.runTimeoutSeconds }), DEFAULT_RUN_TIMEOUT_SECONDS);
  assert.throws(() => parseModelProfile('profiles:\n  c:\n    opencode_model: m\n    run_timeout_seconds: soon\n', 'c'),
    /c\.run_timeout_seconds must be a positive number/);
});

test('validates temperature, top_p, top_k, seed and thinking', () => {
  const p = (field) => parseModelProfile(`profiles:\n  c:\n    opencode_model: m\n    ${field}\n`, 'c');
  assert.equal(p('temperature: 0.2').temperature, 0.2);
  assert.equal(p('seed: 7').seed, 7);
  assert.throws(() => p('temperature: -1'), /c\.temperature must be a number >= 0/);
  assert.throws(() => p('temperature: hot'), /c\.temperature must be a number >= 0/);
  for (const bad of ['seed: 1.5', 'seed: -3', 'seed: abc']) {
    assert.throws(() => p(bad), /c\.seed must be a non-negative integer/, bad);
  }
  assert.equal(p('top_p: 0.95').topP, 0.95);
  assert.equal(p('top_p: 1').topP, 1);
  for (const bad of ['top_p: 0', 'top_p: 1.5', 'top_p: -0.1', 'top_p: most']) {
    assert.throws(() => p(bad), /c\.top_p must be a number in \(0, 1\]/, bad);
  }
  assert.equal(p('top_k: 20').topK, 20);
  for (const bad of ['top_k: 0', 'top_k: 2.5', 'top_k: -1', 'top_k: many']) {
    assert.throws(() => p(bad), /c\.top_k must be a positive integer/, bad);
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

// HAI-573: a stalled harness can hold an eval slot for hours. The timeout must
// end the harness AND the processes it started, and the run must be reported as
// a timeout error rather than hanging the job.
test('the timeout kills the harness process tree, not just the harness process', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'skill-eval-tree-'));
  const pidFile = path.join(dir, 'worker.pid');
  // A harness that starts a worker process and then hangs. Killing only the
  // harness process would leave the worker running.
  const harness = `
    const { spawn } = require('node:child_process');
    const fs = require('node:fs');
    const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], { stdio: 'ignore' });
    fs.writeFileSync(process.argv[1], String(worker.pid));
    setTimeout(() => {}, 30_000);
  `;
  try {
    const res = await runCommand(process.execPath, ['-e', harness, pidFile], { cwd: ROOT, timeoutMs: 300 });
    assert.equal(res.timedOut, true);
    assert.equal(runError(res), 'timeout');
    assert.deepEqual({ ...timingRecord(res, 0.3), total_duration_seconds: undefined },
      { total_duration_seconds: undefined, exit_code: null, timed_out: true, timeout_seconds: 0.3 });
    const pid = Number(readFileSync(pidFile, 'utf8'));
    assert.ok(pid > 0, 'the harness recorded its worker pid');
    // The worker gets the group's SIGTERM too; allow a moment for it to be reaped.
    const gone = async () => {
      for (let i = 0; i < 40; i++) {
        try {
          process.kill(pid, 0);
        } catch {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    assert.equal(await gone(), true, `worker process ${pid} survived the run timeout`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// HAI-573: the timeout is per harness run, not per job. A second hung run must
// get its own full timeout instead of inheriting the first run's deadline.
test('the timeout applies per run, so a second hung run is still killed', async () => {
  const started = Date.now();
  const first = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], { cwd: ROOT, timeoutMs: 200 });
  const second = await runCommand(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], { cwd: ROOT, timeoutMs: 200 });
  const elapsed = Date.now() - started;
  assert.equal(first.timedOut, true);
  assert.equal(second.timedOut, true);
  assert.equal(runError(first), 'timeout');
  assert.equal(runError(second), 'timeout');
  // A per-job timeout would have killed only the first run and left the second
  // hanging for 30 s.
  assert.ok(elapsed < 5_000, `two runs took ${elapsed} ms, so the timeout was not per run`);
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
