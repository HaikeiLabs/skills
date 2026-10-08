#!/usr/bin/env node
/**
 * Run each skill's eval cases with and without the skill, grade them, and
 * write a benchmark.
 *
 * For every eval in skills/<skill>/evals/evals.json this:
 *   1. creates two scratch projects: one with the skill installed in the
 *      harness's project skill directory, one without;
 *   2. runs the eval prompt headlessly in each with the chosen harness;
 *   3. applies the fixture's deterministic check for each expectation and
 *      requires every repeat to pass a case;
 *   4. writes response.md + grading.json per run and benchmark.{json,md}, in
 *      the skill-creator layout (eval-N/<config>/run-N/) so its eval viewer
 *      can open the results directly.
 *
 * Unlike the verify-* scripts this calls models, so it is not run in CI.
 * It needs the harness CLI on PATH and logged in.
 *
 * Each harness run is killed after --run-timeout seconds (default: the model
 * profile's run_timeout_seconds, else 600). A killed run is recorded as
 * timed_out in its timing.json and counted as a benchmark error "timeout".
 *
 * Usage:
 *   node scripts/run-evals.mjs [--skill NAME ...] [--harness claude|codex|opencode]
 *                              [--skills-dir DIR] [--out DIR] [--no-baseline]
 *                              [--jobs N] [--model M]
 *                              [--model-profile NAME] [--threshold N] [--repeats N]
 *                              [--run-timeout SECONDS]
 *   node scripts/run-evals.mjs --grade-only DIR    # (re)grade existing DIR/<eval>/<config>/outputs/response.md
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeChecks } from './lib/checks.mjs';
import { makeBenchmark, belowThreshold } from './lib/benchmark.mjs';
import { resolveSkillsDir } from './lib/paths.mjs';
import { parseModelProfile, resolveRunTimeoutSeconds, runCommand, runError, timeoutSummary, timingRecord } from './lib/run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Project-level skill directory each harness discovers from its cwd.
//
// Every harness is also isolated from user-level skills (~/.claude/skills,
// ~/.agents/skills, ...). Without that, a machine with the Haikei skills
// installed globally would load them in the "without skill" baseline too,
// and in "with skill" runs could load the installed copy instead of the one
// under test.
const HARNESSES = {
  claude: {
    skillDir: '.claude/skills',
    // Read-only: evals judge the written answer, and must never run kei,
    // log in, or touch credentials.
    // project,local: load the scratch project's .claude/skills but not ~/.claude.
    command: (prompt, model) => ['claude', ['-p', prompt, '--output-format', 'text',
      '--setting-sources', 'project,local',
      '--disallowedTools', 'Bash', 'Edit', 'Write', 'NotebookEdit', 'WebFetch', 'WebSearch',
      ...(model ? ['--model', model] : [])]],
  },
  codex: {
    skillDir: '.agents/skills',
    command: (prompt, model, cwd, outFile) => ['codex', ['exec', '--skip-git-repo-check',
      '--ephemeral', '-s', 'read-only', '-C', cwd, '-o', outFile,
      ...(model ? ['-m', model] : []), prompt]],
    readsOutputFile: true,
    // Codex reads user skills from $HOME/.agents/skills; give it an empty HOME
    // but keep CODEX_HOME so it stays logged in.
    env: () => ({ HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-home-')),
      CODEX_HOME: process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex') }),
  },
  opencode: {
    skillDir: '.opencode/skills',
    command: (prompt, model, cwd) => ['opencode', ['run', '--dir', cwd,
      ...(model ? ['-m', model] : []), prompt]],
    // `opencode run` has no tool flags; deny the same tools via inline config.
    // Skip ~/.claude/skills and ~/.agents/skills; .opencode/skills still loads.
    env: (opts) => {
      const envName = opts.baseUrlEnv;
      const baseURL = envName ? process.env[envName] : null;
      if (envName && !baseURL) throw new Error(`model profile requires ${envName}`);
      const config = { permission: { bash: 'deny', edit: 'deny', webfetch: 'deny' } };
      if (opts.modelProfile) {
        const [, ...modelParts] = opts.model.split('/');
        const modelId = modelParts.join('/');
        config.model = opts.model;
        config.provider = { eval: { npm: '@ai-sdk/openai-compatible', name: 'Eval model server',
          options: { baseURL }, models: { [modelId]: { name: modelId } } } };
      }
      return {
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: '1',
        OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
      };
    },
  },
};

function parseArgs(argv) {
  const opts = { skills: [], skillsDir: null, harness: 'opencode', out: null, baseline: true, jobs: 4, model: null, modelProfile: null, threshold: 0.9, repeats: 1, repeatsProvided: false, gradeOnly: null, runTimeout: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--skill') opts.skills.push(argv[++i]);
    else if (a === '--skills-dir') opts.skillsDir = argv[++i];
    else if (a === '--harness') opts.harness = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--no-baseline') opts.baseline = false;
    else if (a === '--jobs') opts.jobs = Number(argv[++i]);
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--model-profile') opts.modelProfile = argv[++i];
    else if (a === '--threshold') opts.threshold = Number(argv[++i]);
    else if (a === '--repeats') { opts.repeats = Number(argv[++i]); opts.repeatsProvided = true; }
    else if (a === '--grade-only') opts.gradeOnly = argv[++i];
    else if (a === '--run-timeout') opts.runTimeout = argv[++i];
    else if (a === '-h' || a === '--help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  if (!HARNESSES[opts.harness]) throw new Error(`--harness must be one of ${Object.keys(HARNESSES).join(', ')}`);
  opts.skillsDir = resolveSkillsDir(opts.skillsDir, { root: ROOT });
  if (!Number.isFinite(opts.threshold) || opts.threshold < 0 || opts.threshold > 1) throw new Error('--threshold must be between 0 and 1');
  if (!Number.isInteger(opts.repeats) || opts.repeats < 1) throw new Error('--repeats must be a positive integer');
  if (opts.model && opts.modelProfile) throw new Error('use either --model or --model-profile');
  if (opts.modelProfile && opts.harness !== 'opencode') throw new Error('--model-profile requires --harness opencode');
  let profile = null;
  if (opts.modelProfile) {
    profile = parseModelProfile(fs.readFileSync(path.join(ROOT, 'evals/model-profiles.yaml'), 'utf8'), opts.modelProfile);
    if (!profile) throw new Error(`unknown model profile ${opts.modelProfile}`);
    opts.model = profile.model;
    opts.baseUrlEnv = profile.baseUrlEnv;
  }
  opts.runTimeoutSeconds = resolveRunTimeoutSeconds({ flag: opts.runTimeout, profile: profile?.runTimeoutSeconds });
  return opts;
}

function scratchProject(skill, skillSource, withSkill, harness) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `skill-eval-${skill}-`));
  if (withSkill) {
    const dest = path.join(dir, HARNESSES[harness].skillDir);
    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(skillSource, path.join(dest, skill), { recursive: true });
  }
  return dir;
}

async function answer(skill, prompt, withSkill, opts, runDir) {
  const cwd = scratchProject(skill, path.join(opts.skillsDir, skill), withSkill, opts.harness);
  const outFile = path.join(cwd, 'last-message.md');
  const [cmd, args] = HARNESSES[opts.harness].command(prompt, opts.model, cwd, outFile);
  const res = await runCommand(cmd, args, { cwd, timeoutMs: opts.runTimeoutSeconds * 1000,
    env: HARNESSES[opts.harness].env?.(opts) ?? {} });
  let response = res.stdout;
  if (HARNESSES[opts.harness].readsOutputFile && fs.existsSync(outFile)) {
    response = fs.readFileSync(outFile, 'utf8');
  }
  fs.mkdirSync(path.join(runDir, 'outputs'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'outputs', 'response.md'), response);
  fs.writeFileSync(path.join(runDir, 'timing.json'), JSON.stringify(timingRecord(res, opts.runTimeoutSeconds), null, 2));
  if (res.code !== 0) fs.writeFileSync(path.join(runDir, 'stderr.txt'), res.stderr);
  fs.rmSync(cwd, { recursive: true, force: true });
  // A harness failure (auth, usage limit, crash, timeout) is not a skill
  // failure: report it instead of grading an empty or partial answer.
  const error = runError(res, response);
  if (error) return { error, timedOut: res.timedOut };
  return { response };
}

function grade(expectations, checks, response, runDir) {
  const grading = gradeChecks(expectations, checks, response);
  fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify(grading, null, 2));
  return grading;
}

async function pool(tasks, jobs) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }));
  return results;
}

// Grade responses that already exist, e.g. from a run driven by subagents or
// another harness: DIR/<eval>/eval_metadata.json + DIR/<eval>/<config>/outputs/response.md.
async function gradeExisting(dir, opts) {
  const tasks = [];
  for (const evalName of fs.readdirSync(dir)) {
    const metaPath = path.join(dir, evalName, 'eval_metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    for (const config of fs.readdirSync(path.join(dir, evalName))) {
      const configDir = path.join(dir, evalName, config);
      if (!fs.statSync(configDir).isDirectory()) continue;
      const runDirs = fs.readdirSync(configDir).filter((r) => r.startsWith('run-')).map((r) => path.join(configDir, r));
      for (const runDir of runDirs.length ? runDirs : [configDir]) {
        const responsePath = path.join(runDir, 'outputs', 'response.md');
        if (!fs.existsSync(responsePath)) continue;
        const repeat = Number(runDir.match(/run-(\d+)$/)?.[1] ?? 1);
        tasks.push(async () => {
          process.stderr.write(`grading ${evalName} ${config} repeat ${repeat}\n`);
          const g = grade(meta.assertions, meta.checks, fs.readFileSync(responsePath, 'utf8'), runDir);
          const reason = g.expectations.filter((item) => !item.passed).map((item) => `${item.text}: ${item.evidence}`).join('; ');
          return { skill: meta.skill ?? evalName, id: meta.eval_id, config, repeat, ...g.summary,
            casePassed: g.summary.failed === 0, reason };
        });
      }
    }
  }
  return pool(tasks, opts.jobs);
}

function report(results, out, opts) {
  const errors = results.filter((r) => r.error);
  const benchmark = makeBenchmark(results, { harness: opts.harness, modelProfile: opts.modelProfile,
    model: opts.model, repeats: opts.repeats,
    gitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim() });
  fs.writeFileSync(path.join(out, 'benchmark.json'), JSON.stringify(benchmark, null, 2));

  const lines = [`# Skill eval benchmark (${opts.modelProfile ?? opts.model ?? opts.harness})`, '',
    `Model: ${opts.model ?? 'unspecified'} · Repeats: ${benchmark.repeats} · Threshold: ${opts.threshold}`, '',
    '| Skill | Pass rate | Passed | Failed | Errors | Total |', '| --- | ---: | ---: | ---: | ---: | ---: |'];
  for (const result of benchmark.results) {
    lines.push(`| ${result.suite} | ${Math.round(result.pass_rate * 100)}% | ${result.passed} | ${result.failed} | ${result.errors} | ${result.total} |`);
  }
  fs.writeFileSync(path.join(out, 'benchmark.md'), `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
  console.log(`\nresults: ${out}`);

  const timeouts = timeoutSummary(results, opts.runTimeoutSeconds);
  if (timeouts) console.error(`\n${timeouts}`);
  if (errors.length) {
    console.error(`\n${errors.length} run(s) did not complete (not graded):`);
    for (const e of errors) console.error(`  ${e.skill} #${e.id} ${e.config}: ${e.error}`);
    process.exit(2);
  }

  // Non-zero when a skill's with-skill case pass rate misses the threshold.
  const regressions = belowThreshold(benchmark, opts.threshold);
  if (regressions.length) {
    console.error(`below ${opts.threshold} with the skill: ${regressions.join(', ')}`);
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.gradeOnly) {
    const dir = path.resolve(opts.gradeOnly);
    const results = await gradeExisting(dir, opts);
    if (!opts.repeatsProvided) opts.repeats = Math.max(1, ...results.map((result) => result.repeat ?? 1));
    report(results, dir, opts);
    return;
  }
  if (!fs.existsSync(opts.skillsDir) || !fs.statSync(opts.skillsDir).isDirectory()) {
    throw new Error(`skills directory does not exist: ${opts.skillsDir}`);
  }
  const skills = opts.skills.length
    ? opts.skills
    : fs.readdirSync(opts.skillsDir).filter((d) => fs.existsSync(path.join(opts.skillsDir, d, 'evals', 'evals.json')));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.resolve(opts.out ?? path.join(ROOT, 'evals-out', `${opts.harness}-${stamp}`));
  const configs = opts.baseline ? ['with_skill', 'without_skill'] : ['with_skill'];
  process.stderr.write(`run timeout: ${opts.runTimeoutSeconds}s per harness run\n`);

  const tasks = [];
  let n = 0;
  for (const skill of skills) {
    const skillPath = path.join(opts.skillsDir, skill);
    if (!fs.existsSync(path.join(skillPath, 'evals', 'evals.json'))) {
      throw new Error(`${skill}: missing evals/evals.json under ${opts.skillsDir}`);
    }
    const { evals } = JSON.parse(fs.readFileSync(path.join(skillPath, 'evals', 'evals.json'), 'utf8'));
    for (const ev of evals) {
      const evalDir = path.join(out, `eval-${++n}-${skill}-${ev.id}`);
      fs.mkdirSync(evalDir, { recursive: true });
      fs.writeFileSync(path.join(evalDir, 'eval_metadata.json'), JSON.stringify({
        eval_id: ev.id, eval_name: `${skill}-eval-${ev.id}`, skill, prompt: ev.prompt, assertions: ev.expectations, checks: ev.checks,
      }, null, 2));
      for (const config of configs) {
        for (let repeat = 1; repeat <= opts.repeats; repeat++) {
          tasks.push(async () => {
            const runDir = path.join(evalDir, config, `run-${repeat}`);
            process.stderr.write(`running ${skill} #${ev.id} ${config} repeat ${repeat}\n`);
            const { response, error, timedOut } = await answer(skill, ev.prompt, config === 'with_skill', opts, runDir);
            if (error) return { skill, id: ev.id, config, repeat, passed: 0, failed: 0, total: 1, error, timedOut };
            const grading = grade(ev.expectations, ev.checks, response, runDir);
            const reason = grading.expectations.filter((item) => !item.passed)
              .map((item) => `${item.text}: ${item.evidence}`).join('; ');
            return { skill, id: ev.id, config, repeat, ...grading.summary,
              casePassed: grading.summary.failed === 0, reason };
          });
        }
      }
    }
  }

  report(await pool(tasks, opts.jobs), out, opts);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
