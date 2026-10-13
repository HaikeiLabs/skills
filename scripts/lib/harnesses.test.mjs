import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CLAUDE_SETTINGS, CLAUDE_TOOLS, CODEX_DISABLED_FEATURES, HARNESSES, opencodeConfig } from './harnesses.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseModelProfile } from './run.mjs';

const SKILL = 'kei-openai-backends';
// Tools a skill eval must never use: subagents, search and listing, shell,
// edits, and the web.
const FORBIDDEN = ['task', 'bash', 'edit', 'glob', 'grep', 'list', 'webfetch', 'websearch'];

// opencode 1.18 semantics: rules are flattened in config order, `*` matches
// any characters, and the last matching rule decides. A permission whose last
// rule is a `*` deny is removed from the model's tool list.
function rules(permission) {
  return Object.entries(permission).flatMap(([name, value]) => (typeof value === 'string'
    ? [{ permission: name, pattern: '*', action: value }]
    : Object.entries(value).map(([pattern, action]) => ({ permission: name, pattern, action }))));
}
const wildcard = (input, pattern) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 's').test(input);
const decide = (ruleset, permission, pattern) => ruleset.findLast((r) => wildcard(permission, r.permission) && wildcard(pattern, r.pattern))?.action;
const hidden = (ruleset, permission) => {
  const last = ruleset.findLast((r) => wildcard(permission, r.permission));
  return last?.pattern === '*' && last.action === 'deny';
};

function opencodeEnvFor(cwd) {
  return HARNESSES.opencode.env({}, { cwd, skill: SKILL });
}

test('opencode sandbox hides subagents, search, shell, edit and web tools', () => {
  const ruleset = rules(opencodeConfig({}, SKILL).permission);
  for (const tool of [...FORBIDDEN, 'write', 'todowrite', 'question', 'lsp', 'some_future_tool']) {
    const permission = tool === 'write' ? 'edit' : tool;
    assert.equal(hidden(ruleset, permission), true, `${tool} must be hidden`);
    assert.equal(decide(ruleset, permission, 'anything'), 'deny', `${tool} must be denied`);
  }
  assert.equal(decide(ruleset, 'task', 'explore'), 'deny');
  assert.equal(decide(ruleset, 'external_directory', '/Users/someone/code/repo/file.go'), 'deny');
});

test('opencode sandbox allows only the skill under test and reads inside the skill directory', () => {
  const ruleset = rules(opencodeConfig({}, SKILL).permission);
  assert.equal(hidden(ruleset, 'skill'), false);
  assert.equal(hidden(ruleset, 'read'), false);
  assert.equal(decide(ruleset, 'skill', SKILL), 'allow');
  assert.equal(decide(ruleset, 'skill', 'customize-opencode'), 'deny');
  // read is matched against the path relative to the worktree.
  assert.equal(decide(ruleset, 'read', `.opencode/skills/${SKILL}/references/api.md`), 'allow');
  assert.equal(decide(ruleset, 'read', `private/var/folders/x/T/skill-eval-a/.opencode/skills/${SKILL}/SKILL.md`), 'allow');
  for (const file of ['Users/me/code/haikei/kei/README.md', 'README.md', '.eval-config-home/opencode/opencode.json', '.env']) {
    assert.equal(decide(ruleset, 'read', file), 'deny', file);
  }
});

test('opencode sandbox denies reads of the eval answer key, even inside the skill directory', () => {
  const ruleset = rules(opencodeConfig({}, SKILL).permission);
  for (const file of [`.opencode/skills/${SKILL}/evals/evals.json`,
    `private/var/folders/x/T/skill-eval-a/.opencode/skills/${SKILL}/evals/evals.json`,
    `.opencode/skills/${SKILL}/evals/results/benchmark.json`,
    `Users/me/code/haikei/skills/skills/${SKILL}/evals/evals.json`]) {
    assert.equal(decide(ruleset, 'read', file), 'deny', file);
  }
  assert.equal(decide(ruleset, 'read', `.opencode/skills/${SKILL}/SKILL.md`), 'allow');
});

