---
name: init
description: Initialize Jean-Claude and link to your config repository
---

# Jean-Claude Init

Initialize Jean-Claude and link to your Claude Code configuration repository.

## What This Does

1. Sets up Jean-Claude for syncing your Claude Code configuration
2. Links to a Git repository that will store your config
3. Creates the initial sync structure

## Usage

Ask the user for their Git repository URL if they haven't provided it. The repository URL can be in any of these formats:
- SSH: `git@github.com:username/repo.git`
- HTTPS: `https://github.com/username/repo.git`
- Other Git URLs

Once you have the repository URL, run:

```bash
jean-claude init <repository-url>
```

## Example

```bash
jean-claude init git@github.com:username/jean-claude-config.git
```

## What Gets Synced

- `CLAUDE.md` - Your custom instructions
- `settings.json` - Your preferences
- `hooks/` - Your automation scripts

## After Initialization

The user can now:
- `jean-claude push` - Push local changes to the repo
- `jean-claude pull` - Pull config from the repo
- `jean-claude status` - Check sync status
