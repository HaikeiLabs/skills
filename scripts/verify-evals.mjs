/**
 * Validate the portable, human-readable eval cases carried by each skill.
 *
 * These fixtures follow the Agent Skills/Skill Creator shape used by the
 * Aspire training repository. They are prompts and acceptance expectations,
 * not fabricated execution results.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ROOT = join(ROOT, 'skills');

function fail(message) {
  process.stderr.write(`verify-evals: ${message}\n`);
  process.exit(1);
}

const skills = readdirSync(SKILL_ROOT)
  .filter((name) => statSync(join(SKILL_ROOT, name)).isDirectory())
  .filter((name) => !name.startsWith('.'))
  .sort();

if (skills.length === 0) fail('no skill folders found');

for (const skill of skills) {
  const path = join(SKILL_ROOT, skill, 'evals', 'evals.json');
  if (!existsSync(path)) fail(`${skill}: missing evals/evals.json`);

  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`${skill}: invalid JSON (${error.message})`);
  }

  if (document.skill_name !== skill) {
    fail(`${skill}: skill_name must match the folder name`);
  }
  if (!Array.isArray(document.evals) || document.evals.length < 2) {
    fail(`${skill}: evals must contain at least two cases`);
  }

  const ids = new Set();
  for (const test of document.evals) {
    if (!Number.isInteger(test.id) || ids.has(test.id)) {
      fail(`${skill}: eval ids must be unique integers`);
    }
    ids.add(test.id);
    if (typeof test.prompt !== 'string' || test.prompt.trim() === '') {
      fail(`${skill}: every eval needs a prompt`);
    }
    if (typeof test.expected_output !== 'string' || test.expected_output.trim() === '') {
      fail(`${skill}: every eval needs expected_output`);
    }
    if (!Array.isArray(test.expectations) || test.expectations.length === 0) {
      fail(`${skill}: every eval needs one or more expectations`);
    }
  }
}

process.stdout.write(`eval fixtures verified: ${skills.length} skills\n`);
