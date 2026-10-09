Three likely causes, in order of likelihood:

1. **kei-proxy < 0.1.11** — the identity event doesn't emit agent identity. Upgrade to >= 0.1.11.
2. **agentware SDK < 0.4.0** — SDK doesn't expose `link.identity()`. Upgrade to >= 0.4.0.
3. **No agent attached to the installation** — run `kei bot agents add --installation <ID> --agent <AGENT_ID> --default` or attach one in the console.

Check your versions first (`kei --version`, check the kei-proxy binary) and which one applies. If both versions are current, it's #3.
