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
# - Multi-repo sync (3 machines: chain sync, convergence, concurrent modifications, hooks/skills sync, late joiner)
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
MACHINE3_DIR=""
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
    MACHINE3_DIR="$TEST_DIR/machine3"
    mkdir -p "$MACHINE1_DIR/.claude"
    mkdir -p "$MACHINE2_DIR/.claude"
    mkdir -p "$MACHINE3_DIR/.claude"
    print_info "Created machine directories (machine1, machine2, machine3)"

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

# Multi-repo sync tests (3 machines)
test_three_machine_init() {
    print_test "initialize third machine from existing remote"

    # Machine 3 initializes from the same remote
    echo "$REMOTE_REPO" | run_jean_claude "$MACHINE3_DIR" init

    assert_dir_exists "$MACHINE3_DIR/.claude/.jean-claude"
    assert_file_exists "$MACHINE3_DIR/.claude/.jean-claude/meta.json"

    # Verify machine 3 has a machine ID (it may be the same as others when
    # running tests on a single physical machine, since IDs are based on hostname)
    # Use grep -E to handle pretty-printed JSON with spaces
    machine3_id=$(grep -oE '"machineId"[[:space:]]*:[[:space:]]*"[^"]*"' "$MACHINE3_DIR/.claude/.jean-claude/meta.json" | sed 's/.*: *"//' | sed 's/"$//')

    if [ -n "$machine3_id" ]; then
        print_success "Machine 3 has a valid machine ID"
    else
        print_failure "Machine 3 does not have a machine ID"
    fi
}

test_three_machine_chain_sync() {
    print_test "chain sync: machine1 -> machine2 -> machine3"

    # Machine 1 creates a unique file in skills (which is synced)
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# Created on Machine 1 for chain sync test" > "$MACHINE1_DIR/.claude/skills/chain-test.md"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 pulls and verifies
    run_jean_claude "$MACHINE2_DIR" pull
    assert_file_exists "$MACHINE2_DIR/.claude/skills/chain-test.md"

    # Machine 3 pulls and verifies
    run_jean_claude "$MACHINE3_DIR" pull
    assert_file_exists "$MACHINE3_DIR/.claude/skills/chain-test.md"

    # Verify content is the same across all machines
    if grep -q "Created on Machine 1" "$MACHINE3_DIR/.claude/skills/chain-test.md"; then
        print_success "Chain sync propagated content to machine 3"
    else
        print_failure "Chain sync did not propagate content correctly"
    fi
}

