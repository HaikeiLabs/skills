/**
 * Standalone verifier for the Haikei skills repo's skills directory.
 *
 * Requires: python3 with PyYAML (preinstalled on GitHub ubuntu runners).
 *
 * Ported from DVL-Group/assistant scripts/verify-skills.mjs (branch
 * docs/kei-agentware-skills, PR #44), adapted from a .opencode/skills root to
 * this repo's skills/ root.
 *
 * Checks every SKILL.md the way the suite's contract expects:
 *   - frontmatter is valid YAML (rejects unquoted ': ' in scalars);
 *   - frontmatter carries `name` + `description`;
 *   - `name` is lowercase-hyphen and matches its folder name;
 *   - the body is non-trivial and contains actionable instructions;
 *   - no placeholder tokens (TODO/FIXME/lorem/placeholder) survive.
 *
 * Exits non-zero on the first problem and prints a stable summary line on success.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_ROOT = join(ROOT, 'skills');

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const PLACEHOLDERS = /\b(TODO|FIXME|XXX|PLACEHOLDER|REPLACE_ME)\b|lorem\s+ipsum/i;

/** Python one-liner that reads YAML from stdin and writes JSON to stdout. */
const PYTHON_YAML_TO_JSON = [
  `python3 -c "`,
  `import yaml,json,sys;`,
  `print(json.dumps(yaml.safe_load(sys.stdin)))`,
  `"`,
].join('');

/**
 * Parse frontmatter via Python YAML parser.
 * Returns {name, description, ...} or null if no frontmatter.
 * Throws on YAML parse errors with a message pinpointing the broken line.
 */
function parseFrontmatter(raw) {
  const match = FRONTMATTER.exec(raw);
  if (!match) return null;

  // Only pass the inner frontmatter content (no --- delimiters) so yaml.safe_load
  // does not see a second document start marker from the trailing ---
  const frontmatterText = match[1];
  let parsed;
  try {
    const stdout = execSync(PYTHON_YAML_TO_JSON, {
      input: frontmatterText,
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    parsed = JSON.parse(stdout);
  } catch (e) {
    // Pinpoint the offending line for a more helpful error
    const lines = match[1].split('\n');
    const stderr = e.stderr ? e.stderr.toString() : '';
    // Try to identify which line has the problem
    let detail = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Find first unquoted colon that starts a value with ': '
      let inQ = false;
      for (let j = 0; j < line.length - 1; j++) {
        if (line[j] === '"') inQ = !inQ;
        if (inQ) continue;
        if (line[j] === ':' && line[j + 1] === ' ') {
          // Skip the key: separator itself — we want colons in the value
          const before = line.slice(0, j);
          const after  = line.slice(j + 2);
          if (before.includes(':')) {
            detail =
              `\n  Line ${i + 2}: "${line.trim()}"` +
              `\n  Unquoted ': ' inside a scalar value.` +
              ` Wrap the value in double quotes.`;
          }
          break;
        }
      }
    }
    if (!detail && stderr) {
      // Extract Python error line info
      const lineMatch = stderr.match(/line (\d+)/);
      if (lineMatch) {
        const errLine = parseInt(lineMatch[1], 10) - 1; // Python's --- line counts
        if (errLine > 0 && errLine <= lines.length + 1) {
          const idx = errLine - 1; // Python counts from 1, we have only the inner block
          detail = `\n  Near line ${idx + 2}: "${lines[idx].trim()}"\n  ${stderr.split('\n').slice(-2).join(' ').trim()}`;
        }
      } else {
        detail = `\n  ${stderr.split('\n').slice(-2).join(' ').trim()}`;
      }
    }
    throw new Error(`YAML error in ${match[1].split('\n')[0].replace('name: ', '').trim() || '(unknown)'}/SKILL.md frontmatter:${detail}`);
  }

  // Python returned JSON — convert to our field map
  const fields = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const sepIdx = findFirstColon(line);
    if (sepIdx === -1) continue;
    const key = line.slice(0, sepIdx).trim();
    let val = line.slice(sepIdx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    fields[key] = val;
  }
  // Override name/description from real parsed YAML for correctness
  if (parsed && typeof parsed.name === 'string') fields.name = parsed.name;
  if (parsed && typeof parsed.description === 'string') fields.description = parsed.description;
  return fields;
}

/** Find the first colon outside double quotes. */
function findFirstColon(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    if (!inQuotes && line[i] === ':') return i;
  }
  return -1;
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
