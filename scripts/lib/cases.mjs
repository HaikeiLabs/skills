// --cases <spec> selects which eval cases run, so a suite with more cases than
// one eval job fits can be split by case range (as well as by repeats). The
// spec is eval ids, not positions: "1-8" is every id from 1 to 8, "3,7" is
// those two ids, and "1-5,9" mixes both. Ids may be sparse in evals.json.
//
// The selection is applied before repeats are counted, so N selected cases at
// R repeats are N x R runs.

// Parse a spec into the sorted, de-duplicated case ids. A malformed, empty or
// descending spec is an error: a typo must not silently run the wrong cases.
export function parseCaseSpec(spec) {
  if (typeof spec !== 'string' || spec.trim() === '') {
    throw new Error('--cases needs a case list such as 1-8 or 3,7');
  }
  const ids = new Set();
  for (const part of spec.split(',')) {
    const token = part.trim();
    if (!token) throw new Error(`--cases ${spec}: empty entry in the case list`);
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < from) throw new Error(`--cases ${spec}: ${token} is not an ascending case range`);
      for (let id = from; id <= to; id++) ids.add(id);
    } else if (/^\d+$/.test(token) && Number(token) >= 1) {
      ids.add(Number(token));
    } else {
      throw new Error(`--cases ${spec}: ${token} is not a case id or range`);
    }
  }
  if (!ids.size) throw new Error(`--cases ${spec}: empty case selection`);
  return [...ids].sort((a, b) => a - b);
}

// Render sorted ids back to the canonical spec ("1-5,9-10"), for the benchmark
// output and error messages.
export function formatCaseIds(ids) {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  const parts = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    parts.push(j > i ? `${sorted[i]}-${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return parts.join(',');
}

// Select the cases from one suite, in id order. Every requested id must exist
// in that suite and the selection must not be empty: a range that does not fit
// the suite is a configuration error, never a partial or silent run.
export function selectCases(evals, spec) {
  const wanted = parseCaseSpec(spec);
  const byId = new Map(evals.map((ev) => [ev.id, ev]));
  if (!byId.size) throw new Error(`--cases ${spec}: empty case selection (the suite has no cases)`);
  const unknown = wanted.filter((id) => !byId.has(id));
  if (unknown.length) {
    throw new Error(`--cases ${spec}: no case ${unknown.join(', ')} (cases: ${formatCaseIds([...byId.keys()])})`);
  }
  const selected = wanted.map((id) => byId.get(id));
  if (!selected.length) throw new Error(`--cases ${spec}: empty case selection`);
  return selected;
}
