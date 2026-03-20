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

## Profiles

Got multiple Claude accounts? A Teams account for work and a Max account for personal projects? Jean-Claude can manage separate profiles for each, with shared configuration kept in sync via symlinks.

```bash
# Create a profile
jean-claude profile create work

# This will:
# 1. Create ~/.claude-work/ with symlinks to your shared config
# 2. Add a shell alias: claude-work
# 3. Give you a separate CLAUDE.md for work-specific instructions

# List your profiles
jean-claude profile list

# Launch Claude Code with your work profile
claude-work

# Delete a profile when you're done
jean-claude profile delete work

# Re-create symlinks if something breaks
jean-claude profile refresh work
```

### How profiles work

Your main `~/.claude/` stays the source of truth. Profile directories are lightweight — they symlink back to your shared files:

| Shared (symlinked)  | Profile-specific       |
|---------------------|------------------------|
| `settings.json`     | `CLAUDE.md`            |
| `hooks/`            | Authentication/session |
| `agents/`           |                        |
| `keybindings.json`  |                        |

Change a setting or add a hook in your main config, and all profiles see it immediately. Each profile gets its own `CLAUDE.md` for account-specific instructions.

Profile definitions are stored in the Jean-Claude repo, so they sync across machines with `push` and `pull`.

## That's it!

Simple commands. No complexity. Just sync.

## Development

### Running Tests

Jean-claude has both unit tests and integration tests:

```bash
# Run all tests (unit + integration)
npm test

# Run only unit tests (fast)
npm run test:unit

# Run unit tests in watch mode
npm run test:unit:watch

# Run with coverage report
npm run test:coverage

# Run only integration tests
npm run test:integration
```

#### Unit Tests

Fast, isolated tests for core logic:
- File sync and metadata operations
- Error handling and types
- Utility functions

#### Integration Tests

End-to-end tests that simulate real usage with a local git repository and multiple machines:
- **init command**: New repos, existing repos, already initialized, invalid remotes
- **push command**: Initial files, no changes, modifications, new hooks
- **pull command**: Basic sync, overwriting local changes, not initialized
- **status command**: Clean state, uncommitted changes, not initialized
- **Sync scenarios**: Bidirectional sync between machines
- **Edge cases**: Empty directories, special characters, large files, multiple hooks, concurrent modifications, nested directories
- **Metadata**: Persistence, timestamp updates

See [tests/README.md](tests/README.md) for more details.

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits across multiple machines.*
