# PR: Windows Support for Claude Code Profile Management

## Summary

This PR adds full **Windows support** to the Jean-Claude CLI's profile management system, enabling Claude Code profile symlinks, shell aliases, and configuration sync on Windows (PowerShell 5.1 and 7.x).

**Changes**: 8 files, +340 / -62 lines
**Branch**: `feat/windows-support` → `origin/master`

---

## Why

Jean-Claude's profile management (`profile create/list/delete`) was macOS/Linux-only. On Windows, the tool failed silently because:

- The `detectPlatform()` function threw an error for `win32`
- Shell alias generation used Bash-only syntax (`alias name='...'`)
- File symlinks on Windows require Developer Mode or admin privileges — now uses **hardlinks** (`fs.link()`) which require no special privileges
- PowerShell profile paths can be redirected (OneDrive, VS Code custom profile), so writing to the wrong `.ps1` file meant aliases were never loaded

This PR resolves all of the above, making Jean-Claude a **cross-platform** tool.

---

## Changes by File

### `src/lib/profiles.ts` (+237 / -87) — Core Windows support

| Change | Description |
|--------|-------------|
| `getAllPowerShellProfilePaths()` | NEW — Queries both `powershell` (5.1) and `pwsh` (7.x) for their actual `$PROFILE` paths, with fallback to legacy default. Handles OneDrive redirects and VS Code custom profile paths. |
| `createSymlinks()` | CHANGED — Returns `SharedItemResult[]` (with `{ name, method: 'symlink' \| 'link' \| 'copy' }`) instead of `string[]`. On Windows, **files use hardlinks** (`fs.link()`) — no Developer Mode or admin required. Directories always use `junction` symlinks (no admin required). Falls back to `copy` on cross-volume (ENOENT). |
| `createProfile()` | CHANGED — Both `statusline.sh` and `statusline.ps1` are symlinked when `shareStatusline: true` (opt-in, not auto). |
| `getShellAliasLine()` | CHANGED — Detects `.ps1` files and emits PowerShell Function syntax (`function name { $env:CLAUDE_CONFIG_DIR="..."; claude @args }`) instead of Bash alias. |
| `installShellAlias()` / `removeShellAlias()` | CHANGED — On Windows, iterates over ALL PowerShell profiles (PS 5.1 + PS 7.x) instead of just a single `.ps1` file. |
| `getReloadInstruction()` | NEW — Returns `. $PROFILE` for PowerShell, `source ~/.bashrc` for Bash/Zsh. |

### `src/lib/paths.ts` (+11 / -6)

| Change | Description |
|--------|-------------|
| `detectPlatform()` | Returns `'darwin' \| 'linux' \| 'win32'` instead of throwing on `win32`. |
| `detectClaudeConfigDir()` | Skips XDG config path on Windows (Windows doesn't use XDG). |

### `src/types/index.ts` (+1 / -1)

| Change | Description |
|--------|-------------|
| `ConfigPaths.platform` | Type widened to `'darwin' \| 'linux' \| 'win32'`. |

### `src/lib/sync.ts` (+5 / -0)

| Change | Description |
|--------|-------------|
| `FILE_MAPPINGS` | Adds `statusline.ps1` to the sync mappings so it's included in profile sync. |

### `src/commands/profile.ts` (+4 / -2)

| Change | Description |
|--------|-------------|
| Reload instruction | Uses `getReloadInstruction(shellFile)` to show `. $PROFILE` for PowerShell instead of hardcoded `source ~/${shellFile}`. |

### `package.json` (+1 / -1)

| Change | Description |
|--------|-------------|
| Version | `2.0.0` → `2.1.0`. |

### `tests/unit/lib/profiles.test.ts` (+28 / -10)

| Change | Description |
|--------|-------------|
| `detectPlatform` mock | Added to test setup (was missing). |
| `skipIf(isWindows)` | Added to symlink-specific tests (Windows CI requires Developer Mode). |
| `statusline.sh/ps1` tests | Updated to test opt-in via `shareStatusline: true` (no longer auto-symlinked from SHARED_ITEMS). |
| `createSymlinks` return type | Updated to expect `SharedItemResult[]` with `method` field. |

---

## Decisions

### Option A: `shareStatusline` controls both `.sh` and `.ps1` (APPLIED)

Both `statusline.sh` and `statusline.ps1` are symlinked when `shareStatusline: true`. Neither is in `SHARED_ITEMS` (opt-in only).

**Why**: Consistent with the existing `shareClaudeMd` pattern. Users who want Windows statusline support explicitly opt in.

### Option B: Auto-symlink both to SHARED_ITEMS (rejected)

Would have symlinked both statusline files automatically whenever they exist.

**Why rejected**: Inconsistent with `shareClaudeMd` (opt-in), and `statusline.ps1` may not exist on all Windows systems.

---

## Testing

- ✅ Unit tests: `vitest run tests/unit/lib/profiles.test.ts`
- ✅ Unit tests: `vitest run tests/unit/lib/sync.test.ts`
- ⏭️ Manual test on Windows: `node dist/index.js profile create <name>` (verify symlinks + aliases)

---

## Backward Compatibility

- **macOS/Linux**: Zero behavioral changes. All existing profiles continue to work identically.
- **Windows**: New feature — previously would error, now works.
- **API**: `createSymlinks()` return type changed from `string[]` to `SharedItemResult[]` — breaking for direct callers (internal only, no public API).
- **`createProfile()`**: Added `shareStatusline` and `shareClaudeMd` defaults — previously both defaulted to `false`, no change in behavior.

---

## Known Limitations

1. **`execSync` blocking**: `getAllPowerShellProfilePaths()` uses blocking `execSync` calls. On slow systems with OneDrive redirect, this adds ~2-3 seconds. Future: migrate to async `exec()`.
2. **Cross-volume fallback**: Hardlinks on Windows only work within the same volume. When source and target are on different drives, files are copied (not hardlinked). The symlink health check in `profile list` will flag copied files as "not a link" — this is expected.
3. **Beta endpoints**: The lifecycle and ext-sync endpoints (mentioned in the original plan) are not included in this PR — they require separate implementation.

---

## Review Checklist

- [ ] Code style matches existing Owner (Mike Veerman) patterns: async/await, fs-extra, JSDoc
- [ ] No breaking changes for existing macOS/Linux users
- [ ] Tests updated for new behavior
- [ ] Version bumped (2.0.0 → 2.1.0)
- [ ] README updated (if needed)
