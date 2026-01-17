---
name: status
description: Check whether this machine's configuration is in sync
---

# Jean-Claude Status

Check whether this machine's Claude Code configuration is in sync with the repository.

## What This Does

1. Compares local `~/.claude` configuration with the sync repository
2. Shows which files have been modified
3. Indicates if you're ahead, behind, or in sync

## Usage

Simply run:

```bash
jean-claude status
```

No arguments needed. The command will show:
- Files that have been modified locally
- Whether local changes need to be pushed
- Whether remote changes need to be pulled
- Overall sync status

## Example Output

The status command will tell you:
- ✓ In sync - Local and remote are identical
- ⚠ Local changes - You have unpushed changes
- ⚠ Remote changes - Remote has updates you don't have
- ⚠ Diverged - Both local and remote have different changes

## What to Do Next

Based on the status:
- If you have local changes: `jean-claude push`
- If remote has changes: `jean-claude pull`
- If diverged: Decide whether to push (override remote) or pull (override local)
