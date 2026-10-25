import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Eval sandbox: a skill eval measures what the SKILL teaches, so each harness
// may only load the skill and answer. Subagents, search, shell, edits, web
// and any file outside the project skill directory are denied. The sandbox is
// the same for with_skill and without_skill runs; the only difference is
// whether the skill is installed in the scratch project.
//
// Every harness is also isolated from user-level skills (~/.claude/skills,
// ~/.agents/skills, ...). Without that, a machine with the Haikei skills
// installed globally would load them in the "without skill" baseline too,
// and in "with skill" runs could load the installed copy instead of the one
// under test.

// Claude Code built-in tools left available (`--tools`): Skill loads the skill,
// Read opens its reference files. Headless runs deny reads outside the
// scratch project, which holds nothing but the skill.
export const CLAUDE_TOOLS = ['Skill', 'Read'];

// Eval fixtures are the answer key. The runner never stages them (stage.mjs);
// these deny rules are defense in depth in case one is ever present.
export const CLAUDE_SETTINGS = { permissions: { deny: ['Read(**/evals/**)'] } };
export const OPENCODE_READ_DENIED = ['*/evals/*', 'evals/*'];

// Codex features that add tools beyond the read-only shell; each is disabled.
// Codex 0.160 has no per-path read rule: its read-only sandbox can read the
// whole disk, and it loads skills through that shell. It relies on the runner
// never staging evals/ into the scratch project.
export const CODEX_DISABLED_FEATURES = ['multi_agent', 'apps', 'browser_use', 'in_app_browser',
  'computer_use', 'image_generation'];

// OpenCode v2 uses ordered action/resource/effect permission rules. The
// blanket deny is followed by the only capabilities the eval needs: loading
// the skill under test and reading its files, excluding eval fixtures.
export function opencodePermission(skill) {
  return [
    { action: '*', resource: '*', effect: 'deny' },
    { action: 'skill', resource: skill, effect: 'allow' },
    { action: 'read', resource: '.opencode/skills/*', effect: 'allow' },
    { action: 'read', resource: '*/.opencode/skills/*', effect: 'allow' },
    ...OPENCODE_READ_DENIED.map((resource) => ({ action: 'read', resource, effect: 'deny' })),
  ];
}

// The profile's sampling settings (EV-C1 §3). OpenCode sends a model's
// `options` in the body of every chat completions request, and otherwise sends
// no temperature at all, so the server would sample at its own default.
//
// `thinking` turns the model's reasoning on or off through the chat template,
// so the run doesn't depend on the server's default. The servers spell the
// switch differently: Qwen's template reads `enable_thinking`, DeepSeek V4's
// reads `thinking`, and each ignores the other's key, so both are sent.
export function thinkingTemplateKwargs(thinking) {
  return { enable_thinking: thinking, thinking };
}

export function samplingOptions(opts) {
  const options = {};
  if (opts.temperature !== undefined) options.temperature = opts.temperature;
  if (opts.topP !== undefined) options.top_p = opts.topP;
  if (opts.topK !== undefined) options.top_k = opts.topK;
  if (opts.seed !== undefined) options.seed = opts.seed;
  if (opts.thinking !== undefined) options.chat_template_kwargs = thinkingTemplateKwargs(opts.thinking);
  return options;
}

export function opencodeConfig(opts, skill, baseURL) {
  const config = { permissions: opencodePermission(skill) };
  if (opts.modelProfile) {
    const [, ...modelParts] = opts.model.split('/');
    const modelId = modelParts.join('/');
    const options = samplingOptions(opts);
    config.model = opts.model;
    config.provider = { eval: { npm: '@ai-sdk/openai-compatible', name: 'Eval model server',
      options: { baseURL },
      models: { [modelId]: { name: modelId, ...(Object.keys(options).length ? { options } : {}) } } } };
  }
  return config;
}

// Each run also gets its own data home. opencode keeps its session database
// there; with one shared database, concurrent runs fail with "database is
// locked".
export function opencodeEnv(config, cwd) {
  const configHome = path.join(cwd, '.eval-config-home');
  const dataHome = path.join(cwd, '.eval-data-home');
  fs.mkdirSync(configHome, { recursive: true });
  fs.mkdirSync(dataHome, { recursive: true });
  return {
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_CONFIG: '',
    OPENCODE_PURE: '1',
    OPENCODE_DISABLE_AUTOUPDATE: '1',
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: dataHome,
    OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
  };
}

export const HARNESSES = {
  claude: {
    skillDir: '.claude/skills',
    // project,local: load the scratch project's .claude/skills but not ~/.claude.
    command: (prompt, model) => ['claude', ['-p', prompt, '--output-format', 'text',
      '--setting-sources', 'project,local', '--strict-mcp-config',
      '--tools', CLAUDE_TOOLS.join(','), '--settings', JSON.stringify(CLAUDE_SETTINGS),
      ...(model ? ['--model', model] : [])]],
  },
  codex: {
    skillDir: '.agents/skills',
    command: (prompt, model, cwd, outFile) => ['codex', ['exec', '--skip-git-repo-check',
      '--ephemeral', '-s', 'read-only', '-C', cwd, '-o', outFile,
      '-c', 'web_search="disabled"',
      ...CODEX_DISABLED_FEATURES.flatMap((feature) => ['--disable', feature]),
      ...(model ? ['-m', model] : []), prompt]],
    readsOutputFile: true,
    // Codex reads user skills from $HOME/.agents/skills; give it an empty HOME
    // but keep CODEX_HOME so it stays logged in.
    env: () => ({ HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-home-')),
      CODEX_HOME: process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex') }),
  },
  opencode: {
    skillDir: '.opencode/skills',
    command: (prompt, model) => ['opencode', ['run', '--standalone',
      ...(model ? ['-m', model] : []), prompt]],
    // `opencode run` has no tool flags; the sandbox is inline config.
    // The run also ignores the user's opencode setup: an empty config home
    // (no global opencode.json, instructions, external_directory allowlist,
    // skills or plugins), no OPENCODE_CONFIG file, and pure mode (no external
    // plugins). Skip ~/.claude/skills and ~/.agents/skills; .opencode/skills
    // still loads.
    env: (opts, { cwd, skill }) => {
      const envName = opts.baseUrlEnv;
      const baseURL = envName ? process.env[envName] : null;
      if (envName && !baseURL) throw new Error(`model profile requires ${envName}`);
      return opencodeEnv(opencodeConfig(opts, skill, baseURL), cwd);
    },
  },
};
