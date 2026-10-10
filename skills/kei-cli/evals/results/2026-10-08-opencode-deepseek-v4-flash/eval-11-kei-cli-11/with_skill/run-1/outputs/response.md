Based on the skill, here's the two-command sequence:

**1. Create** (pipe the key from your secret manager):

```sh
<secret-manager-read-command> | kei model-profiles create \
  --workspace Main \
  --agent 3f2c9a1e-0000-4000-8000-000000000001 \
  --display-name "vLLM spark" \
  --endpoint https://spark.example.ts.net/v1 \
  --default-model team-default \
  --auth-type api_key
```

The API key is read from stdin (sealed and routed to the agent's runtimes). The `create` command both creates the profile and assigns it to the agent when `--agent` is provided.

**2. Verify** (optional):

```sh
kei model-profiles get "vLLM spark" --workspace Main
kei model-profiles assignment --workspace Main --agent 3f2c9a1e-0000-4000-8000-000000000001
kei model-profiles readiness "vLLM spark" --workspace Main
```

Replace `<secret-manager-read-command>` with whatever your secret manager uses (e.g. `pass show kei/vllm-spark`, `op read op://...`, `aws secretsmanager get-secret-value --secret-id ... --query SecretString --output text`).
