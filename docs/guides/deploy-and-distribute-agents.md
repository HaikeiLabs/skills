# Deploy and distribute governed AI agents

*Part 3 of 3: build, test, deploy.*

You have an agent (Part 1) and a test suite that keeps it honest (Part 2). Now
you need to put it in front of people: a bot in your team's Discord, a coding
agent on every developer's laptop, or both. This guide covers what goes beside
the agent, how its permissions work, and how each user connects their own
accounts.

## The shape of a deployment

Every governed agent runs next to a **Kei runtime**: a small binary called
`kei-proxy`. The runtime holds your installation's credential, keeps a copy of
your workspace policy, makes allow-or-deny decisions locally, runs connector
calls with the right user's credential, and ships audit metadata back. Your
data — provider payloads, results, credentials — stays in your environment.
Kei keeps metadata.

There are two command-line tools, and they're for different people:

- **`kei`** is the admin CLI. A workspace owner or admin runs it after
  `kei login`, which they approve in a browser.
- **`kei-proxy`** is what the runtime runs. It authenticates with the
  installation's credential and never needs a login.

## Step 1: create a runtime installation

An installation is Kei's record of one runtime: one deployment of your agent,
one installation, one credential.

```sh
kei login
kei bot init --platform cli --name "acme-agent"      # or discord, teams, slack, …
kei workspaces list
kei bot credential --installation INSTALLATION_ID --workspace WS | <your secret manager's import command>
```

The credential is shown exactly once. Pipe it straight into your secret
manager; the CLI won't print it to a terminal, on purpose. If you ever need a
new one, that's a rotation, and the running runtime stops working the moment
you rotate. Plan the restart.

## Step 2: run kei-proxy in the container

Put the `kei-proxy` binary in the same image as your agent (it ships with the
`kei` installer; there is no public `kei-proxy` image). Give the agent's
process three environment variables:

```text
KEI_RUNTIME_CONTROL_PLANE_URL=https://app.haikeilabs.com
KEI_RUNTIME_TOKEN=<from your secret manager>
KEI_RUNTIME_VERSION=<your version>
```

The token goes in the environment only: never a command-line argument, a file
in the repository, or a log line. Don't pass an organization or workspace id
anywhere; the token already says which installation and workspace this is.

Then the container's entrypoint does this, in order:

```sh
kei-proxy runtime bootstrap                    # verify the installation
kei-proxy runtime heartbeat --interval 1m &    # keep it marked alive
kei-proxy serve &                              # optional: the local daemon
exec my-agent
```

Check the bootstrap output for a `workspace_id`. If it's missing, the
credential predates workspaces; mint a new one rather than running without
one.

### The daemon and per-user sessions

`kei-proxy serve` runs the runtime as a long-lived daemon on a Unix socket
(`/run/kei-proxy/runtime.sock` on Linux). The socket is mode `0600`, so only
processes running as the same user can reach it. There's no port to expose
and no certificate to rotate. On Kubernetes, share the socket directory
between containers with an `emptyDir`.

One daemon serves many users at once. For each user, the agent opens a
**session** (session routes are authenticated with the runtime token):

```http
PUT /v1/session
{"schema":"kei.session/v2","source":"discord","external_id":"<the user's Discord id>"}

→ 201 {"session_id":"ks_…","user_id":"…","status":"linked","idle_ttl_seconds":1800}
```

Each governed call then names that session in an `X-Kei-Session` header on
`POST /v1/authorize`. The daemon decides it locally, against the policy it
synced, with no round trip to Kei. Each session has its own identity and its
own connector credentials, and nothing is shared between them. Sessions end
on `DELETE /v1/session` or after 30 idle minutes; an expired session id is a
deny, not a fallback.

If your agent uses agentware's `KeiProxyEvaluator` (Part 1), it calls the
`kei-proxy authorize` command instead, which also accepts a session id. Either
way, the decision fails closed.

## Step 3: bind and attach the agent

A runtime can't switch itself on. Once it's heartbeating, an admin binds it
and attaches the agent it serves:

