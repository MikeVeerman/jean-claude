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

## Installation

Choose your preferred method:

### Option 1: Claude Code Plugin (Recommended for Claude Code users)

```bash
# Add the marketplace
/plugin marketplace add MikeVeerman/jean-claude

# Install the plugin
/plugin install jean-claude

# Use with natural language
"Initialize jean-claude with my config repo at git@github.com:YOURUSER/jean-claude-config.git"
"Push my Claude Code config"
"Pull the latest config"
"Check my sync status"
```

### Option 2: Standalone CLI (Works anywhere)

```bash
# Install globally
npm install -g jean-claude

# Verify install
jean-claude --help

# Use the CLI directly
jean-claude init git@github.com:YOURUSER/jean-claude-config.git
jean-claude push
jean-claude pull
jean-claude status
```

### Why Both?

- **Claude Code Plugin**: Natural language interface, seamless integration, Claude can auto-sync
- **Standalone CLI**: Works in CI/CD, scriptable, use outside Claude Code

## Quick Start

```bash
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

## Plugin Architecture

The Claude Code plugin is a thin wrapper that calls the npm package under the hood:

```
┌─────────────────────┐
│  Claude Code Plugin │ ← Natural language interface
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  jean-claude (npm)  │ ← Core functionality
└─────────────────────┘
```

This means:
- Updates to the npm package automatically benefit plugin users
- Both distributions share the same battle-tested code
- You can use whichever interface fits your workflow

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits across multiple machines.*
