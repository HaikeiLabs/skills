I'll start the diagnosis. Let me check the available tooling first.
I don't have a shell in this environment, so I'll walk you through the diagnosis step by step. Here's the plan based on the Kei Setup Doctor skill:

---

**1. Install / verify the Kei CLI**

Check if `kei` is already installed:
```sh
command -v kei && kei --version
```
If missing or outdated:
```sh
curl -fsSL "https://kei-cli-releases.s3.us-east-1.amazonaws.com/kei-cli/install.sh" \
  | sh -s -- -d "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
```

---

**2. Log into the control plane**

```sh
kei login --no-browser
```
This starts a device-code flow — you'll see a URL + verification code. Open the URL in a browser, confirm the code matches, pick the organization, and approve. The account must be an **owner or admin** of the org that owns the installation.

After login, the CLI prints the organization ID — note it for comparison later.

---

**3. Get the installation ID**

The CLI has **no `kei bot list` command** — it cannot enumerate installations. You'll need to find the installation ID from either:
- The Kei control-plane UI (console) → navigate to the installation and copy its ID
- The Kei API (if you have API access)

Do you have a candidate installation ID? If so, I can verify it with:
```sh
kei bot status --installation <ID>
```

If you're not sure, please check the Kei console UI and look for the installation card — the ID is displayed there (it's not secret).

---

**4. AWS checks (once ID is confirmed)**

I'll use the [AWS reference](.opencode/skills/kei-setup-doctor/references/aws.md) to run read-only AWS diagnostics — verify the account, region, and runtime host type (ECS/EKS/EC2) without touching credentials.

---

**Key guardrails I'm following:**
- Read-only throughout — no changes without asking
- Never echo, log, or capture the `KEI_RUNTIME_TOKEN`
- No guessing or probing installation IDs

Can you start with step 1 — check if Kei CLI is installed? Or do you already have a candidate installation ID to verify?
