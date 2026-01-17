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

The project includes a comprehensive integration test suite that sets up a local git repository and tests all jean-claude functionality:

```bash
# Run integration tests
npm run test:integration

# Or run the test script directly
./test-integration.sh
```

The test suite covers:
- **init command**: New repos, existing repos, already initialized, invalid remotes
- **push command**: Initial files, no changes, modifications, new hooks
- **pull command**: Basic sync, overwriting local changes, not initialized
- **status command**: Clean state, uncommitted changes, not initialized
- **Sync scenarios**: Bidirectional sync between machines
- **Edge cases**: Empty directories, special characters, large files, multiple hooks, concurrent modifications, nested directories
- **Metadata**: Persistence, timestamp updates

The tests create a temporary environment with a bare git repository and simulate multiple machines, then clean up automatically when done.

---

*Named after the famous Belgian martial artist and philosopher, because your config deserves to do the splits across multiple machines.*
