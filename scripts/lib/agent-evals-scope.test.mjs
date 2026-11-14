// Tests for the agent-evals scope step: the script between
// "BEGIN agent-evals scope" and "END agent-evals scope" in
// .github/workflows/agent-evals.yaml, run here against a throwaway git
// repository the way actions/github-script runs it.
//
// The case of interest: a skill suite with more cases than a profile's
// shard_runs. One repeat of it cannot be split by repeats, so the scope step
// splits it by case range (the pinned runner's --cases) instead of running it
// whole and overrunning the 30-minute pull request job.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const PROFILES = ['glm-5.3-flash', 'qwen3.8-27b'];

function scopeScript() {
  const text = fs.readFileSync(path.join(root, '.github/workflows/agent-evals.yaml'), 'utf8');
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.includes('// BEGIN agent-evals scope'));
  const end = lines.findIndex((l) => l.includes('// END agent-evals scope'));
  assert.ok(start >= 0 && end > start, 'scope markers not found in agent-evals.yaml');
  const indent = lines[start].match(/^ */)[0].length;
  return lines.slice(start, end + 1).map((l) => l.slice(indent)).join('\n');
}

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function writeTree(dir, files) {
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
}

const profilesYaml = (glm, qwen) => [
  'profiles:',
  '  glm-5.3-flash:',
  '    concurrency: 2',
  `    shard_runs: ${glm}`,
  '  qwen3.8-27b:',
  '    concurrency: 1',
  `    shard_runs: ${qwen}`,
  '',
].join('\n');

const skill = (evals) => JSON.stringify({ skill_name: 'x', evals });
const ids = (list) => list.map((id) => (typeof id === 'object' ? id : { id }));
const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

// Runs the scope step for a pull request that changes `changed` (or a
// nightly sweep) and returns its outputs and parsed matrix.
async function runScope({ files, changed = [], event = 'pull_request', repeats = '1', scale = '1',
  skipLong = 'false' }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-evals-scope-'));
  const out = { outputs: {}, failed: null };
  const saved = { ...process.env };
  try {
    git(repo, 'init', '--quiet', '--initial-branch=main');
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'test');
    writeTree(repo, { 'README.md': 'r', ...files });
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '-m', 'base');
    const base = git(repo, 'rev-parse', 'HEAD');
    writeTree(repo, Object.fromEntries(changed.map((f) => [f, 'changed'])));
    git(repo, 'add', '-A');
    git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'change');
    const head = git(repo, 'rev-parse', 'HEAD');
    const pr = event === 'pull_request';
    Object.assign(process.env, {
      EVAL_KIND: 'skill', EVAL_SUITES: 'skills/*', EVAL_GLOBAL_PATHS: '',
      GITHUB_WORKFLOW_REF: 'HaikeiLabs/skills/.github/workflows/agent-evals.yaml@refs/pull/1/merge',
      REPO_DIR: repo, BASE_SHA: pr ? base : '', HEAD_SHA: pr ? head : '', EVENT_NAME: event,
      TUNING: 'false', SKIP_LONG: skipLong, EVAL_PROFILES: JSON.stringify(PROFILES),
      EVAL_REPEATS: repeats, EVAL_SHARD_RUNS: '30', EVAL_SHARD_SCALE: scale,
    });
    const core = {
      setOutput: (k, v) => { out.outputs[k] = v; },
      setFailed: (msg) => { out.failed = msg; },
      info: () => {},
    };
    await new AsyncFunction('github', 'context', 'core', 'require', scopeScript())(
      {}, {}, core, createRequire(import.meta.url));
  } finally {
    process.env = saved;
    fs.rmSync(repo, { recursive: true, force: true });
  }
  out.jobs = (profile) => JSON.parse(out.outputs.matrix).include.filter((j) => j.profile === profile);
  return out;
}

test('scope: a 13-case suite over a profile\'s shard_runs splits into balanced case ranges', async () => {
  const files = {
    'evals/model-profiles.yaml': profilesYaml(8, 8),
    'skills/big/SKILL.md': 'b', 'skills/big/evals/evals.json': skill(ids(range(13))),
    'skills/small/SKILL.md': 's', 'skills/small/evals/evals.json': skill(ids(range(2))),
  };
  const r = await runScope({ files, changed: ['skills/big/SKILL.md', 'skills/small/SKILL.md'] });
  assert.equal(r.failed, null);
  // 13 cases > 8: two ranges of 7 and 6, each alone in its shard; the small
  // suite packs whole, with no case spec.
  assert.deepEqual(r.jobs('glm-5.3-flash').map((j) => [j.suites, j.repeats, j.cases]), [
    ['skills/small', 1, undefined],
    ['skills/big', 1, '1-7'],
    ['skills/big', 1, '8-13'],
  ]);
  assert.ok(r.jobs('glm-5.3-flash').every((j) => j.shards === 3));
  assert.deepEqual(JSON.parse(r.outputs.shards), { 'glm-5.3-flash': 3, 'qwen3.8-27b': 3 });
});

