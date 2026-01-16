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

## Claude Desktop Extension

Jean-Claude is also available as a **Claude Desktop Extension** via the Model Context Protocol (MCP). This allows Claude to sync your configuration automatically without using the CLI.

### Installation as Extension

1. Build the MCP package:
   ```bash
   npm install
   npm run build:mcp
   ```

2. Install in Claude Desktop:
   - Open Claude Desktop
   - Go to Settings > Extensions
   - Click "Install Extension"
   - Select `jean-claude.mcpb`

### Usage in Claude

Once installed, you can ask Claude to manage your configuration sync:

```
"Initialize my config sync with https://github.com/user/my-claude-config.git"
→ Calls sync_init tool

"Sync my Claude configuration from the repo"
→ Calls sync_pull tool

"Push my config changes"
→ Calls sync_push tool

"What's my sync status?"
→ Calls sync_status tool
```

### Available MCP Tools

- **sync_init** - Initialize with a Git repository URL
- **sync_push** - Push local config changes to Git
- **sync_pull** - Pull and apply config from Git
- **sync_status** - Check sync status

### CLI vs Extension

Both methods work independently:

- **CLI**: Run commands manually (`jean-claude push/pull`)
- **Extension**: Ask Claude to sync for you
- Use whichever fits your workflow!

## That's it!

Four commands (or natural language requests). No options. No complexity. Just sync.

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits across multiple machines.*
