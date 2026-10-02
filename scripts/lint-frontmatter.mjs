/**
 * Extract SKILL.md frontmatter blocks and run yamllint on them.
 *
 * Usage: node scripts/lint-frontmatter.mjs
 *
 * Reads every skills/<name>/SKILL.md, extracts the YAML frontmatter (between ---
 * delimiters), writes each to a temp file named after the skill, runs
 * yamllint with the repo's .yamllint config, and exits non-zero if any
 * file fails.
 */

import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ROOT = join(ROOT, 'skills');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function listSkillDirs(root) {
  let names = [];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  return names
    .filter((name) => statSync(join(root, name)).isDirectory())
    .filter((name) => !name.startsWith('.'))
    .sort();
}

const tmpDir = mkdtempSync(join(tmpdir(), 'skill-frontmatter-'));
const tmpFiles = [];
let exitCode = 0;

const folders = listSkillDirs(SKILL_ROOT);
for (const folder of folders) {
  const skillFile = join(SKILL_ROOT, folder, 'SKILL.md');
  const raw = readFileSync(skillFile, 'utf8');
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    process.stderr.write(`SKIPPED ${folder}/SKILL.md: no frontmatter found\n`);
    continue;
  }

  const tmpFile = join(tmpDir, `${folder}.yaml`);
  // Ensure trailing newline so yamllint doesn't flag new-line-at-end-of-file
  writeFileSync(tmpFile, match[1] + '\n', 'utf8');
  tmpFiles.push(tmpFile);
}

if (tmpFiles.length === 0) {
  process.stderr.write('lint-frontmatter: no frontmatter blocks found\n');
  process.exit(0);
}

try {
  execSync(
    `yamllint -c ${ROOT}/.yamllint.yml ${tmpFiles.map(f => `"${f}"`).join(' ')}`,
    { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT },
  );
} catch (e) {
  exitCode = e.status || 1;
}

// Cleanup
for (const f of tmpFiles) {
  try { rmSync(f); } catch { /* ignore */ }
}
try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }

process.exit(exitCode);
