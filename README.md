# JEAN-CLAUDE

**A companion for managing Claude Code profiles and syncing configuration across machines**

## Why?

You've spent hours crafting the perfect `CLAUDE.md`. Your hooks are *chef's kiss*. Your settings are dialed in just right.

Then you sit down at another machine and... nothing. Back to square one. Or you need separate configs for your work and personal Claude accounts, but maintaining them is a pain.

**Jean-Claude fixes that.** It manages multiple Claude Code profiles and optionally syncs everything across machines via Git.

## Quick Start

```bash
# Install globally
npm install -g jean-claude

# Initialize Jean-Claude
jean-claude init

# Create a profile for your work account
jean-claude profile create work

# Launch Claude Code with your work profile
claude-work
```

## Profiles

Profiles let you run multiple Claude Code configurations side by side — one for your Teams account at work, another for your personal Max subscription, and so on.

```bash
# Create a profile (interactive — prompts for sharing preferences)
jean-claude profile create work

# Create non-interactively
jean-claude profile create work --yes --shell .zshrc

# List your profiles
jean-claude profile list

# Launch Claude Code with a profile
claude-work

# Re-create symlinks if something breaks
jean-claude profile refresh work

# Delete a profile
jean-claude profile delete work
```

### How profiles work

Your main `~/.claude/` stays the source of truth. Profile directories (`~/.claude-<name>/`) are lightweight — they symlink back to your shared files:

| Always shared (symlinked) | Optionally shared         | Profile-specific       |
|---------------------------|---------------------------|------------------------|
| `settings.json`           | `CLAUDE.md`               | Authentication/session |
| `hooks/`                  | `statusline.sh`           |                        |
| `agents/`                 |                            |                        |
| `skills/`                 |                            |                        |
| `plugins/`                |                            |                        |
| `keybindings.json`        |                            |                        |

During profile creation, you're prompted whether to share `CLAUDE.md` and `statusline.sh` or keep them independent per profile. You can also use flags:

```bash
# Share both
jean-claude profile create work --share-claude-md --share-statusline

# Keep both independent
jean-claude profile create work --no-share-claude-md --no-share-statusline
```

Change a setting or add a hook in your main config, and all profiles see it immediately.

Profiles work independently of syncing — you can use them without setting up Git.

## Syncing

Syncing is optional and uses Git to keep your configuration in sync across machines.

### What gets synced?

- `CLAUDE.md` — Your custom instructions
- `settings.json` — Your preferences
- `hooks/` — Your automation scripts
- `skills/` — Your custom skills
- `agents/` — Your custom agents
- `plugins/` — Your plugins
- `keybindings.json` — Your keyboard shortcuts
- `statusline.sh` — Your statusline configuration
- Profile definitions — So profiles carry over to other machines

### Commands

```bash
# Set up syncing (during init or later)
jean-claude sync setup

# Push your config to Git
jean-claude sync push

# Pull config on another machine
jean-claude sync pull

# Check sync status
jean-claude sync status
```

### Typical workflow

```bash
# Machine 1: Initialize and push
jean-claude init
jean-claude profile create work --yes --shell .zshrc
jean-claude sync push

# Machine 2: Initialize, pull, and go
jean-claude init --sync --url git@github.com:you/claude-config.git
jean-claude sync pull
claude-work  # Profile alias is ready
```

## Command Reference

| Command | Description |
|---------|-------------|
| `jean-claude init` | Initialize Jean-Claude on this machine |
| `jean-claude init --sync --url <repo>` | Initialize with Git syncing |
| `jean-claude init --no-sync` | Initialize without syncing |
| `jean-claude profile create <name>` | Create a new profile |
| `jean-claude profile list` | List all profiles |
| `jean-claude profile delete <name>` | Delete a profile |
| `jean-claude profile refresh <name>` | Refresh profile symlinks |
| `jean-claude sync setup` | Set up Git-based syncing |
| `jean-claude sync push` | Push config to Git |
| `jean-claude sync pull` | Pull config from Git |
| `jean-claude sync status` | Check sync status |

## Development

### Running Tests

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
- Profile creation, symlinks, and duplicate prevention
- File sync and metadata operations
- Error handling and types
- Utility functions

#### Integration Tests

End-to-end tests that simulate real usage with local git repositories and multiple machines:
- **init**: New repos, existing repos, partial recovery, flag combinations
- **profiles**: Create, list, delete, refresh, duplicate prevention, shared/independent CLAUDE.md and statusline.sh
- **sync setup**: Linking to a Git remote, reconfiguration
- **sync push/pull**: Initial files, modifications, hooks, agents, keybindings, statusline
- **sync status**: Clean state, uncommitted changes, diverged state
- **Multi-machine sync**: Bidirectional sync, three-machine convergence
- **Edge cases**: Empty directories, special characters, large files, concurrent modifications, deprecated command stubs

See [tests/README.md](tests/README.md) for more details.

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits between profiles and machines.*
