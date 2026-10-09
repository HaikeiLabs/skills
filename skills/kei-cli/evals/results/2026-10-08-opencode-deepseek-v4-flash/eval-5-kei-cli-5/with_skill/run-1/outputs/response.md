That's the wrong tool. The `kei` CLI is for platform **admins** to manage installations, policies, etc. An agent at runtime never calls `kei` — it calls `kei-proxy authorize` to check if a given action (like opening a PR) is permitted. The per-call check is:

```
kei-proxy authorize --src-pattern <tool-name> --dst-pattern "git:pr:open"
```

For the full workflow, load the `kei-proxy` skill.