test('opencode runs with_skill and without_skill under the same sandbox, isolated from user config', () => {
  const dirs = [mkdtempSync(path.join(tmpdir(), 'sandbox-a-')), mkdtempSync(path.join(tmpdir(), 'sandbox-b-'))];
  try {
    const [a, b] = dirs.map(opencodeEnvFor);
    assert.equal(a.OPENCODE_CONFIG_CONTENT, b.OPENCODE_CONFIG_CONTENT);
    for (const [env, cwd] of [[a, dirs[0]], [b, dirs[1]]]) {
      assert.equal(env.XDG_CONFIG_HOME, path.join(cwd, '.eval-config-home'));
      assert.ok(statSync(env.XDG_CONFIG_HOME).isDirectory());
      // Per-run session database: a shared one fails concurrent runs with
      // "database is locked".
      assert.equal(env.XDG_DATA_HOME, path.join(cwd, '.eval-data-home'));
      assert.ok(statSync(env.XDG_DATA_HOME).isDirectory());
      assert.equal(env.OPENCODE_CONFIG, '');
      assert.equal(env.OPENCODE_PURE, '1');
      assert.equal(env.OPENCODE_DISABLE_EXTERNAL_SKILLS, '1');
      assert.equal(env.OPENCODE_DISABLE_CLAUDE_CODE_SKILLS, '1');
    }
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
});

test('claude runs with only Skill and Read, no user settings and no MCP servers', () => {
  const [cmd, args] = HARNESSES.claude.command('prompt', null);
  assert.equal(cmd, 'claude');
  assert.deepEqual(CLAUDE_TOOLS, ['Skill', 'Read']);
  assert.equal(args[args.indexOf('--tools') + 1], 'Skill,Read');
  assert.equal(args[args.indexOf('--setting-sources') + 1], 'project,local');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.deepEqual(JSON.parse(args[args.indexOf('--settings') + 1]), CLAUDE_SETTINGS);
  assert.ok(CLAUDE_SETTINGS.permissions.deny.includes('Read(**/evals/**)'));
});

test('codex runs read-only with web search, subagents and browsing disabled', () => {
  const [cmd, args] = HARNESSES.codex.command('prompt', null, '/tmp/x', '/tmp/x/out.md');
  assert.equal(cmd, 'codex');
  assert.equal(args[args.indexOf('-s') + 1], 'read-only');
  assert.ok(args.includes('web_search="disabled"'));
  const disabled = args.flatMap((arg, i) => (arg === '--disable' ? [args[i + 1]] : []));
  assert.deepEqual(disabled, CODEX_DISABLED_FEATURES);
  assert.ok(disabled.includes('multi_agent'));
});

// opencode 1.18 puts a model's `options` in the body of every chat completions
// request; without them it sends no temperature and the server samples at its
// default. The profile's sampling and thinking switch must reach that config.
test('a model profile sends its sampling and thinking switch with every opencode request', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const yaml = readFileSync(path.join(root, 'evals/model-profiles.yaml'), 'utf8');
  const cwd = mkdtempSync(path.join(tmpdir(), 'sampling-'));
  const saved = process.env.EVAL_DEEPSEEK_BASE_URL;
  process.env.EVAL_DEEPSEEK_BASE_URL = 'http://model.invalid/v1';
  const configs = {};
  try {
    for (const name of ['deepseek-v4-flash', 'qwen3.8-27b']) {
      const profile = parseModelProfile(yaml, name);
      const opts = { modelProfile: name, model: profile.model, baseUrlEnv: 'EVAL_DEEPSEEK_BASE_URL',
        temperature: profile.temperature, topP: profile.topP, topK: profile.topK, seed: profile.seed,
        thinking: profile.thinking };
      const config = JSON.parse(HARNESSES.opencode.env(opts, { cwd, skill: SKILL }).OPENCODE_CONFIG_CONTENT);
      const modelId = profile.model.split('/').slice(1).join('/');
      assert.equal(config.model, profile.model);
      configs[name] = config.provider.eval.models[modelId];
    }
    const thinkingOn = { enable_thinking: true, thinking: true };
    assert.deepEqual(configs['deepseek-v4-flash'], { name: 'deepseek-ai/DeepSeek-V4-Flash', options: { temperature: 0, seed: 42,
      chat_template_kwargs: thinkingOn } });
    assert.deepEqual(configs['qwen3.8-27b'], { name: 'qwen3.8-27b', options: { temperature: 0.6, top_p: 0.95, top_k: 20,
      seed: 42, chat_template_kwargs: thinkingOn } });
    // No sampling fields in the profile: no options, the old behaviour.
    const bare = opencodeConfig({ modelProfile: 'x', model: 'eval/m' }, SKILL, 'http://model.invalid/v1');
    assert.deepEqual(bare.provider.eval.models.m, { name: 'm' });
    // thinking: false sends the off switch under both template keys.
    const off = opencodeConfig({ modelProfile: 'x', model: 'eval/m', thinking: false }, SKILL, 'http://model.invalid/v1');
    assert.deepEqual(off.provider.eval.models.m,
      { name: 'm', options: { chat_template_kwargs: { enable_thinking: false, thinking: false } } });
  } finally {
    if (saved === undefined) delete process.env.EVAL_DEEPSEEK_BASE_URL;
    else process.env.EVAL_DEEPSEEK_BASE_URL = saved;
    rmSync(cwd, { recursive: true, force: true });
  }
});