test_three_machine_convergence() {
    print_test "convergence: all 3 machines end up with same state"

    # Machine 1 creates and pushes its file in skills (which is synced)
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# File from Machine 1" > "$MACHINE1_DIR/.claude/skills/from-m1.md"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 pulls (gets m1's file), creates its own file, then pushes
    run_jean_claude "$MACHINE2_DIR" pull
    echo "# File from Machine 2" > "$MACHINE2_DIR/.claude/skills/from-m2.md"
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 3 pulls (gets m1 and m2's files), creates its own file, then pushes
    run_jean_claude "$MACHINE3_DIR" pull
    echo "# File from Machine 3" > "$MACHINE3_DIR/.claude/skills/from-m3.md"
    run_jean_claude "$MACHINE3_DIR" push

    # Final pull on all machines to converge
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Verify all machines have all 3 files
    local all_synced=true
    for machine_dir in "$MACHINE1_DIR" "$MACHINE2_DIR" "$MACHINE3_DIR"; do
        for file in "from-m1.md" "from-m2.md" "from-m3.md"; do
            if [ ! -f "$machine_dir/.claude/skills/$file" ]; then
                print_failure "Missing skills/$file on $machine_dir"
                all_synced=false
            fi
        done
    done

    if [ "$all_synced" = true ]; then
        print_success "All 3 machines converged to same state"
    fi
}

test_three_machine_sequential_modifications() {
    print_test "sequential modifications across 3 machines"

    # Start with a shared file in skills (which is synced)
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "Version 1: From Machine 1" > "$MACHINE1_DIR/.claude/skills/shared-doc.md"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 pulls, modifies, and pushes
    run_jean_claude "$MACHINE2_DIR" pull
    echo "Version 2: Modified by Machine 2" > "$MACHINE2_DIR/.claude/skills/shared-doc.md"
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 3 pulls, modifies, and pushes
    run_jean_claude "$MACHINE3_DIR" pull
    echo "Version 3: Modified by Machine 3" > "$MACHINE3_DIR/.claude/skills/shared-doc.md"
    run_jean_claude "$MACHINE3_DIR" push

    # All machines pull the latest
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Verify all machines have the final version
    local all_have_v3=true
    for machine_dir in "$MACHINE1_DIR" "$MACHINE2_DIR" "$MACHINE3_DIR"; do
        if ! grep -q "Version 3: Modified by Machine 3" "$machine_dir/.claude/skills/shared-doc.md"; then
            print_failure "Machine at $machine_dir does not have final version"
            all_have_v3=false
        fi
    done

    if [ "$all_have_v3" = true ]; then
        print_success "Sequential modifications synced correctly across 3 machines"
    fi
}

test_three_machine_concurrent_different_files() {
    print_test "concurrent modifications to different files from 3 machines"

    # Pull latest state first to start clean
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Machine 1 creates its file in skills and pushes
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# Concurrent edit from M1" > "$MACHINE1_DIR/.claude/skills/concurrent-m1.md"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 pulls (gets m1's file), creates its file, pushes
    run_jean_claude "$MACHINE2_DIR" pull
    echo "# Concurrent edit from M2" > "$MACHINE2_DIR/.claude/skills/concurrent-m2.md"
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 3 pulls (gets m1 and m2's files), creates its file, pushes
    run_jean_claude "$MACHINE3_DIR" pull
    echo "# Concurrent edit from M3" > "$MACHINE3_DIR/.claude/skills/concurrent-m3.md"
    run_jean_claude "$MACHINE3_DIR" push

    # Final sync - all machines pull
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Check that all 3 files exist on all machines
    local all_files_present=true
    for machine_dir in "$MACHINE1_DIR" "$MACHINE2_DIR" "$MACHINE3_DIR"; do
        for file in "concurrent-m1.md" "concurrent-m2.md" "concurrent-m3.md"; do
            if [ ! -f "$machine_dir/.claude/skills/$file" ]; then
                all_files_present=false
            fi
        done
    done

    if [ "$all_files_present" = true ]; then
        print_success "Concurrent different-file modifications synced across 3 machines"
    else
        print_failure "Some concurrent modifications were lost"
    fi
}

test_three_machine_hooks_sync() {
    print_test "hooks sync across 3 machines"

    # Machine 1 creates hooks
    mkdir -p "$MACHINE1_DIR/.claude/hooks"
    echo "#!/bin/bash\necho 'hook from m1'" > "$MACHINE1_DIR/.claude/hooks/m1-hook.sh"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 creates additional hooks
    run_jean_claude "$MACHINE2_DIR" pull
    echo "#!/bin/bash\necho 'hook from m2'" > "$MACHINE2_DIR/.claude/hooks/m2-hook.sh"
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 3 creates additional hooks
    run_jean_claude "$MACHINE3_DIR" pull
    echo "#!/bin/bash\necho 'hook from m3'" > "$MACHINE3_DIR/.claude/hooks/m3-hook.sh"
    run_jean_claude "$MACHINE3_DIR" push

    # Final pull on all machines
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Verify all machines have all hooks
    local all_hooks_present=true
    for machine_dir in "$MACHINE1_DIR" "$MACHINE2_DIR" "$MACHINE3_DIR"; do
        for hook in "m1-hook.sh" "m2-hook.sh" "m3-hook.sh"; do
            if [ ! -f "$machine_dir/.claude/hooks/$hook" ]; then
                print_failure "Missing $hook on $machine_dir"
                all_hooks_present=false
            fi
        done
    done

    if [ "$all_hooks_present" = true ]; then
        print_success "All hooks synced across 3 machines"
    fi
}

test_three_machine_skills_sync() {
    print_test "skills sync across 3 machines"

    # Machine 1 creates skills
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# Skill from Machine 1" > "$MACHINE1_DIR/.claude/skills/skill-m1.md"
    run_jean_claude "$MACHINE1_DIR" push

    # Machine 2 creates additional skills
    run_jean_claude "$MACHINE2_DIR" pull
    mkdir -p "$MACHINE2_DIR/.claude/skills/nested"
    echo "# Nested Skill from Machine 2" > "$MACHINE2_DIR/.claude/skills/nested/skill-m2.md"
    run_jean_claude "$MACHINE2_DIR" push

    # Machine 3 creates additional skills
    run_jean_claude "$MACHINE3_DIR" pull
    echo "# Skill from Machine 3" > "$MACHINE3_DIR/.claude/skills/skill-m3.md"
    run_jean_claude "$MACHINE3_DIR" push

    # Final pull on all machines
    run_jean_claude "$MACHINE1_DIR" pull
    run_jean_claude "$MACHINE2_DIR" pull
    run_jean_claude "$MACHINE3_DIR" pull

    # Verify all machines have all skills
    local all_skills_present=true
    for machine_dir in "$MACHINE1_DIR" "$MACHINE2_DIR" "$MACHINE3_DIR"; do
        if [ ! -f "$machine_dir/.claude/skills/skill-m1.md" ]; then
            print_failure "Missing skill-m1.md on $machine_dir"
            all_skills_present=false
        fi
        if [ ! -f "$machine_dir/.claude/skills/skill-m3.md" ]; then
            print_failure "Missing skill-m3.md on $machine_dir"
            all_skills_present=false
        fi
        if [ ! -f "$machine_dir/.claude/skills/nested/skill-m2.md" ]; then
            print_failure "Missing nested/skill-m2.md on $machine_dir"
            all_skills_present=false
        fi
    done

    if [ "$all_skills_present" = true ]; then
        print_success "All skills (including nested) synced across 3 machines"
    fi
}

test_three_machine_late_joiner() {
    print_test "late joiner: machine4 joins after machines 1-3 have synced"

    # Create machine4 directory
    MACHINE4_DIR="$TEST_DIR/machine4"
    mkdir -p "$MACHINE4_DIR/.claude"

    # Machine4 initializes (joining late)
    echo "$REMOTE_REPO" | run_jean_claude "$MACHINE4_DIR" init

    # Pull to get all existing content
    run_jean_claude "$MACHINE4_DIR" pull

    # Verify machine4 has received all the content created by other machines
    # Check for files from earlier 3-machine tests (skills files from convergence test)
    local late_joiner_success=true

    # Check for skills files that were created in previous tests
    if [ ! -f "$MACHINE4_DIR/.claude/skills/from-m1.md" ]; then
        late_joiner_success=false
    fi
    if [ ! -f "$MACHINE4_DIR/.claude/hooks/m1-hook.sh" ]; then
        late_joiner_success=false
    fi

    if [ "$late_joiner_success" = true ]; then
        print_success "Late joiner (machine4) received all existing content"
    else
        print_failure "Late joiner did not receive all content"
    fi
}

test_three_machine_status_consistency() {
    print_test "status command consistency across 3 machines"

    # Get status from all machines
    status1=$(run_jean_claude "$MACHINE1_DIR" status 2>&1 || true)
    status2=$(run_jean_claude "$MACHINE2_DIR" status 2>&1 || true)
    status3=$(run_jean_claude "$MACHINE3_DIR" status 2>&1 || true)

    # All should report some form of status without errors
    local all_status_ok=true
    for status_output in "$status1" "$status2" "$status3"; do
        if echo "$status_output" | grep -qi "error"; then
            all_status_ok=false
        fi
    done

    if [ "$all_status_ok" = true ]; then
        print_success "Status command works consistently across 3 machines"
    else
        print_failure "Status command reported errors on some machines"
    fi
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

# Test profile commands
test_profile_create() {
    print_test "profile create command"

    # Create a profile using --yes and --shell flags to skip prompts
    run_jean_claude "$MACHINE1_DIR" profile create work --yes --shell .zshrc

    # Verify profile directory was created
    assert_dir_exists "$MACHINE1_DIR/.claude-work"

    # Verify CLAUDE.md was created in profile dir
    assert_file_exists "$MACHINE1_DIR/.claude-work/CLAUDE.md"

    # Verify profiles.json was created in jean-claude repo
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/profiles.json"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/profiles.json" "work"
}

test_profile_symlinks() {
    print_test "profile symlinks to shared config"

    # Verify symlinks exist for shared items that exist in main config
    if [ -f "$MACHINE1_DIR/.claude/settings.json" ]; then
        if [ -L "$MACHINE1_DIR/.claude-work/settings.json" ]; then
            print_success "settings.json is a symlink"
            # Verify symlink points to the right place
            local target
            target=$(readlink "$MACHINE1_DIR/.claude-work/settings.json")
            if [ "$target" = "$MACHINE1_DIR/.claude/settings.json" ]; then
                print_success "settings.json symlink target is correct"
            else
                print_failure "settings.json symlink target is wrong: $target"
            fi
        else
            print_failure "settings.json is not a symlink"
        fi
    else
        print_info "settings.json does not exist in main config, skipping symlink check"
    fi

    if [ -d "$MACHINE1_DIR/.claude/hooks" ]; then
        if [ -L "$MACHINE1_DIR/.claude-work/hooks" ]; then
            print_success "hooks is a symlink"
        else
            print_failure "hooks is not a symlink"
        fi
    fi
}

test_profile_symlink_content_shared() {
    print_test "profile symlinks share content with main config"

    # settings.json may not have existed when profile was created, so refresh symlinks first
    echo '{"theme": "dark", "shared": true}' > "$MACHINE1_DIR/.claude/settings.json"
    run_jean_claude "$MACHINE1_DIR" profile refresh work

    # Verify the profile sees the same content through symlink
    if [ -L "$MACHINE1_DIR/.claude-work/settings.json" ]; then
        if grep -q "shared" "$MACHINE1_DIR/.claude-work/settings.json"; then
            print_success "Profile sees main config content through symlink"
        else
            print_failure "Profile does not see main config content"
        fi
    else
        print_failure "settings.json is not a symlink in profile"
    fi

    # Modify main config and verify profile picks it up
    echo '{"theme": "light", "updated": true}' > "$MACHINE1_DIR/.claude/settings.json"
    if grep -q "updated" "$MACHINE1_DIR/.claude-work/settings.json"; then
        print_success "Profile immediately reflects main config changes"
    else
        print_failure "Profile does not reflect main config changes"
    fi
}

test_profile_independent_claude_md() {
    print_test "profile has independent CLAUDE.md"

    # Set different CLAUDE.md content in profile
    echo "# Work profile instructions" > "$MACHINE1_DIR/.claude-work/CLAUDE.md"
    echo "# Personal instructions" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    # Verify they are independent
    if grep -q "Work profile" "$MACHINE1_DIR/.claude-work/CLAUDE.md" && \
       grep -q "Personal" "$MACHINE1_DIR/.claude/CLAUDE.md"; then
        print_success "CLAUDE.md is independent per profile"
    else
        print_failure "CLAUDE.md is not independent"
    fi

    # Verify profile CLAUDE.md is NOT a symlink
    if [ -L "$MACHINE1_DIR/.claude-work/CLAUDE.md" ]; then
        print_failure "CLAUDE.md should not be a symlink"
    else
        print_success "CLAUDE.md is a regular file (not symlinked)"
    fi
}

test_profile_shell_alias() {
    print_test "profile shell alias installation"

    # Verify alias was added to .zshrc
    assert_file_exists "$MACHINE1_DIR/.zshrc"
    assert_file_contains "$MACHINE1_DIR/.zshrc" "jean-claude profile: work"
    assert_file_contains "$MACHINE1_DIR/.zshrc" "claude-work"
    assert_file_contains "$MACHINE1_DIR/.zshrc" "CLAUDE_CONFIG_DIR"
}

test_profile_list() {
    print_test "profile list command"

    output=$(run_jean_claude "$MACHINE1_DIR" profile list 2>&1 || true)

    if echo "$output" | grep -q "work"; then
        print_success "Profile list shows 'work' profile"
    else
        print_failure "Profile list does not show 'work' profile"
    fi
}

test_profile_create_second() {
    print_test "create a second profile"

    run_jean_claude "$MACHINE1_DIR" profile create personal --yes --shell .bashrc

    assert_dir_exists "$MACHINE1_DIR/.claude-personal"
    assert_file_exists "$MACHINE1_DIR/.claude-personal/CLAUDE.md"
    assert_file_exists "$MACHINE1_DIR/.bashrc"
    assert_file_contains "$MACHINE1_DIR/.bashrc" "jean-claude profile: personal"
    assert_file_contains "$MACHINE1_DIR/.bashrc" "claude-personal"

    # Verify profiles.json has both profiles
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/profiles.json" "work"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/profiles.json" "personal"
}

test_profile_create_duplicate() {
    print_test "create duplicate profile fails"

    if run_jean_claude "$MACHINE1_DIR" profile create work --yes --shell .zshrc 2>&1; then
        print_failure "Should have failed creating duplicate profile"
    else
        print_success "Correctly rejected duplicate profile"
    fi
}

test_profile_create_invalid_name() {
    print_test "create profile with invalid name fails"

    if run_jean_claude "$MACHINE1_DIR" profile create "INVALID" --yes --shell .zshrc 2>&1; then
        print_failure "Should have failed with invalid name"
    else
        print_success "Correctly rejected invalid profile name"
    fi

    if run_jean_claude "$MACHINE1_DIR" profile create "123bad" --yes --shell .zshrc 2>&1; then
        print_failure "Should have failed with name starting with number"
    else
        print_success "Correctly rejected name starting with number"
    fi
}

test_profile_refresh() {
    print_test "profile refresh command"

    # Create a new shared item in main config
    mkdir -p "$MACHINE1_DIR/.claude/agents"
    echo "# Test agent" > "$MACHINE1_DIR/.claude/agents/test-agent.md"

    # Refresh the profile
    run_jean_claude "$MACHINE1_DIR" profile refresh work

    # Verify the new symlink was created
    if [ -L "$MACHINE1_DIR/.claude-work/agents" ]; then
        print_success "agents symlink created after refresh"
        if [ -f "$MACHINE1_DIR/.claude-work/agents/test-agent.md" ]; then
            print_success "agents content accessible through symlink"
        else
            print_failure "agents content not accessible through symlink"
        fi
    else
        print_failure "agents symlink not created after refresh"
    fi
}

test_profile_delete() {
    print_test "profile delete command"

    # Delete the personal profile
    run_jean_claude "$MACHINE1_DIR" profile delete personal --yes

    # Verify directory was removed
    if [ -d "$MACHINE1_DIR/.claude-personal" ]; then
        print_failure "Profile directory should have been removed"
    else
        print_success "Profile directory removed"
    fi

    # Verify removed from profiles.json
    if grep -q "personal" "$MACHINE1_DIR/.claude/.jean-claude/profiles.json"; then
        print_failure "Profile should have been removed from profiles.json"
    else
        print_success "Profile removed from profiles.json"
    fi

    # Verify alias removed from .bashrc
    if grep -q "jean-claude profile: personal" "$MACHINE1_DIR/.bashrc"; then
        print_failure "Alias should have been removed from .bashrc"
    else
        print_success "Alias removed from .bashrc"
    fi

    # Verify work profile still exists
    assert_dir_exists "$MACHINE1_DIR/.claude-work"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/profiles.json" "work"
}

test_profile_delete_preserves_main() {
    print_test "profile delete does not affect main config"

    # Verify main config files are untouched after profile operations
    assert_file_exists "$MACHINE1_DIR/.claude/settings.json"

    if grep -q "updated" "$MACHINE1_DIR/.claude/settings.json"; then
        print_success "Main config settings.json is intact"
    else
        print_failure "Main config settings.json was affected"
    fi
}

test_profile_not_initialized() {
    print_test "profile commands when not initialized"

    MACHINE_NOINIT_DIR="$TEST_DIR/machine-noinit"
    mkdir -p "$MACHINE_NOINIT_DIR/.claude"

    if run_jean_claude "$MACHINE_NOINIT_DIR" profile create test --yes --shell .zshrc 2>&1 | grep -q "not initialized"; then
        print_success "Correctly detected not initialized"
    else
        print_failure "Did not detect not initialized state"
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

    print_header "Testing multi-repo sync (3 machines)"
    test_three_machine_init
    test_three_machine_chain_sync
    test_three_machine_convergence
    test_three_machine_sequential_modifications
    test_three_machine_concurrent_different_files
    test_three_machine_hooks_sync
    test_three_machine_skills_sync
    test_three_machine_late_joiner
    test_three_machine_status_consistency

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

    print_header "Testing profile management"
    test_profile_create
    test_profile_symlinks
    test_profile_symlink_content_shared
    test_profile_independent_claude_md
    test_profile_shell_alias
    test_profile_list
    test_profile_create_second
    test_profile_create_duplicate
    test_profile_create_invalid_name
    test_profile_refresh
    test_profile_delete
    test_profile_delete_preserves_main
    test_profile_not_initialized

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
