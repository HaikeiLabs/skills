import fs from 'node:fs';
import path from 'node:path';

// What an eval run may see of a skill: its teaching content only. The eval
// fixtures (evals/: expected_output, checks, prior results) are the answer
// key, so they are never copied into the scratch project, for any harness and
// for both with_skill and without_skill. Result and benchmark files and
// dotfiles (.git, .DS_Store, ...) are left out wherever they sit.
const EXCLUDED_DIRS = new Set(['evals', 'results']);

export function isStaged(relPath) {
  if (!relPath) return true;
  const parts = relPath.split(/[\\/]/);
  return !parts.some((part) => part.startsWith('.') || EXCLUDED_DIRS.has(part)
    || /^benchmark(\.|$)/i.test(part));
}

export function stageSkill(skillSource, dest) {
  fs.cpSync(skillSource, dest, { recursive: true,
    filter: (src) => isStaged(path.relative(skillSource, src)) });
}
