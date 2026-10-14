# kei-openwebui evals

Eval cases for the kei-openwebui skill (Open WebUI governed by Kei: the Kei
installation, credential, model profile and policies; the image by digest and
UID 10001; tool packs and the boot tool sync; user linking; and
troubleshooting).

## Running

```bash
node scripts/run-evals.mjs --skill kei-openwebui \
  --model-profile deepseek-v4-flash --jobs 1 --repeats 3
node scripts/run-evals.mjs --skill kei-openwebui \
  --model-profile qwen3.8-27b --jobs 1 --repeats 3
```

Results go to `evals-out/` and are not committed; the agent-evals CI gate's
pull request comment is the record.
