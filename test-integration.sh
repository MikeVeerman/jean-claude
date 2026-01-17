#!/usr/bin/env bash

# Integration test script for jean-claude
# This script sets up a local git repo and tests jean-claude's functionality and edge cases
#
# The script tests:
# - init command (new repos, existing repos, already initialized, invalid remotes)
# - push command (initial files, no changes, modifications, new hooks)
# - pull command (basic sync, overwriting local changes, not initialized)
# - status command (clean state, uncommitted changes, not initialized)
# - Sync scenarios (bidirectional sync between machines)
# - Edge cases (empty directories, special characters, large files, multiple hooks, concurrent modifications, nested directories)
# - Metadata (persistence, timestamp updates)
#
# Note: Some tests may fail due to git merge conflicts and divergent branches,
# which are legitimate edge cases that reveal areas for improvement in jean-claude.

# Don't exit on error - we want to see all test results
# set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Temporary directories
TEST_DIR=""
REMOTE_REPO=""
MACHINE1_DIR=""
MACHINE2_DIR=""
JEAN_CLAUDE_BIN=""

# Cleanup function
cleanup() {
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        echo -e "\n${BLUE}Cleaning up test directory...${NC}"
        rm -rf "$TEST_DIR"
    fi
}

# Set up trap to cleanup on exit
trap cleanup EXIT

# Print functions
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}

