I need to diagnose first per the skill guardrails. Let me check CLI availability and the installation status before any mutations.
I can't run shell commands in this environment — I don't have a terminal/execution tool available. Here's what the skill says to do step by step, so you can run it yourself:

**1. Diagnose first** (can't skip this per guardrails):
```sh
kei bot status --installation <INSTALLATION_ID>
```

**2. Run `kei bot bind`** — this binds the installation to a specific runtime.

**3. Rotate credential** — the skill warns: *rotation kills the current token immediately.* You'll need an installation ID first. Command:
```sh
kei bot credential --installation <INSTALLATION_ID> --rotate | <destination_command>
```

**4. Restart runtime pod** — the skill warns: *a restart drops in-flight work.* This is a mutation that needs explicit approval after diagnosis.

I need the **installation ID** to proceed. Do you have it? And to be clear — do you confirm you want to proceed with the rotation (killing the current token) and the restart (dropping in-flight work) given the `pending` status? (Per the troubleshooting checklist: *"Do not bind/rotate for pending alone"* — pending usually just means no heartbeat yet.)
