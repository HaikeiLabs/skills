import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gradeChecks, validateChecks, hasChecks, MISSING_CHECKS, missingChecksSummary } from './checks.mjs';
import { makeBenchmark, belowThreshold } from './benchmark.mjs';

test('contains_any checks match case-insensitively', () => {
  const [item] = gradeChecks(['Names an allow result'], [
    { text: 'Names an allow result', contains_any: ['DENY', 'ALLOW'] },
  ], 'The result is allow.').expectations;
  assert.equal(item.passed, true);
});

test('contains_all checks require every term', () => {
  const result = gradeChecks(['Names tool and action'], [
    { text: 'Names tool and action', contains_all: ['TOOL', 'action'] },
  ], 'Tool name provided; action specified.');
  assert.equal(result.expectations[0].passed, true);
});

test('regex checks use case-insensitive matching', () => {
  const result = gradeChecks(['States exit code'], [
    { text: 'States exit code', regex: 'exit\\s+0' },
  ], 'EXIT 0 means allow.');
  assert.equal(result.expectations[0].passed, true);
});

test('not_contains checks reject any listed term case-insensitively', () => {
  const result = gradeChecks(['Avoid login advice'], [
    { text: 'Avoid login advice', not_contains: ['kei login', 'admin login'] },
  ], 'Use KEI LOGIN to continue.');
  assert.equal(result.expectations[0].passed, false);
});

test('requires one contract-shaped check per expectation and rejects legacy or mixed shapes', () => {
  assert.deepEqual(validateChecks(undefined, ['expectation']), []);
  assert.match(validateChecks(undefined, ['expectation'], { strict: true })[0], /required/);
  assert.match(validateChecks([{ text: 'expectation', regex: '[' }], ['expectation'])[0], /invalid regex/);
  assert.match(validateChecks([{ text: 'expectation', contains_all: ['a'] }], ['expectation', 'second'])[0], /exactly 2/);
  assert.match(validateChecks([{ type: 'contains_all', values: ['a'] }], ['expectation']).join('; '), /exactly one check key/);
  assert.match(validateChecks([{ text: 'expectation', contains_all: ['a'], regex: 'a' }], ['expectation']).join('; '), /exactly one check key/);
  assert.match(validateChecks([{ text: 'different text', contains_any: ['a'] }], ['expectation']).join('; '), /verbatim/);
});

test('records repeat count and requires every repeat to pass a skill case', () => {
  const benchmark = makeBenchmark([
    { skill: 's', id: 1, config: 'with_skill', repeat: 1, casePassed: true },
    { skill: 's', id: 1, config: 'with_skill', repeat: 2, casePassed: false, reason: 'missing expected phrase' },
    { skill: 's', id: 2, config: 'with_skill', repeat: 1, casePassed: true },
    { skill: 's', id: 2, config: 'with_skill', repeat: 2, casePassed: true },
    { skill: 's', id: 1, config: 'without_skill', repeat: 1, casePassed: true },
  ], { harness: 'opencode', modelProfile: 'deepseek-v4-flash', model: 'eval/model', repeats: 2, gitSha: 'abc123', createdAt: '2026-01-01T00:00:00Z' });
  assert.deepEqual(Object.keys(benchmark), ['schema', 'harness', 'model_profile', 'model', 'created_at', 'git_sha', 'repeats', 'results']);
  assert.equal(benchmark.repeats, 2);
  assert.deepEqual(Object.keys(benchmark.results[0]), ['suite', 'kind', 'passed', 'failed', 'errors', 'total', 'pass_rate', 'cases']);
  assert.equal(benchmark.schema, 'haikei.eval-benchmark.v1');
  assert.deepEqual(benchmark.results, [{ suite: 's', kind: 'skill', passed: 1, failed: 1, errors: 0, total: 2,
    pass_rate: 0.5, cases: [
      { id: 1, passed: false, reason: 'repeat 2: missing expected phrase' },
      { id: 2, passed: true, reason: '' },
    ] }]);
  assert.deepEqual(belowThreshold(benchmark, 0.9), ['s']);
  assert.deepEqual(belowThreshold(benchmark, 0.5), []);
});

test('grade-only exits non-zero below threshold and writes contract benchmark files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'skill-eval-threshold-'));
  try {
    const runDir = path.join(dir, 'eval-1', 'with_skill', 'run-1');
    mkdirSync(path.join(runDir, 'outputs'), { recursive: true });
    writeFileSync(path.join(dir, 'eval-1', 'eval_metadata.json'), JSON.stringify({
      eval_id: 1, skill: 'example', assertions: ['Names the runtime'],
      checks: [{ text: 'Names the runtime', contains_all: ['runtime'] }],
    }));
    writeFileSync(path.join(runDir, 'outputs', 'response.md'), 'This response does not mention it.');
    const script = new URL('../run-evals.mjs', import.meta.url);
    const result = spawnSync(process.execPath, [script.pathname, '--grade-only', dir, '--threshold', '0.9'], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const benchmark = JSON.parse(readFileSync(path.join(dir, 'benchmark.json'), 'utf8'));
    assert.equal(benchmark.schema, 'haikei.eval-benchmark.v1');
    assert.equal(benchmark.repeats, 1);
    assert.equal(benchmark.results[0].suite, 'example');
    assert.equal(benchmark.results[0].pass_rate, 0);
    assert.match(readFileSync(path.join(dir, 'benchmark.md'), 'utf8'), /example/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an eval without checks is a missing_checks error, not a crash, and gets one summary line', () => {
  assert.equal(hasChecks(undefined), false);
  assert.equal(hasChecks([]), true);
  const rows = [
    { skill: 's', id: 1, config: 'with_skill', repeat: 1, passed: 0, failed: 0, total: 1, error: MISSING_CHECKS },
    { skill: 's', id: 1, config: 'without_skill', repeat: 1, passed: 0, failed: 0, total: 1, error: MISSING_CHECKS },
    { skill: 's', id: 2, config: 'with_skill', repeat: 1, passed: 0, failed: 0, total: 1, error: MISSING_CHECKS },
    { skill: 's', id: 3, config: 'with_skill', repeat: 1, passed: 1, failed: 0, total: 1, casePassed: true },
  ];
  const [suite] = makeBenchmark(rows, { harness: 'opencode', gitSha: 'abc' }).results;
  assert.deepEqual([suite.passed, suite.failed, suite.errors, suite.total], [1, 0, 2, 3]);
  assert.equal(suite.cases.find((c) => c.id === 1).reason, 'repeat 1: missing_checks');
  assert.equal(missingChecksSummary(rows), '2 evals have no checks — add EV-C1 checks');
  assert.equal(missingChecksSummary(rows.slice(2)), '1 eval has no checks — add EV-C1 checks');
  assert.equal(missingChecksSummary(rows.slice(3)), null);
});
