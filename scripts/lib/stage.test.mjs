import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isStaged, stageSkill } from './stage.mjs';

function makeSkill(root) {
  const files = ['SKILL.md', 'references/api.md', 'scripts/check.sh', 'evals/evals.json', 'evals/README.md',
    'evals/results/2026-10-01/benchmark.json', 'results/old.json', 'benchmark.md', '.git/HEAD', '.DS_Store'];
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), file);
  }
}

test('staging copies the skill and its references but never evals, results, benchmarks or dotfiles', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'stage-'));
  try {
    const src = path.join(dir, 'skills', 'demo');
    const dest = path.join(dir, 'scratch', '.opencode', 'skills', 'demo');
    makeSkill(src);
    stageSkill(src, dest);
    assert.ok(existsSync(path.join(dest, 'SKILL.md')));
    assert.ok(existsSync(path.join(dest, 'references', 'api.md')));
    assert.ok(existsSync(path.join(dest, 'scripts', 'check.sh')));
    assert.deepEqual(readdirSync(dest).sort(), ['SKILL.md', 'references', 'scripts']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isStaged excludes the answer key wherever it sits', () => {
  for (const rel of ['', 'SKILL.md', 'references/api.md', 'references/evaluation.md']) assert.equal(isStaged(rel), true, rel);
  for (const rel of ['evals', 'evals/evals.json', 'references/evals/x.json', 'results/a.json', 'BENCHMARK.md',
    'benchmark.json', '.git', '.env']) assert.equal(isStaged(rel), false, rel);
});
