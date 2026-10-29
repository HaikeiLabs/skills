const DEFAULT_PREFLIGHT_TIMEOUT_MS = 10_000;

/** Verify that an OpenAI-compatible endpoint advertises the requested model. */
export async function preflightModel({ model, baseUrl, timeoutMs = DEFAULT_PREFLIGHT_TIMEOUT_MS, fetchImpl = fetch }) {
  const modelsUrl = `${String(baseUrl ?? '').replace(/\/+$/, '')}/models`;
  const wanted = String(model ?? '(unspecified)');
  let found = [];
  let detail = '';
  try {
    if (!baseUrl) throw new Error('base URL is not set');
    const response = await fetchImpl(modelsUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    found = Array.isArray(body?.data)
      ? body.data.map((entry) => entry?.id).filter((id) => typeof id === 'string')
      : [];
    const servedModel = wanted.replace(/^eval\//, '');
    if (found.includes(wanted) || found.includes(servedModel)) return;
    detail = 'requested model is not served';
  } catch (error) {
    detail = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? `request timed out after ${timeoutMs} ms`
      : (error?.message || 'request failed').replace(/[\r\n]+/g, ' ');
  }
  const models = found.length ? found.join(', ') : '(none)';
  throw new Error(`model preflight failed: GET ${modelsUrl}; wanted "${wanted}"; models found: ${models}; ${detail}`);
}
