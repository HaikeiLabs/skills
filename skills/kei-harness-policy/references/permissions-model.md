# Kei policy model for harnesses

Use the Policies and Groups reference pages in the Kei console for the
human-facing explanation of policy behavior and examples. This page records
only the boundaries relevant to harness command policies.

## Policy rules

- A standing policy applies to a group or autogroup.
- A user or agent receives access through a time-bound access grant.
- Any matching deny wins. The model has no priority field or priority order.
- Principals and targets are typed. Use a supported target scheme, such as
  `shell:`, `skill:`, or `path:` for harness commands.
- A binding wires an installation to a resource or configuration. It does not
  authorize access.

Use the installed CLI's help for command syntax:

```sh
kei policy create -h
kei policy test -h
kei access grant create -h
kei policies import -h
```

An import requires `--src`; supported source patterns are shown by the
installed CLI. Do not copy legacy `src_pattern`, `dst_pattern`, `priority`, or
`permit` policy examples into new configurations.

## Harness command policies

Harness command policies describe commands and resources a desktop harness may
run or access through its native permission configuration. `kei harness sync`
renders applicable policy into the harness configuration; use
`kei harness sync --dry-run` to inspect the result before applying it.

- `shell:<prefix>` describes a command prefix.
- `skill:<name>` describes a skill.
- `path:<pattern>` describes a path target.

A successful sync is not proof that the policy model is correct. Check the
matching group policy in the console and review the dry-run output. Harnesses
continue to apply their own native behavior to requests that are not represented
in their rendered configuration.

## Validation

```sh
kei policy test shell:git --workspace WORKSPACE --as group:GROUP
kei harness sync --dry-run
```

The first command evaluates a target for the supplied group. The second shows
what the installed harness renderer would change. Follow `kei policy test -h`
and `kei harness sync -h` if local CLI syntax differs.
