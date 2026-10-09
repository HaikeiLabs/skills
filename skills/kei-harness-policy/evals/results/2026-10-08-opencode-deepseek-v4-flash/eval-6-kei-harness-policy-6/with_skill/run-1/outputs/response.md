Credential resolution for `shell:` dst commands works through `kei-proxy` using `kei://` references — the secret is never embedded in the policy, bundle, or native config.

Here's the flow:

1. **Policy declares a `kei://` reference** (e.g. `kei://workspace/credential/github-token`) instead of a raw secret.
2. **At runtime**, when the harness executes the matched `shell:` command, `kei-proxy` resolves the reference by fetching the named credential from the Kei control plane and **injects it into the agent's environment** (e.g. as `GITHUB_TOKEN=gho_***`) before the command executes.
3. **The agent never reads or stores** the raw credential value — it only sees the injected environment variable.

The reference syntax is `kei://workspace/credential/<name>` (workspace-scoped) or `kei://installation/credential/<name>` (installation-scoped). Same mechanism as governed connector calls in `connector invoke`.
