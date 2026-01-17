---
name: push
description: Push local Claude Code configuration changes to the repository
---

# Jean-Claude Push

Push your local Claude Code configuration changes to your Git repository.

## What This Does

1. Copies current configuration from `~/.claude` to the sync repository
2. Commits the changes
3. Pushes to the remote repository

## Usage

Simply run:

```bash
jean-claude push
```

No arguments needed. The command will:
- Sync `CLAUDE.md`, `settings.json`, and `hooks/` from `~/.claude`
- Create a commit with the changes
- Push to the remote repository

## When to Use

Use `jean-claude push` when you've:
- Updated your `CLAUDE.md` instructions
- Changed settings in `settings.json`
- Added or modified hooks
- Made any configuration changes you want to sync to other machines

## Next Steps

After pushing, you can run `jean-claude pull` on other machines to sync the configuration.