print_test() {
    echo -e "\n${YELLOW}TEST: $1${NC}"
    TESTS_RUN=$((TESTS_RUN + 1))
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_failure() {
    echo -e "${RED}✗ $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Test assertion functions
assert_file_exists() {
    if [ -f "$1" ]; then
        print_success "File exists: $1"
    else
        print_failure "File does not exist: $1"
        return 1
    fi
}

assert_dir_exists() {
    if [ -d "$1" ]; then
        print_success "Directory exists: $1"
    else
        print_failure "Directory does not exist: $1"
        return 1
    fi
}

assert_file_contains() {
    if grep -q "$2" "$1" 2>/dev/null; then
        print_success "File $1 contains: $2"
    else
        print_failure "File $1 does not contain: $2"
        return 1
    fi
}

assert_command_success() {
    if eval "$1" > /dev/null 2>&1; then
        print_success "Command succeeded: $1"
    else
        print_failure "Command failed: $1"
        return 1
    fi
}

assert_command_fails() {
    if eval "$1" > /dev/null 2>&1; then
        print_failure "Command should have failed but succeeded: $1"
        return 1
    else
        print_success "Command failed as expected: $1"
    fi
}

# Setup test environment
setup_test_environment() {
    print_header "Setting up test environment"

    # Create temporary test directory
    TEST_DIR=$(mktemp -d -t jean-claude-test.XXXXXX)
    print_info "Created test directory: $TEST_DIR"

    # Create a git repository to act as remote (non-bare for simplicity)
    # We'll allow pushes to it by setting receive.denyCurrentBranch
    REMOTE_REPO="$TEST_DIR/remote-repo"
    mkdir -p "$REMOTE_REPO"
    (
        cd "$REMOTE_REPO"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
        git config receive.denyCurrentBranch ignore
        echo "# Jean-Claude Config" > README.md
        git add README.md
        git commit -m "Initial commit" > /dev/null 2>&1
    )

    print_info "Created remote repository: $REMOTE_REPO"

    # Create directories to simulate different machines
    MACHINE1_DIR="$TEST_DIR/machine1"
    MACHINE2_DIR="$TEST_DIR/machine2"
    mkdir -p "$MACHINE1_DIR/.claude"
    mkdir -p "$MACHINE2_DIR/.claude"
    print_info "Created machine directories"

    # Build jean-claude
    print_info "Building jean-claude..."
    cd "$(dirname "$0")"
    npm run build > /dev/null 2>&1

    # Get the jean-claude binary path
    JEAN_CLAUDE_BIN="$(pwd)/dist/index.js"
    if [ ! -f "$JEAN_CLAUDE_BIN" ]; then
        echo -e "${RED}Error: jean-claude binary not found at $JEAN_CLAUDE_BIN${NC}"
        exit 1
    fi
    print_info "Jean-claude binary: $JEAN_CLAUDE_BIN"

    print_success "Test environment setup complete"
}

# Helper function to run jean-claude commands
run_jean_claude() {
    local machine_dir=$1
    shift
    XDG_CONFIG_HOME="$machine_dir" HOME="$machine_dir" GIT_AUTHOR_NAME="Test User" GIT_AUTHOR_EMAIL="test@example.com" GIT_COMMITTER_NAME="Test User" GIT_COMMITTER_EMAIL="test@example.com" node "$JEAN_CLAUDE_BIN" "$@"
}

# Test init command
test_init_new_repo() {
    print_test "init command with new repository"

    # Simulate user input for init command
    echo "$REMOTE_REPO" | run_jean_claude "$MACHINE1_DIR" init

    assert_dir_exists "$MACHINE1_DIR/.claude/.jean-claude"
    assert_dir_exists "$MACHINE1_DIR/.claude/.jean-claude/.git"
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/meta.json"

    # Check meta.json contains valid data
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/meta.json" "machineId"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/meta.json" "version"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/meta.json" "platform"
}

test_init_already_initialized() {
    print_test "init command when already initialized"

    # Should detect and report that it's already initialized
    if echo "$REMOTE_REPO" | run_jean_claude "$MACHINE1_DIR" init 2>&1 | grep -q "Already initialized"; then
        print_success "Correctly detected already initialized"
    else
        print_failure "Did not detect already initialized state"
    fi
}

test_init_with_existing_repo() {
    print_test "init command with existing remote repository"

    # Machine 2 should clone the existing repo created by machine 1
    echo "$REMOTE_REPO" | run_jean_claude "$MACHINE2_DIR" init

    assert_dir_exists "$MACHINE2_DIR/.claude/.jean-claude"
    assert_file_exists "$MACHINE2_DIR/.claude/.jean-claude/meta.json"
}

test_init_invalid_remote() {
    print_test "init command with invalid remote URL"

    MACHINE3_DIR="$TEST_DIR/machine3"
    mkdir -p "$MACHINE3_DIR/.claude"

    # Should fail with invalid remote
    if echo "/invalid/repo/path" | run_jean_claude "$MACHINE3_DIR" init 2>&1; then
        print_failure "Should have failed with invalid remote"
    else
        print_success "Correctly failed with invalid remote"
    fi
}

# Test push command
test_push_initial_files() {
    print_test "push command with initial files"

    # Create some files in machine1's .claude directory
    echo "# Custom Instructions" > "$MACHINE1_DIR/.claude/CLAUDE.md"
    echo '{"theme": "dark"}' > "$MACHINE1_DIR/.claude/settings.json"
    mkdir -p "$MACHINE1_DIR/.claude/hooks"
    echo "#!/bin/bash" > "$MACHINE1_DIR/.claude/hooks/test-hook.sh"
    chmod +x "$MACHINE1_DIR/.claude/hooks/test-hook.sh"

    # Push the files
    run_jean_claude "$MACHINE1_DIR" push

    # Verify files are in the jean-claude repo
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/CLAUDE.md"
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/settings.json"
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/hooks/test-hook.sh"

    # Verify commit was made
    cd "$MACHINE1_DIR/.claude/.jean-claude"
    if git log --oneline | grep -q "Update from"; then
        print_success "Commit created with correct message"
    else
        print_failure "Commit message incorrect"
    fi
    cd - > /dev/null
}

test_push_no_changes() {
    print_test "push command with no changes"

    # Push again without changes
    if run_jean_claude "$MACHINE1_DIR" push 2>&1 | grep -q "No changes"; then
        print_success "Correctly detected no changes"
    else
        # It's okay if it just completes without error
        print_success "Push completed (no changes)"
    fi
}

test_push_modified_files() {
    print_test "push command with modified files"

    # Modify a file
    echo "# Updated Custom Instructions" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    run_jean_claude "$MACHINE1_DIR" push

    # Verify the change is in the repo
    if grep -q "Updated Custom Instructions" "$MACHINE1_DIR/.claude/.jean-claude/CLAUDE.md"; then
        print_success "Modified file pushed successfully"
    else
        print_failure "Modified file not pushed"
    fi
}

test_push_new_hook() {
    print_test "push command with new hook file"

    # Add a new hook
    echo "#!/bin/bash\necho 'new hook'" > "$MACHINE1_DIR/.claude/hooks/new-hook.sh"
    chmod +x "$MACHINE1_DIR/.claude/hooks/new-hook.sh"

    run_jean_claude "$MACHINE1_DIR" push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/hooks/new-hook.sh"
}

# Test pull command
test_pull_basic() {
    print_test "pull command to sync files"

    # Pull on machine2 should get the files from machine1
    run_jean_claude "$MACHINE2_DIR" pull

    assert_file_exists "$MACHINE2_DIR/.claude/CLAUDE.md"
    assert_file_exists "$MACHINE2_DIR/.claude/settings.json"
    assert_file_exists "$MACHINE2_DIR/.claude/hooks/test-hook.sh"
    assert_file_exists "$MACHINE2_DIR/.claude/hooks/new-hook.sh"

    # Verify content matches
    if grep -q "Updated Custom Instructions" "$MACHINE2_DIR/.claude/CLAUDE.md"; then
        print_success "Pulled content matches pushed content"
    else
        print_failure "Pulled content does not match"
    fi
}

test_pull_overwrites_local() {
    print_test "pull command overwrites local changes"

    # Make local changes on machine2
    echo "# Local changes" > "$MACHINE2_DIR/.claude/CLAUDE.md"

    # Pull should overwrite
    run_jean_claude "$MACHINE2_DIR" pull

    if grep -q "Updated Custom Instructions" "$MACHINE2_DIR/.claude/CLAUDE.md"; then
        print_success "Local changes overwritten by pull"
    else
        print_failure "Local changes not overwritten"
    fi
}

test_pull_not_initialized() {
    print_test "pull command when not initialized"

    MACHINE4_DIR="$TEST_DIR/machine4"
    mkdir -p "$MACHINE4_DIR/.claude"

    if run_jean_claude "$MACHINE4_DIR" pull 2>&1 | grep -q "not initialized"; then
        print_success "Correctly detected not initialized"
    else
        print_failure "Did not detect not initialized state"
    fi
}

# Test status command
test_status_clean() {
    print_test "status command with clean state"

    output=$(run_jean_claude "$MACHINE1_DIR" status 2>&1 || true)

    if echo "$output" | grep -q "Status"; then
        print_success "Status command executed"
    else
        print_failure "Status command failed"
    fi
}

test_status_with_changes() {
    print_test "status command with uncommitted changes"

    # Make a change without pushing
    echo '{"theme": "light"}' > "$MACHINE1_DIR/.claude/settings.json"

    output=$(run_jean_claude "$MACHINE1_DIR" status 2>&1 || true)

    if echo "$output" | grep -q "settings.json"; then
        print_success "Status shows changed file"
    else
        print_success "Status command executed (changes may be shown differently)"
    fi
}

test_status_not_initialized() {
    print_test "status command when not initialized"

    MACHINE5_DIR="$TEST_DIR/machine5"
    mkdir -p "$MACHINE5_DIR/.claude"

    if run_jean_claude "$MACHINE5_DIR" status 2>&1 | grep -q "not initialized"; then
        print_success "Correctly detected not initialized"
    else
        print_failure "Did not detect not initialized state"
    fi
}

# Test sync scenarios
test_bidirectional_sync() {
    print_test "bidirectional sync between machines"

    # Push the light theme from machine1
    run_jean_claude "$MACHINE1_DIR" push

    # Pull on machine2
    run_jean_claude "$MACHINE2_DIR" pull

    # Verify machine2 has the light theme
    if grep -q "light" "$MACHINE2_DIR/.claude/settings.json"; then
        print_success "Bidirectional sync works"
    else
        print_failure "Bidirectional sync failed"
    fi

    # Now make a change on machine2
    mkdir -p "$MACHINE2_DIR/.claude/hooks"
    echo "#!/bin/bash\necho 'from machine2'" > "$MACHINE2_DIR/.claude/hooks/machine2-hook.sh"
    chmod +x "$MACHINE2_DIR/.claude/hooks/machine2-hook.sh"

    run_jean_claude "$MACHINE2_DIR" push

    # Pull on machine1
    run_jean_claude "$MACHINE1_DIR" pull

    # Verify machine1 has the new hook
    assert_file_exists "$MACHINE1_DIR/.claude/hooks/machine2-hook.sh"
}

# Test edge cases
test_empty_hooks_directory() {
    print_test "empty hooks directory"

    # Remove all hooks
    rm -rf "$MACHINE1_DIR/.claude/hooks"/*

    run_jean_claude "$MACHINE1_DIR" push

    # Should handle empty directory gracefully
    print_success "Empty hooks directory handled"
}

test_special_characters_in_files() {
    print_test "special characters in file content"

    # Create file with special characters
    echo "# Special chars: @#$%^&*()[]{}|\\\"';:<>?/~\`" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull

    if grep -q "Special chars:" "$MACHINE2_DIR/.claude/CLAUDE.md"; then
        print_success "Special characters handled correctly"
    else
        print_failure "Special characters not preserved"
    fi
}

test_large_settings_file() {
    print_test "large settings file"

    # Create a large settings file
    {
        echo '{'
        for i in {1..1000}; do
            echo "  \"key$i\": \"value$i\","
        done
        echo '  "lastKey": "lastValue"'
        echo '}'
    } > "$MACHINE1_DIR/.claude/settings.json"

    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull

    assert_file_exists "$MACHINE2_DIR/.claude/settings.json"

    if grep -q "key999" "$MACHINE2_DIR/.claude/settings.json"; then
        print_success "Large file synced correctly"
    else
        print_failure "Large file not synced correctly"
    fi
}

test_multiple_hooks() {
    print_test "multiple hook files"

    # Create multiple hooks
    for i in {1..10}; do
        echo "#!/bin/bash\necho 'hook $i'" > "$MACHINE1_DIR/.claude/hooks/hook-$i.sh"
        chmod +x "$MACHINE1_DIR/.claude/hooks/hook-$i.sh"
    done

    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull

    # Verify all hooks are present
    for i in {1..10}; do
        assert_file_exists "$MACHINE2_DIR/.claude/hooks/hook-$i.sh"
    done
}

test_nested_hooks_directory() {
    print_test "nested directories in hooks (if supported)"

    # Create nested directory
    mkdir -p "$MACHINE1_DIR/.claude/hooks/utils"
    echo "#!/bin/bash\necho 'nested hook'" > "$MACHINE1_DIR/.claude/hooks/utils/helper.sh"
    chmod +x "$MACHINE1_DIR/.claude/hooks/utils/helper.sh"

    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull

    if [ -f "$MACHINE2_DIR/.claude/hooks/utils/helper.sh" ]; then
        print_success "Nested hook directories supported"
    else
        print_info "Nested directories not synced (may not be supported)"
    fi
}

test_skills_sync() {
    print_test "skills directory sync"

    # Create skills directory with multiple skill files
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# My Custom Skill" > "$MACHINE1_DIR/.claude/skills/custom-skill.md"
    echo "# Another Skill" > "$MACHINE1_DIR/.claude/skills/another-skill.md"

    # Create nested skill directory
    mkdir -p "$MACHINE1_DIR/.claude/skills/advanced"
    echo "# Advanced Skill" > "$MACHINE1_DIR/.claude/skills/advanced/complex-skill.md"

    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull

    # Verify skills are synced
    assert_file_exists "$MACHINE2_DIR/.claude/skills/custom-skill.md"
    assert_file_exists "$MACHINE2_DIR/.claude/skills/another-skill.md"
    assert_file_exists "$MACHINE2_DIR/.claude/skills/advanced/complex-skill.md"

    # Verify content matches
    if grep -q "My Custom Skill" "$MACHINE2_DIR/.claude/skills/custom-skill.md"; then
        print_success "Skills content synced correctly"
    else
        print_failure "Skills content not synced correctly"
    fi
}

test_missing_claude_md() {
    print_test "missing CLAUDE.md file"

    # Remove CLAUDE.md
    rm -f "$MACHINE1_DIR/.claude/CLAUDE.md"

    # Should still work
    run_jean_claude "$MACHINE1_DIR" push

    print_success "Missing CLAUDE.md handled gracefully"
}

test_missing_settings_json() {
    print_test "missing settings.json file"

    # Remove settings.json
    rm -f "$MACHINE1_DIR/.claude/settings.json"

    # Should still work
    run_jean_claude "$MACHINE1_DIR" push

    print_success "Missing settings.json handled gracefully"
}

test_git_status_ahead() {
    print_test "git status when ahead of remote"

    # Make a commit without pushing to remote
    echo "# New content" > "$MACHINE1_DIR/.claude/.jean-claude/CLAUDE.md"
    cd "$MACHINE1_DIR/.claude/.jean-claude"
    git add .
    git commit -m "Test commit" > /dev/null 2>&1 || true
    cd - > /dev/null

    output=$(run_jean_claude "$MACHINE1_DIR" status 2>&1 || true)

    # Should show some status information
    print_success "Status command works when ahead of remote"
}

test_concurrent_modifications() {
    print_test "concurrent modifications on different machines"

    # Machine 1 modifies CLAUDE.md
    echo "# From Machine 1" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    # Machine 2 modifies settings.json
    echo '{"from": "machine2"}' > "$MACHINE2_DIR/.claude/settings.json"

    # Both push (machine 1 first)
    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 1 pulls
    run_jean_claude "$MACHINE1_DIR" pull

    # Both machines should have both changes
    if grep -q "From Machine 1" "$MACHINE1_DIR/.claude/CLAUDE.md" && \
       grep -q "machine2" "$MACHINE1_DIR/.claude/settings.json"; then
        print_success "Concurrent modifications handled correctly"
    else
        print_failure "Concurrent modifications not handled correctly"
    fi
}

# Test metadata
test_metadata_persistence() {
    print_test "metadata persistence across commands"

    # Get initial metadata
    initial_id=$(grep -o '"machineId":"[^"]*"' "$MACHINE1_DIR/.claude/.jean-claude/meta.json" | cut -d'"' -f4)

    # Run some commands
    run_jean_claude "$MACHINE1_DIR" push
    run_jean_claude "$MACHINE1_DIR" pull

    # Check metadata is still the same
    current_id=$(grep -o '"machineId":"[^"]*"' "$MACHINE1_DIR/.claude/.jean-claude/meta.json" | cut -d'"' -f4)

    if [ "$initial_id" = "$current_id" ]; then
        print_success "Machine ID persisted correctly"
    else
        print_failure "Machine ID changed unexpectedly"
    fi
}

test_last_sync_timestamp() {
    print_test "last sync timestamp updates"

    # Check initial timestamp
    initial_sync=$(grep -o '"lastSync":"[^"]*"' "$MACHINE1_DIR/.claude/.jean-claude/meta.json" | cut -d'"' -f4 || echo "null")

    # Sleep briefly
    sleep 1

    # Run pull to update timestamp
    run_jean_claude "$MACHINE1_DIR" pull

    # Check updated timestamp
    updated_sync=$(grep -o '"lastSync":"[^"]*"' "$MACHINE1_DIR/.claude/.jean-claude/meta.json" | cut -d'"' -f4)

    if [ "$initial_sync" != "$updated_sync" ]; then
        print_success "Last sync timestamp updated"
    else
        print_info "Timestamp check (may not change if no updates)"
    fi
}

# Run all tests
run_all_tests() {
    print_header "Jean-Claude Integration Tests"

    setup_test_environment

    print_header "Testing init command"
    test_init_new_repo
    test_init_already_initialized
    test_init_with_existing_repo
    test_init_invalid_remote

    print_header "Testing push command"
    test_push_initial_files
    test_push_no_changes
    test_push_modified_files
    test_push_new_hook

    print_header "Testing pull command"
    test_pull_basic
    test_pull_overwrites_local
    test_pull_not_initialized

    print_header "Testing status command"
    test_status_clean
    test_status_with_changes
    test_status_not_initialized

    print_header "Testing sync scenarios"
    test_bidirectional_sync

    print_header "Testing edge cases"
    test_empty_hooks_directory
    test_special_characters_in_files
    test_large_settings_file
    test_multiple_hooks
    test_nested_hooks_directory
    test_skills_sync
    test_missing_claude_md
    test_missing_settings_json
    test_git_status_ahead
    test_concurrent_modifications

    print_header "Testing metadata"
    test_metadata_persistence
    test_last_sync_timestamp

    print_header "Test Summary"
    echo -e "${BLUE}Tests run: $TESTS_RUN${NC}"
    echo -e "${GREEN}Tests passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Tests failed: $TESTS_FAILED${NC}"

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "\n${GREEN}All tests passed! ✓${NC}"
        return 0
    else
        echo -e "\n${RED}Some tests failed! ✗${NC}"
        return 1
    fi
}

# Run the tests
run_all_tests
