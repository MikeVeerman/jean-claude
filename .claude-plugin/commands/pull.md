---
name: pull
description: Pull configuration from the repository and apply it locally
---

# Jean-Claude Pull

Pull the canonical Claude Code configuration from your Git repository and apply it to this machine.

## What This Does

1. Pulls the latest configuration from the remote repository
2. Copies the configuration to `~/.claude`
3. Applies the synced settings locally

## Usage

Simply run:

```bash
jean-claude pull
```

No arguments needed. The command will:
- Fetch the latest changes from the remote repository
- Copy `CLAUDE.md`, `settings.json`, and `hooks/` to `~/.claude`
- Override local configuration with the canonical version

## When to Use

Use `jean-claude pull` when you:
- Set up Claude Code on a new machine
- Want to sync configuration changes from another machine
- Need to reset your local config to the canonical version

## Warning

This will override your local `~/.claude` configuration with the version from the repository. Make sure to `jean-claude push` any local changes you want to keep first.

## Check Before Pulling

Run `jean-claude status` to see if there are uncommitted local changes before pulling.
