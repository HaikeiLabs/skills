The `kei` CLI stores credentials in the macOS Keychain, and that dialog appears when it can't find your default login keychain. Try these in order:

1. **Reset default keychain:**
   ```sh
   security default-keychain -s ~/Library/Keychains/login.keychain-db
   ```

2. **If that doesn't work, re-create the login keychain** (Keychain Access → Preferences → Reset My Default Keychain), or delete any stale kei-specific keychain: `rm -f ~/Library/Keychains/kei*`

3. **Clear cached state and re-login:**
   ```sh
   rm -rf ~/.config/kei && kei login
   ```

If it persists, run with debug to see exactly which keychain path it's looking for:
```sh
kei login --verbose
```