test('scope: a profile\'s own shard_runs sets its range size', async () => {
  const files = {
    'evals/model-profiles.yaml': profilesYaml(6, 8),
    'skills/big/SKILL.md': 'b', 'skills/big/evals/evals.json': skill(ids(range(13))),
  };
  const r = await runScope({ files, changed: ['skills/big/SKILL.md'] });
  assert.deepEqual(r.jobs('glm-5.3-flash').map((j) => j.cases), ['1-5', '6-9', '10-13']);
  assert.deepEqual(r.jobs('qwen3.8-27b').map((j) => j.cases), ['1-7', '8-13']);
});

test('scope: nightly ranges keep every case at all repeats inside the scaled shard', async () => {
  const files = {
    'evals/model-profiles.yaml': profilesYaml(8, 8),
    'skills/big/SKILL.md': 'b', 'skills/big/evals/evals.json': skill(ids(range(30))),
  };
  // Shard 8 x scale 3 = 24 runs; 30 cases x 3 repeats = 90 runs: four ranges
  // of at most 8 cases (24 runs), every case at 3 repeats.
  const r = await runScope({ files, event: 'schedule', repeats: '3', scale: '3' });
  const jobs = r.jobs('glm-5.3-flash');
  assert.equal(jobs.length, 4);
  assert.ok(jobs.every((j) => j.repeats === 3 && j.suites === 'skills/big'));
  const covered = jobs.flatMap((j) => {
    const [from, to] = j.cases.split('-').map(Number);
    assert.ok((to - from + 1) * 3 <= 24, `${j.cases} is over 24 runs`);
    return range(to - from + 1).map((i) => from + i - 1);
  });
  assert.deepEqual(covered, range(30));
});

test('scope: case specs list the real ids, skipping gaps and long cases on a pull request', async () => {
  // No id 5; id 3 is long. On a pull request (SKIP_LONG) the runner drops
  // long cases before --cases, so a spec naming 3 would be an unknown id.
  const evals = ids([1, 2, { id: 3, long: true }, 4, 6, 7, 8, 9, 10, 11]);
  const files = {
    'evals/model-profiles.yaml': profilesYaml(4, 4),
    'skills/big/SKILL.md': 'b', 'skills/big/evals/evals.json': skill(evals),
  };
  const pr = await runScope({ files, changed: ['skills/big/SKILL.md'], skipLong: 'true' });
  // 9 non-long cases over a budget of 4: three ranges of 3.
  assert.deepEqual(pr.jobs('glm-5.3-flash').map((j) => j.cases), ['1-2,4', '6-8', '9-11']);
  const all = await runScope({ files, changed: ['skills/big/SKILL.md'], skipLong: 'false' });
  // 10 cases with the long one: three ranges of 4, 3 and 3.
  assert.deepEqual(all.jobs('glm-5.3-flash').map((j) => j.cases), ['1-4', '6-8', '9-11']);
});

test('scope: a suite whose evals lack integer ids is not case-split', async () => {
  const files = {
    'evals/model-profiles.yaml': profilesYaml(4, 4),
    'skills/big/SKILL.md': 'b',
    'skills/big/evals/evals.json': skill([{ prompt: 'a' }, {}, {}, {}, {}, {}]),
  };
  const r = await runScope({ files, changed: ['skills/big/SKILL.md'] });
  assert.deepEqual(r.jobs('glm-5.3-flash').map((j) => [j.suites, j.cases]), [['skills/big', undefined]]);
});

test('scope: suites that fit keep the existing packing with no case spec', async () => {
  const files = { 'evals/model-profiles.yaml': profilesYaml(8, 8) };
  for (const [name, n] of [['a', 6], ['b', 5], ['c', 2]]) {
    files[`skills/${name}/SKILL.md`] = name;
    files[`skills/${name}/evals/evals.json`] = skill(ids(range(n)));
  }
  const r = await runScope({ files, changed: ['skills/a/SKILL.md', 'skills/b/SKILL.md', 'skills/c/SKILL.md'] });
  assert.deepEqual(r.jobs('glm-5.3-flash').map((j) => [j.suites, j.cases]), [
    ['skills/a', undefined], ['skills/b skills/c', undefined],
  ]);
});
