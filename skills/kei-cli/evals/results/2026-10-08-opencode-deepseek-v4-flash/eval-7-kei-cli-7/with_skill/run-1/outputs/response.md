The `HOME` environment variable is likely overridden (common in sandbox/terminal environments), so macOS can't find `~/Library/Keychains`.

**Fix:** Run `kei` with your real `HOME`, or create a symlink to bridge the sandbox:

```sh
ln -s ~/Library/Keychains /path/to/sandbox/Library/Keychains
```

Click **Cancel** on the dialog — **never "Reset To Defaults"**, as that recreates the login keychain and can break other apps.
