export function makeBenchmark(results, { harness, modelProfile = null, model = null, repeats = 1, gitSha, createdAt = new Date().toISOString() }) {
  const grouped = {};
  for (const row of results) {
    if (row.config !== 'with_skill') continue;
    const cases = grouped[row.skill] ??= new Map();
    const observations = cases.get(row.id) ?? [];
    observations.push(row);
    cases.set(row.id, observations);
  }
  const skillResults = Object.entries(grouped).map(([suite, cases]) => {
    const counts = { passed: 0, failed: 0, errors: 0, total: cases.size, cases: [] };
    for (const [id, observations] of cases) {
      const errorRows = observations.filter((row) => row.error);
      const allRepeatsPassed = observations.length === repeats && observations.every((row) => !row.error && row.casePassed);
      let reason = '';
      if (errorRows.length) {
        counts.errors += 1;
        reason = errorRows.map((row) => `repeat ${row.repeat}: ${row.error}`).join('; ');
      } else if (allRepeatsPassed) {
        counts.passed += 1;
      } else {
        counts.failed += 1;
        reason = observations.filter((row) => !row.casePassed)
          .map((row) => `repeat ${row.repeat}: ${row.reason || 'one or more checks failed'}`).join('; ');
        if (observations.length !== repeats) reason ||= `expected ${repeats} repeats, got ${observations.length}`;
      }
      counts.cases.push({ id, passed: allRepeatsPassed, reason });
    }
    return { suite, kind: 'skill', passed: counts.passed, failed: counts.failed, errors: counts.errors,
      total: counts.total, pass_rate: counts.total ? counts.passed / counts.total : 0, cases: counts.cases };
  });
  return { schema: 'haikei.eval-benchmark.v1', harness, model_profile: modelProfile,
    model, created_at: createdAt, git_sha: gitSha, repeats, results: skillResults };
}

export function belowThreshold(benchmark, threshold) {
  return benchmark.results.filter((result) => result.kind === 'skill' && result.pass_rate < threshold).map((result) => result.suite);
}
