// haikei.eval-benchmark.v1 for skill evals (EV-C1 §5). Each repeat of a case is
// one run, and every count is in runs: passed/failed/errors/total sum the runs
// of the skill's cases, and pass_rate = passed runs / total runs, the average
// over repeats that tool-call evals use. With one repeat a run is a case.
// cases[].passed is true only when every run passed; cases[].runs and
// cases[].passed_runs are additive v1 fields.
// case_filter records the --cases spec this run covered (null when every case
// ran), so a report merge can tell the shards of a suite apart and check that
// together they covered every case.
export function makeBenchmark(results, { harness, modelProfile = null, model = null, repeats = 1, caseFilter = null, gitSha, createdAt = new Date().toISOString() }) {
  const grouped = {};
  for (const row of results) {
    if (row.config !== 'with_skill') continue;
    const cases = grouped[row.skill] ??= new Map();
    const observations = cases.get(row.id) ?? [];
    observations.push(row);
    cases.set(row.id, observations);
  }
  const skillResults = Object.entries(grouped).map(([suite, cases]) => {
    const counts = { passed: 0, failed: 0, errors: 0, total: 0, cases: [] };
    for (const [id, observations] of cases) {
      // A run that never reported back is an error, not a silent skip.
      const missing = Math.max(0, repeats - observations.length);
      const runs = observations.length + missing;
      const passedRuns = observations.filter((row) => !row.error && row.casePassed).length;
      const errorRuns = observations.filter((row) => row.error).length + missing;
      counts.passed += passedRuns;
      counts.errors += errorRuns;
      counts.failed += runs - passedRuns - errorRuns;
      counts.total += runs;
      const reasons = observations.filter((row) => row.error || !row.casePassed)
        .map((row) => `repeat ${row.repeat}: ${row.error || row.reason || 'one or more checks failed'}`);
      if (missing) reasons.push(`expected ${repeats} repeats, got ${observations.length}`);
      counts.cases.push({ id, passed: passedRuns === runs, runs, passed_runs: passedRuns, reason: reasons.join('; ') });
    }
    return { suite, kind: 'skill', passed: counts.passed, failed: counts.failed, errors: counts.errors,
      total: counts.total, pass_rate: counts.total ? counts.passed / counts.total : 0, cases: counts.cases };
  });
  return { schema: 'haikei.eval-benchmark.v1', harness, model_profile: modelProfile,
    model, created_at: createdAt, git_sha: gitSha, case_filter: caseFilter, repeats, results: skillResults };
}

export function belowThreshold(benchmark, threshold) {
  return benchmark.results.filter((result) => result.kind === 'skill' && result.pass_rate < threshold).map((result) => result.suite);
}
