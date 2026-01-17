# JEAN-CLAUDE

**A companion for syncing Claude Code configuration across machines**

## Why?

You've spent hours crafting the perfect `CLAUDE.md`. Your hooks are *chef's kiss*. Your settings are dialed in just right.

Then you sit down at another machine and... nothing. Back to square one.

**Jean-Claude fixes that.** It syncs your Claude Code configuration across all your machines using Git.

## What gets synced?

- `CLAUDE.md` - Your custom instructions
- `settings.json` - Your preferences
- `hooks/` - Your automation scripts
- `skills/` - Your custom skills

## Quick Start

```bash
# Install globally
npm install -g jean-claude

# Verify install
jean-claude --help

# Initialize Jean-Claude and link to your config repo
jean-claude init git@github.com:YOURUSER/jean-claude-config.git

# Make edits in ~/.claude, then push them
jean-claude push

# Pull the canonical config and apply it locally
jean-claude pull

# Check whether this machine is in sync
jean-claude status
```

## That's it!

Four commands. No options. No complexity. Just sync.

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits across multiple machines.*
