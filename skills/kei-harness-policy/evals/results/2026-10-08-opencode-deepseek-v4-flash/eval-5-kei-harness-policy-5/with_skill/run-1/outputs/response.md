The report-only hook is **proposed in the design (HP-C6 / ADR-029 §4.2) but not implemented**. The skill explicitly says "do not configure it in a production harness until the follow-up ships."

The envisioned mechanism would be a `--policy-mode report-only` flag on `kei-proxy` that makes `authorize` return ALLOW with an audit annotation instead of DENY. Until that ships, the workaround is to list policies (`kei policies list --json`) and manually check what would be denied — the harness always enforces.
