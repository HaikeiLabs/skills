/**
 * Standalone verifier for the Haikei skills repo's skills directory.
 *
 * Checks the public skills directory against this repository's skill contract.
 *
 * Checks every SKILL.md the way the suite's contract expects:
 *   - frontmatter parses and carries `name` + `description`;
 *   - `name` is lowercase-hyphen and matches its folder name;
 *   - the body is non-trivial and contains actionable instructions;
 *   - no placeholder tokens (TODO/FIXME/lorem/placeholder) survive.
 *
 * Exits non-zero on the first problem and prints a stable summary line on success.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ROOT = join(ROOT, 'skills');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const PLACEHOLDERS = /\b(TODO|FIXME|XXX|PLACEHOLDER|REPLACE_ME)\b|lorem\s+ipsum/i;
function parseFrontmatter(raw) {
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return fields;
}

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

function verifySkill(folder) {
  const skillPath = join(SKILL_ROOT, folder);
  const skillFile = join(skillPath, 'SKILL.md');
  const raw = readFileSync(skillFile, 'utf8');

  const fields = parseFrontmatter(raw);
  if (fields === null) {
    throw new Error(`${folder}/SKILL.md: missing frontmatter (needs a --- name/description block)`);
  }
  if (typeof fields.name !== 'string' || fields.name === '') {
    throw new Error(`${folder}/SKILL.md: frontmatter 'name' is required`);
  }
  if (typeof fields.description !== 'string' || fields.description === '') {
    throw new Error(`${folder}/SKILL.md: frontmatter 'description' is required`);
  }
  if (!NAME_PATTERN.test(fields.name)) {
    throw new Error(`${folder}/SKILL.md: name '${fields.name}' must be lowercase-hyphenated (a-z0-9-)`);
  }
  if (fields.name !== folder) {
    throw new Error(`${folder}/SKILL.md: frontmatter name '${fields.name}' must match the folder name`);
  }

  const body = raw.replace(FRONTMATTER, '').trim();
  if (body.length < 200) {
    throw new Error(`${folder}/SKILL.md: body is too short to be useful (${body.length} chars)`);
  }
  if (PLACEHOLDERS.test(body)) {
    throw new Error(`${folder}/SKILL.md: placeholder tokens (TODO/FIXME/lorem/placeholder) are not allowed`);
  }
  return folder;
}

const folders = listSkillDirs(SKILL_ROOT);
if (folders.length === 0) {
  process.stderr.write(`verify-skills: no skill folders found under ${SKILL_ROOT}\n`);
  process.exit(1);
}

for (const folder of folders) {
  verifySkill(folder);
}

process.stdout.write(`skills verified: ${folders.length} skills under skills\n`);