```sh
kei bot bind --installation INSTALLATION_ID
kei bot agents add --installation INSTALLATION_ID --agent AGENT_ID --default
kei bot status --installation INSTALLATION_ID
```

Agents themselves are created in the Kei console. The runtime tells the agent
its identity; there's no agent-id environment variable to set.

## Step 4: connect the harness

**Coding agents on laptops (Claude Code, Codex, OpenCode).** Install the
Haikei skills. In Claude Code that's `/plugin marketplace add
HaikeiLabs/skills` then `/plugin install haikei@haikei`; Codex has the same
two commands under `codex plugin`; for OpenCode, clone the repository and link
the skill folders into its skills directory. Set up the local runtime with
`kei setup` (the token piped in from your secret manager) and `kei runtime
bootstrap`. These harnesses are discovered automatically. One command renders
your Kei policy into the harness's own permission settings:

```sh
kei harness sync --harness claude_code
```

Back up the harness's settings file first; sync overwrites it.

**A chat bot (Discord, Teams, Slack).** Create the installation for that
platform (`kei bot init --platform discord …`) and open one daemon session per
chat user. The first time someone who isn't linked to a Kei user asks for
something governed, the decision is a deny with an **enrollment link**. Send
it to that person in a direct message, never in the channel and never to a
log. Each response mints a fresh link and voids the old one, so always send
the newest. Once they've enrolled, their next request goes through policy like
anyone else's.

**Then prove it fails closed.** Make one permitted, harmless call and one call
no policy allows. The second must be denied without ever reaching the
provider. Until you've seen that deny, the deployment isn't done.

## Step 5: permissions are policies

What the agent may do is decided by your workspace policy at run time. Not by
the prompt, and not by an allow list hard-coded in the harness, which goes
stale on the next deploy and leaves no audit trail.

There are two kinds of policy:

- **Tool-call policies** decide which people and groups may call which tools.
  A common split: everyday tools (filing a bug, searching the wiki or web) for
  the default group; anything that reads or writes company data for admins.
  You manage these in the Kei console or through the Kei API, and manage group
  membership with `kei groups members add`.
- **Harness command policies** decide what a coding agent may run on a
  machine — shell commands, skills, paths:

```sh
kei policies create --workspace WS --name "allow git" \
  --src-pattern "harness:opencode" --dst-pattern "shell:git" --effect permit --priority 100
kei policies create --workspace WS --name "deny curl" \
  --src-pattern "harness:opencode" --dst-pattern "shell:curl" --effect deny --priority 100
```

At equal priority, deny wins. If you already have allow lists in Claude Code,
`kei policies import --from claude` turns them into Kei policies (it's a dry
run until you add `--apply`).

## Step 6: connectors where each user brings their own account

When your agent files a Linear issue or reads a Drive folder, it should do it
as the person who asked: their permissions at the provider, their name in the
provider's history, and their name in your audit log.

```sh
kei connectors create --workspace WS --provider linear --name linear
```

OAuth connectors are **per user** by default. There's nothing for the admin to
connect; the CLI says so: "users connect their own accounts through their chat
harness". The first time a user's request needs Linear, the decision is a
deny with a **connect link**. The agent sends that single-use link to that
user privately. They approve access in the provider, and their next request
goes through.

On the runtime side, the daemon fetches that user's credential when their
session starts and keeps it **in memory, for that session only**. Connector
calls run inside the daemon. No route on the socket ever hands a credential
back to the agent. GitHub, Gmail, Google Drive, and Linear work this way. A
connector that really should use one shared account (a team Drive, say) takes
`--account-model shared`, and the admin connects it once with
`kei connectors reconnect`.

## The checklist

1. Installation created; credential in the secret manager, shown once, never
   copied.
2. `kei-proxy` in the image; bootstrap shows a `workspace_id`; heartbeat
   running.
3. Runtime bound; agent attached.
4. Harness connected; one deny observed.
5. Permissions in policies, not prompts.
6. Connectors per user; links delivered privately.
7. Your Part 2 eval suite green on every model, in CI.

**Previous:** [Part 2 — test your agent with table-test evals](test-agents-with-table-tests.md).
