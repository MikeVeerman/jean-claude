# Jean-Claude Tests

This directory contains both unit tests and integration tests for jean-claude.

## Test Structure

```
tests/
├── unit/                    # Unit tests (vitest)
│   ├── lib/                # Library module tests
│   │   └── sync.test.ts    # File sync and metadata tests
│   ├── types/              # Type definition tests
│   │   └── index.test.ts   # JeanClaudeError tests
│   └── utils/              # Utility function tests
│       └── logger.test.ts  # Path formatting tests
└── README.md               # This file

../test-integration.sh      # Integration test script (bash)
```

## Running Tests

### Unit Tests

Fast, isolated tests using vitest with mocked dependencies:

```bash
# Run all unit tests
npm run test:unit

# Run in watch mode
npm run test:unit:watch

# Run with coverage
npm run test:coverage
```

### Integration Tests

End-to-end tests using real git operations and file system:

```bash
# Run integration tests
npm run test:integration
```

### All Tests

Run both unit and integration tests:

```bash
npm test
```

## Unit Test Coverage

Currently tested modules:

- ✅ `lib/sync.ts` - File comparison, metadata operations, sync functions
- ✅ `types/index.ts` - JeanClaudeError class and ErrorCode enum
- ✅ `utils/logger.ts` - Path formatting utility

### Modules Not Unit Tested

Some modules are better tested through integration tests rather than unit tests:

- **`lib/git.ts`** - Git operations tested in integration tests with real git repos
- **`lib/paths.ts`** - Platform detection tested in integration tests
- **`commands/*.ts`** - Command logic tested end-to-end in integration tests

## Integration Test Coverage

The `test-integration.sh` script provides comprehensive end-to-end testing:

- **Init Command**: New repos, existing repos, already initialized, invalid remotes
- **Push Command**: Initial files, no changes, modifications, new hooks
- **Pull Command**: Basic sync, overwriting local changes, not initialized
- **Status Command**: Clean state, uncommitted changes, not initialized
- **Sync Scenarios**: Bidirectional sync between simulated machines
- **Edge Cases**: Empty directories, special characters, large files, multiple hooks, concurrent modifications
- **Metadata**: Persistence, timestamp updates

## Testing Philosophy

**Unit tests** for pure logic:
- File hashing and comparison
- Metadata creation and validation
- String formatting
- Error handling

**Integration tests** for system interactions:
- Git operations (clone, commit, push, pull)
- File system operations
- Multi-machine sync workflows
- Real-world edge cases

This hybrid approach ensures fast feedback from unit tests while maintaining confidence that the system works end-to-end.

## Writing New Tests

### Adding Unit Tests

1. Create test file in `tests/unit/<module>/` matching source structure
2. Use vitest for assertions and mocking
3. Follow the pattern:
   ```typescript
   import { describe, it, expect } from 'vitest';

   describe('MyModule', () => {
     it('should do something', () => {
       expect(result).toBe(expected);
     });
   });
   ```

### Adding Integration Tests

Add new test functions to `test-integration.sh` following this pattern:

```bash
test_my_feature() {
    print_test "my feature description"

    # Setup
    # ...

    # Execute
    run_jean_claude "$MACHINE1_DIR" command

    # Assert
    assert_file_exists "/path/to/file"
    assert_file_contains "/path/to/file" "expected content"
}
```

Then add the test to the `run_all_tests` function.
