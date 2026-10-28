import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatCaseIds, parseCaseSpec, selectCases } from './cases.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../run-evals.mjs');

const evals = (ids) => ids.map((id) => ({ id, prompt: `case-${id}` }));

test('parses a case range, an id list and both mixed', () => {
  assert.deepEqual(parseCaseSpec('1-8'), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(parseCaseSpec('3,7'), [3, 7]);
  assert.deepEqual(parseCaseSpec('1-5,9'), [1, 2, 3, 4, 5, 9]);
  assert.deepEqual(parseCaseSpec('4-4'), [4]);
  // Ids are sorted and de-duplicated, so a shard spec is canonical.
  assert.deepEqual(parseCaseSpec(' 7, 3 ,3, 3-4 '), [3, 4, 7]);
  assert.equal(formatCaseIds([1, 2, 3, 4, 5, 9, 10]), '1-5,9-10');
  assert.equal(formatCaseIds([3, 7]), '3,7');
});

test('rejects an empty, malformed or descending case selection', () => {
  for (const bad of ['', '   ', '0', '1-0', '5-3', 'a', '1,,2', '1-', '-3', '1.5', '1 - 2']) {
    assert.throws(() => parseCaseSpec(bad), /--cases/, JSON.stringify(bad));
  }
});

test('selects only the requested cases and errors on ids the suite does not have', () => {
  const suite = evals(Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(selectCases(suite, '1-8').map((ev) => ev.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(selectCases(suite, '3,7').map((ev) => ev.id), [3, 7]);
  // Ids are eval ids, so a sparse suite keeps its own ids.
  assert.deepEqual(selectCases(evals([2, 4, 6]), '2,6').map((ev) => ev.id), [2, 6]);
  assert.throws(() => selectCases(suite, '21'), /--cases 21: no case 21 \(cases: 1-20\)/);
  assert.throws(() => selectCases(suite, '1-8,21'), /no case 21/);
  assert.throws(() => selectCases(suite, '5-30'), /no case 21, 22, 23, 24, 25, 26, 27, 28, 29, 30/);
  assert.throws(() => selectCases([], '1'), /empty case selection/);
});

// A 20-case fake suite split into two case ranges, the way the agent-evals
// scope step will shard a suite that is too big for one Qwen job. The fake
// harness answers cases 1-10 and misses 11-20, so the merged score is a real
// merge: 30 of 60 runs passed.
test('a 20-case suite split by --cases runs each range with its repeats and merges to the full score', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'skill-eval-cases-'));
  try {
    const skillsDir = path.join(dir, 'skills');
    const evalsDir = path.join(skillsDir, 'fake-skill', 'evals');
    mkdirSync(evalsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'fake-skill', 'SKILL.md'), '# fake skill\n');
    writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'fake-skill',
      evals: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        prompt: `case-${i + 1}`,
        expected_output: `case-${i + 1}`,
        expectations: [`states case-${i + 1}`],
        checks: [{ text: `states case-${i + 1}`, contains_all: [`case-${i + 1}`] }],
      })),
    }));

    // A scripted opencode: it echoes the prompt for cases 1-10 and misses the rest.
    const binDir = path.join(dir, 'bin');
    mkdirSync(binDir);
    const fake = path.join(binDir, 'opencode');
    writeFileSync(fake, [
      '#!/bin/sh',
      'for prompt do :; done',
      'id=${prompt#case-}',
      'if [ "$id" -le 10 ] 2>/dev/null; then echo "$prompt"; else echo "no match"; fi',
      '',
    ].join('\n'));
    chmodSync(fake, 0o755);

    // --threshold 0 keeps each shard green: the merge below asserts the score.
    const run = (cases, out) => spawnSync(process.execPath, [SCRIPT, '--skills-dir', skillsDir,
      '--skill', 'fake-skill', '--out', out, '--no-baseline', '--repeats', '3', '--cases', cases,
      '--threshold', '0', '--jobs', '2'],
    { encoding: 'utf8', env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` } });

    const firstOut = path.join(dir, 'first');
    const secondOut = path.join(dir, 'second');
    const first = run('1-10', firstOut);
    assert.equal(first.status, 0, first.stderr);
    const second = run('11-20', secondOut);
    assert.equal(second.status, 0, second.stderr);

    const shard = (out) => JSON.parse(readFileSync(path.join(out, 'benchmark.json'), 'utf8'));
    const a = shard(firstOut);
    const b = shard(secondOut);
    // The filter runs before repeats: 10 cases x 3 repeats = 30 runs per shard.
    assert.equal(a.case_filter, '1-10');
    assert.equal(b.case_filter, '11-20');
    assert.equal(a.repeats, 3);
    assert.deepEqual(a.results[0].cases.map((c) => c.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(b.results[0].cases.map((c) => c.id), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.deepEqual([a.results[0].passed, a.results[0].total], [30, 30]);
    assert.deepEqual([b.results[0].passed, b.results[0].total], [0, 30]);
    assert.match(readFileSync(path.join(firstOut, 'benchmark.md'), 'utf8'), /Cases: 1-10/);

    // What a report merge needs: a per-suite total, and the ids each shard ran.
    const merged = a.results.flatMap((r) => [r]).concat(b.results)
      .reduce((acc, r) => {
        const cell = (acc[r.suite] ??= { passed: 0, total: 0, ids: new Set() });
        for (const c of r.cases) {
          assert.equal(cell.ids.has(c.id), false, `case ${c.id} ran in both shards`);
          cell.ids.add(c.id);
        }
        cell.passed += r.passed;
        cell.total += r.total;
        return acc;
      }, {});
    assert.deepEqual([merged['fake-skill'].passed, merged['fake-skill'].total], [30, 60]);
    assert.equal(merged['fake-skill'].passed / merged['fake-skill'].total, 0.5);
    assert.equal(merged['fake-skill'].ids.size, 20);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--cases rejects an unknown or empty selection before running anything', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'skill-eval-cases-bad-'));
  try {
    const skillsDir = path.join(dir, 'skills');
    const evalsDir = path.join(skillsDir, 'fake-skill', 'evals');
    mkdirSync(evalsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'fake-skill', 'SKILL.md'), '# fake skill\n');
    writeFileSync(path.join(evalsDir, 'evals.json'), JSON.stringify({
      skill_name: 'fake-skill',
      evals: evals([1, 2, 3]).map((ev) => ({ ...ev, expected_output: 'x', expectations: ['x'],
        checks: [{ text: 'x', contains_all: ['x'] }] })),
    }));
    const run = (cases) => spawnSync(process.execPath, [SCRIPT, '--skills-dir', skillsDir,
      '--skill', 'fake-skill', '--out', path.join(dir, 'out'), '--no-baseline', '--cases', cases],
    { encoding: 'utf8' });
    for (const [cases, why] of [['9', /no case 9/], ['', /needs a case list/]]) {
      const result = run(cases);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, why);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
