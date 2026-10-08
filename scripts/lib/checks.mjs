/** Deterministic, case-insensitive checks for skill eval expectations. */

export const CHECK_KEYS = Object.freeze(['contains_all', 'contains_any', 'regex', 'not_contains']);

export function validateChecks(checks, expectations, { strict = false } = {}) {
  const errors = [];
  if (checks === undefined) {
    if (strict) errors.push('checks are required in strict mode');
    return errors;
  }
  if (!Array.isArray(checks)) return ['checks must be an array'];
  if (checks.length !== expectations.length) errors.push(`checks must contain exactly ${expectations.length} entries`);
  checks.forEach((check, index) => {
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
      errors.push(`check ${index + 1} must be an object`);
      return;
    }
    if (typeof check.text !== 'string' || check.text !== expectations[index]) {
      errors.push(`check ${index + 1} text must match its expectation verbatim`);
    }
    const keys = CHECK_KEYS.filter((key) => Object.hasOwn(check, key));
    if (keys.length !== 1) {
      errors.push(`check ${index + 1} must contain exactly one check key`);
      return;
    }
    if (Object.keys(check).some((key) => key !== 'text' && !CHECK_KEYS.includes(key))) {
      errors.push(`check ${index + 1} has unexpected fields`);
      return;
    }
    const key = keys[0];
    const value = check[key];
    if (key === 'regex') {
      if (typeof value !== 'string' || !value) errors.push(`check ${index + 1} regex must be a non-empty string`);
      else {
        try { new RegExp(value, 'i'); } catch { errors.push(`check ${index + 1} has an invalid regex`); }
      }
    } else if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || !item)) {
      errors.push(`check ${index + 1} ${key} must be a non-empty array of non-empty strings`);
    }
  });
  return errors;
}

// An eval without deterministic checks cannot be graded. It is recorded as a
// benchmark error with this reason instead of failing the whole run.
export const MISSING_CHECKS = 'missing_checks';

export function hasChecks(checks) {
  return checks !== undefined && checks !== null;
}

export function missingChecksSummary(results) {
  const evals = new Set(results.filter((r) => r.error === MISSING_CHECKS).map((r) => `${r.skill}#${r.id}`));
  if (!evals.size) return null;
  return `${evals.size} eval${evals.size === 1 ? ' has' : 's have'} no checks — add EV-C1 checks`;
}

export function gradeChecks(expectations, checks, response) {
  const errs = validateChecks(checks, expectations);
  if (errs.length) throw new Error(errs.join('; '));
  const text = response.toLowerCase();
  const items = checks.map((check) => {
    const key = CHECK_KEYS.find((candidate) => Object.hasOwn(check, candidate));
    const value = check[key];
    let passed;
    let evidence;
    if (key === 'contains_all') {
      const missing = value.filter((item) => !text.includes(item.toLowerCase()));
      passed = missing.length === 0;
      evidence = passed ? `Found all: ${value.join(', ')}` : `Missing: ${missing.join(', ')}`;
    } else if (key === 'contains_any') {
      const found = value.filter((item) => text.includes(item.toLowerCase()));
      passed = found.length > 0;
      evidence = passed ? `Found: ${found.join(', ')}` : `None found: ${value.join(', ')}`;
    } else if (key === 'regex') {
      const match = response.match(new RegExp(value, 'i'));
      passed = Boolean(match);
      evidence = match ? `Matched: ${match[0]}` : `No match for /${value}/i`;
    } else {
      const found = value.filter((item) => text.includes(item.toLowerCase()));
      passed = found.length === 0;
      evidence = passed ? `Absent: ${value.join(', ')}` : `Found forbidden text: ${found.join(', ')}`;
    }
    return { text: check.text, passed, evidence, check };
  });
  const passed = items.filter((item) => item.passed).length;
  return { expectations: items, summary: { passed, failed: items.length - passed, total: items.length, pass_rate: items.length ? passed / items.length : 0 } };
}
