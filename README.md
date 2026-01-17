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

## That's it!

Four commands. No options. No complexity. Just sync.

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
