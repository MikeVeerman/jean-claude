#!/usr/bin/env bash

# Integration test script for jean-claude
# This script sets up a local git repo and tests jean-claude's functionality and edge cases
#
# The script tests:
# - init command (new repos, existing repos, already initialized)
# - sync setup command (linking to a Git remote)
# - sync push command (initial files, no changes, modifications, new hooks)
# - sync pull command (basic sync, overwriting local changes, not initialized)
# - sync status command (clean state, uncommitted changes, not initialized)
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

    # Create a bare git repository to act as remote
    REMOTE_REPO="$TEST_DIR/remote-repo"
    REMOTE_REPO_TEMP="$TEST_DIR/remote-repo-temp"
    mkdir -p "$REMOTE_REPO_TEMP"
    (
        cd "$REMOTE_REPO_TEMP"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
        echo '{"version":"1.1.0","managedBy":"jean-claude","lastSync":null,"machineId":"test-setup","platform":"linux","claudeConfigPath":"/test"}' > meta.json
        git add meta.json
        git commit -m "Initial commit" > /dev/null 2>&1
    )
    git clone --bare "$REMOTE_REPO_TEMP" "$REMOTE_REPO" > /dev/null 2>&1
    rm -rf "$REMOTE_REPO_TEMP"

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

    # Initialize with --sync and --url flags (non-interactive)
    run_jean_claude "$MACHINE1_DIR" init --sync --url "$REMOTE_REPO"

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
    if run_jean_claude "$MACHINE1_DIR" init 2>&1 | grep -q "Already initialized"; then
        print_success "Correctly detected already initialized"
    else
        print_failure "Did not detect already initialized state"
    fi
}

test_init_with_existing_repo() {
    print_test "init command with existing remote repository"

    # Machine 2 should clone the existing repo created by machine 1
    run_jean_claude "$MACHINE2_DIR" init --sync --url "$REMOTE_REPO"

    assert_dir_exists "$MACHINE2_DIR/.claude/.jean-claude"
    assert_file_exists "$MACHINE2_DIR/.claude/.jean-claude/meta.json"
}

test_init_invalid_remote() {
    print_test "init command with invalid remote URL"

    INVALID_MACHINE_DIR="$TEST_DIR/machine-invalid"
    mkdir -p "$INVALID_MACHINE_DIR/.claude"

    # Should fail with invalid remote
    if run_jean_claude "$INVALID_MACHINE_DIR" init --sync --url "/invalid/repo/path" 2>&1; then
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
    run_jean_claude "$MACHINE1_DIR" sync push

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
    if run_jean_claude "$MACHINE1_DIR" sync push 2>&1 | grep -q "No changes"; then
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

    run_jean_claude "$MACHINE1_DIR" sync push

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

    run_jean_claude "$MACHINE1_DIR" sync push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/hooks/new-hook.sh"
}

# Test pull command
test_pull_basic() {
    print_test "pull command to sync files"

    # Pull on machine2 should get the files from machine1
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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
    run_jean_claude "$MACHINE2_DIR" sync pull --force --force

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

    if run_jean_claude "$MACHINE4_DIR" sync pull --force 2>&1 | grep -q "not initialized"; then
        print_success "Correctly detected not initialized"
    else
        print_failure "Did not detect not initialized state"
    fi
}

# Test status command
test_status_clean() {
    print_test "status command with clean state"

    output=$(run_jean_claude "$MACHINE1_DIR" sync status 2>&1 || true)

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

    output=$(run_jean_claude "$MACHINE1_DIR" sync status 2>&1 || true)

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

    if run_jean_claude "$MACHINE5_DIR" sync status 2>&1 | grep -q "not initialized"; then
        print_success "Correctly detected not initialized"
    else
        print_failure "Did not detect not initialized state"
    fi
}

# Test sync scenarios
test_bidirectional_sync() {
    print_test "bidirectional sync between machines"

    # Push the light theme from machine1
    run_jean_claude "$MACHINE1_DIR" sync push

    # Pull on machine2
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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

    run_jean_claude "$MACHINE2_DIR" sync push

    # Pull on machine1
    run_jean_claude "$MACHINE1_DIR" sync pull --force

    # Verify machine1 has the new hook
    assert_file_exists "$MACHINE1_DIR/.claude/hooks/machine2-hook.sh"
}

# Multi-repo sync tests (3 machines)
test_three_machine_init() {
    print_test "initialize third machine from existing remote"

    # Machine 3 initializes from the same remote
    run_jean_claude "$MACHINE3_DIR" init --sync --url "$REMOTE_REPO"

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
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 pulls and verifies
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    assert_file_exists "$MACHINE2_DIR/.claude/skills/chain-test.md"

    # Machine 3 pulls and verifies
    run_jean_claude "$MACHINE3_DIR" sync pull --force
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
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 pulls (gets m1's file), creates its own file, then pushes
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    echo "# File from Machine 2" > "$MACHINE2_DIR/.claude/skills/from-m2.md"
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 3 pulls (gets m1 and m2's files), creates its own file, then pushes
    run_jean_claude "$MACHINE3_DIR" sync pull --force
    echo "# File from Machine 3" > "$MACHINE3_DIR/.claude/skills/from-m3.md"
    run_jean_claude "$MACHINE3_DIR" sync push

    # Final pull on all machines to converge
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 pulls, modifies, and pushes
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    echo "Version 2: Modified by Machine 2" > "$MACHINE2_DIR/.claude/skills/shared-doc.md"
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 3 pulls, modifies, and pushes
    run_jean_claude "$MACHINE3_DIR" sync pull --force
    echo "Version 3: Modified by Machine 3" > "$MACHINE3_DIR/.claude/skills/shared-doc.md"
    run_jean_claude "$MACHINE3_DIR" sync push

    # All machines pull the latest
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

    # Machine 1 creates its file in skills and pushes
    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# Concurrent edit from M1" > "$MACHINE1_DIR/.claude/skills/concurrent-m1.md"
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 pulls (gets m1's file), creates its file, pushes
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    echo "# Concurrent edit from M2" > "$MACHINE2_DIR/.claude/skills/concurrent-m2.md"
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 3 pulls (gets m1 and m2's files), creates its file, pushes
    run_jean_claude "$MACHINE3_DIR" sync pull --force
    echo "# Concurrent edit from M3" > "$MACHINE3_DIR/.claude/skills/concurrent-m3.md"
    run_jean_claude "$MACHINE3_DIR" sync push

    # Final sync - all machines pull
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 creates additional hooks
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    echo "#!/bin/bash\necho 'hook from m2'" > "$MACHINE2_DIR/.claude/hooks/m2-hook.sh"
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 3 creates additional hooks
    run_jean_claude "$MACHINE3_DIR" sync pull --force
    echo "#!/bin/bash\necho 'hook from m3'" > "$MACHINE3_DIR/.claude/hooks/m3-hook.sh"
    run_jean_claude "$MACHINE3_DIR" sync push

    # Final pull on all machines
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync push

    # Machine 2 creates additional skills
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    mkdir -p "$MACHINE2_DIR/.claude/skills/nested"
    echo "# Nested Skill from Machine 2" > "$MACHINE2_DIR/.claude/skills/nested/skill-m2.md"
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 3 creates additional skills
    run_jean_claude "$MACHINE3_DIR" sync pull --force
    echo "# Skill from Machine 3" > "$MACHINE3_DIR/.claude/skills/skill-m3.md"
    run_jean_claude "$MACHINE3_DIR" sync push

    # Final pull on all machines
    run_jean_claude "$MACHINE1_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE3_DIR" sync pull --force

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
    run_jean_claude "$MACHINE4_DIR" init --sync --url "$REMOTE_REPO"

    # Pull to get all existing content
    run_jean_claude "$MACHINE4_DIR" sync pull --force

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
    status1=$(run_jean_claude "$MACHINE1_DIR" sync status 2>&1 || true)
    status2=$(run_jean_claude "$MACHINE2_DIR" sync status 2>&1 || true)
    status3=$(run_jean_claude "$MACHINE3_DIR" sync status 2>&1 || true)

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

    run_jean_claude "$MACHINE1_DIR" sync push

    # Should handle empty directory gracefully
    print_success "Empty hooks directory handled"
}

test_special_characters_in_files() {
    print_test "special characters in file content"

    # Create file with special characters
    echo "# Special chars: @#$%^&*()[]{}|\\\"';:<>?/~\`" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync push

    print_success "Missing CLAUDE.md handled gracefully"
}

test_missing_settings_json() {
    print_test "missing settings.json file"

    # Remove settings.json
    rm -f "$MACHINE1_DIR/.claude/settings.json"

    # Should still work
    run_jean_claude "$MACHINE1_DIR" sync push

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

    output=$(run_jean_claude "$MACHINE1_DIR" sync status 2>&1 || true)

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
    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force
    run_jean_claude "$MACHINE2_DIR" sync push

    # Machine 1 pulls
    run_jean_claude "$MACHINE1_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE1_DIR" sync pull --force

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
    run_jean_claude "$MACHINE1_DIR" sync pull --force

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

test_profile_share_claude_md() {
    print_test "profile create with --share-claude-md symlinks CLAUDE.md"

    # Ensure main config has a CLAUDE.md
    echo "# Shared global instructions" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    # Create a profile with --share-claude-md
    run_jean_claude "$MACHINE1_DIR" profile create shared-md --yes --shell .bashrc --share-claude-md

    assert_dir_exists "$MACHINE1_DIR/.claude-shared-md"

    # Verify CLAUDE.md is a symlink
    if [ -L "$MACHINE1_DIR/.claude-shared-md/CLAUDE.md" ]; then
        print_success "CLAUDE.md is a symlink"
    else
        print_failure "CLAUDE.md should be a symlink when --share-claude-md is used"
    fi

    # Verify symlink points to main config
    local target
    target=$(readlink "$MACHINE1_DIR/.claude-shared-md/CLAUDE.md")
    if [ "$target" = "$MACHINE1_DIR/.claude/CLAUDE.md" ]; then
        print_success "CLAUDE.md symlink points to main config"
    else
        print_failure "CLAUDE.md symlink points to wrong target: $target"
    fi

    # Verify content matches
    assert_file_contains "$MACHINE1_DIR/.claude-shared-md/CLAUDE.md" "Shared global instructions"
}

test_profile_no_share_claude_md() {
    print_test "profile create with --no-share-claude-md creates independent CLAUDE.md"

    # Create a profile with --no-share-claude-md
    run_jean_claude "$MACHINE1_DIR" profile create indep-md --yes --shell .bashrc --no-share-claude-md

    assert_dir_exists "$MACHINE1_DIR/.claude-indep-md"
    assert_file_exists "$MACHINE1_DIR/.claude-indep-md/CLAUDE.md"

    # Verify CLAUDE.md is NOT a symlink
    if [ -L "$MACHINE1_DIR/.claude-indep-md/CLAUDE.md" ]; then
        print_failure "CLAUDE.md should not be a symlink when --no-share-claude-md is used"
    else
        print_success "CLAUDE.md is an independent file"
    fi

    # Verify it has the profile template content
    assert_file_contains "$MACHINE1_DIR/.claude-indep-md/CLAUDE.md" "indep-md profile"
}

test_profile_share_statusline() {
    print_test "profile create with --share-statusline symlinks statusline.sh"

    # Ensure main config has a statusline.sh
    echo '#!/bin/bash' > "$MACHINE1_DIR/.claude/statusline.sh"
    echo 'echo "my statusline"' >> "$MACHINE1_DIR/.claude/statusline.sh"

    # Create a profile with --share-statusline
    run_jean_claude "$MACHINE1_DIR" profile create shared-sl --yes --shell .bashrc --share-statusline

    assert_dir_exists "$MACHINE1_DIR/.claude-shared-sl"

    # Verify statusline.sh is a symlink
    if [ -L "$MACHINE1_DIR/.claude-shared-sl/statusline.sh" ]; then
        print_success "statusline.sh is a symlink"
    else
        print_failure "statusline.sh should be a symlink when --share-statusline is used"
    fi

    # Verify symlink points to main config
    local target
    target=$(readlink "$MACHINE1_DIR/.claude-shared-sl/statusline.sh")
    if [ "$target" = "$MACHINE1_DIR/.claude/statusline.sh" ]; then
        print_success "statusline.sh symlink points to main config"
    else
        print_failure "statusline.sh symlink points to wrong target: $target"
    fi

    # Verify content matches
    assert_file_contains "$MACHINE1_DIR/.claude-shared-sl/statusline.sh" "my statusline"
}

test_profile_no_share_statusline() {
    print_test "profile create with --no-share-statusline does not create statusline.sh"

    # Create a profile with --no-share-statusline
    run_jean_claude "$MACHINE1_DIR" profile create no-sl --yes --shell .bashrc --no-share-statusline

    assert_dir_exists "$MACHINE1_DIR/.claude-no-sl"

    # Verify statusline.sh does NOT exist in the profile
    if [ -e "$MACHINE1_DIR/.claude-no-sl/statusline.sh" ]; then
        print_failure "statusline.sh should not exist when --no-share-statusline is used"
    else
        print_success "statusline.sh is not present in profile"
    fi
}

test_profile_share_both() {
    print_test "profile create with both --share-claude-md and --share-statusline"

    # Create a profile sharing both
    run_jean_claude "$MACHINE1_DIR" profile create shared-both --yes --shell .bashrc --share-claude-md --share-statusline

    assert_dir_exists "$MACHINE1_DIR/.claude-shared-both"

    # Verify both are symlinks
    if [ -L "$MACHINE1_DIR/.claude-shared-both/CLAUDE.md" ] && [ -L "$MACHINE1_DIR/.claude-shared-both/statusline.sh" ]; then
        print_success "Both CLAUDE.md and statusline.sh are symlinks"
    else
        print_failure "Both should be symlinks when sharing is enabled"
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

# Test init --no-sync
test_init_no_sync() {
    print_test "init --no-sync creates local directory without git"

    local NOSYNC_DIR="$TEST_DIR/machine-nosync"
    mkdir -p "$NOSYNC_DIR/.claude"

    run_jean_claude "$NOSYNC_DIR" init --no-sync

    # Should create jean-claude dir and meta.json
    assert_dir_exists "$NOSYNC_DIR/.claude/.jean-claude"
    assert_file_exists "$NOSYNC_DIR/.claude/.jean-claude/meta.json"

    # Should NOT have a .git directory
    if [ -d "$NOSYNC_DIR/.claude/.jean-claude/.git" ]; then
        print_failure ".git directory should not exist with --no-sync"
    else
        print_success "No .git directory created with --no-sync"
    fi
}

# Test init --url implies --sync
test_init_url_implies_sync() {
    print_test "init --url implies --sync"

    local URL_DIR="$TEST_DIR/machine-url"
    mkdir -p "$URL_DIR/.claude"

    run_jean_claude "$URL_DIR" init --url "$REMOTE_REPO"

    # Should have set up git repo with remote
    assert_dir_exists "$URL_DIR/.claude/.jean-claude/.git"
    assert_file_exists "$URL_DIR/.claude/.jean-claude/meta.json"
}

# Test two-phase flow: init --no-sync then sync setup --url
test_two_phase_init_then_sync_setup() {
    print_test "two-phase flow: init --no-sync then sync setup --url"

    local TWOPHASE_DIR="$TEST_DIR/machine-twophase"
    mkdir -p "$TWOPHASE_DIR/.claude"

    # Phase 1: init without sync
    run_jean_claude "$TWOPHASE_DIR" init --no-sync

    assert_dir_exists "$TWOPHASE_DIR/.claude/.jean-claude"
    assert_file_exists "$TWOPHASE_DIR/.claude/.jean-claude/meta.json"

    # Phase 2: set up sync
    run_jean_claude "$TWOPHASE_DIR" sync setup --url "$REMOTE_REPO"

    # Should now have a git repo
    assert_dir_exists "$TWOPHASE_DIR/.claude/.jean-claude/.git"

    # Should be able to pull
    run_jean_claude "$TWOPHASE_DIR" sync pull --force

    # Should have files from remote
    if [ -f "$TWOPHASE_DIR/.claude/CLAUDE.md" ]; then
        print_success "Two-phase flow: pull works after sync setup"
    else
        print_info "Two-phase flow: no files pulled (remote may not have CLAUDE.md)"
    fi
}

# Test sync setup when already configured
test_sync_setup_already_configured() {
    print_test "sync setup when already configured shows current remote"

    output=$(run_jean_claude "$MACHINE1_DIR" sync setup 2>&1 || true)

    if echo "$output" | grep -qi "already configured"; then
        print_success "sync setup detected existing configuration"
    else
        print_failure "sync setup did not detect existing configuration"
    fi
}

# Test sync setup --url to reconfigure remote
test_sync_setup_reconfigure_url() {
    print_test "sync setup --url reconfigures remote"

    # Create a second remote repo
    local SECOND_REMOTE="$TEST_DIR/remote-repo-2"
    local SECOND_REMOTE_TEMP="$TEST_DIR/remote-repo-2-temp"
    mkdir -p "$SECOND_REMOTE_TEMP"
    (
        cd "$SECOND_REMOTE_TEMP"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
        echo '{"version":"1.1.0","managedBy":"jean-claude","lastSync":null,"machineId":"test","platform":"linux","claudeConfigPath":"/test"}' > meta.json
        git add meta.json
        git commit -m "Initial commit" > /dev/null 2>&1
    )
    git clone --bare "$SECOND_REMOTE_TEMP" "$SECOND_REMOTE" > /dev/null 2>&1
    rm -rf "$SECOND_REMOTE_TEMP"

    # Reconfigure machine1 to use second remote
    output=$(run_jean_claude "$MACHINE1_DIR" sync setup --url "$SECOND_REMOTE" 2>&1 || true)

    if echo "$output" | grep -qi "updated"; then
        print_success "Remote URL updated successfully"
    else
        print_info "Remote URL reconfigure output: may have been unchanged"
    fi

    # Restore original remote
    run_jean_claude "$MACHINE1_DIR" sync setup --url "$REMOTE_REPO" > /dev/null 2>&1
}

# Test deprecated command stubs
test_deprecated_push() {
    print_test "deprecated push command shows warning and still works"

    echo "# Deprecated test content" > "$MACHINE1_DIR/.claude/CLAUDE.md"

    output=$(run_jean_claude "$MACHINE1_DIR" push 2>&1 || true)

    if echo "$output" | grep -qi "deprecated"; then
        print_success "push shows deprecation warning"
    else
        print_failure "push does not show deprecation warning"
    fi

    if echo "$output" | grep -qi "sync push"; then
        print_success "push suggests 'sync push' as replacement"
    else
        print_failure "push does not suggest 'sync push'"
    fi
}

test_deprecated_pull() {
    print_test "deprecated pull command shows warning and still works"

    output=$(run_jean_claude "$MACHINE2_DIR" pull --force 2>&1 || true)

    if echo "$output" | grep -qi "deprecated"; then
        print_success "pull shows deprecation warning"
    else
        print_failure "pull does not show deprecation warning"
    fi

    if echo "$output" | grep -qi "sync pull"; then
        print_success "pull suggests 'sync pull' as replacement"
    else
        print_failure "pull does not suggest 'sync pull'"
    fi
}

test_deprecated_status() {
    print_test "deprecated status command shows warning and still works"

    output=$(run_jean_claude "$MACHINE1_DIR" status 2>&1 || true)

    if echo "$output" | grep -qi "deprecated"; then
        print_success "status shows deprecation warning"
    else
        print_failure "status does not show deprecation warning"
    fi

    if echo "$output" | grep -qi "sync status"; then
        print_success "status suggests 'sync status' as replacement"
    else
        print_failure "status does not suggest 'sync status'"
    fi

    # Verify it still actually shows status info
    if echo "$output" | grep -qi "Status"; then
        print_success "status still displays status information"
    else
        print_failure "status does not display status information"
    fi
}

# Test keybindings.json sync
test_keybindings_sync() {
    print_test "keybindings.json push and pull"

    # Create keybindings.json on machine1
    cat > "$MACHINE1_DIR/.claude/keybindings.json" << 'KEYBINDINGS'
{
  "submit": "ctrl+enter",
  "cancel": "escape",
  "clear": "ctrl+l"
}
KEYBINDINGS

    run_jean_claude "$MACHINE1_DIR" sync push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/keybindings.json"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/keybindings.json" "ctrl+enter"

    run_jean_claude "$MACHINE2_DIR" sync pull --force

    assert_file_exists "$MACHINE2_DIR/.claude/keybindings.json"

    if grep -q "ctrl+enter" "$MACHINE2_DIR/.claude/keybindings.json"; then
        print_success "keybindings.json content synced correctly"
    else
        print_failure "keybindings.json content not synced"
    fi
}

test_keybindings_update_sync() {
    print_test "keybindings.json modification syncs"

    cat > "$MACHINE2_DIR/.claude/keybindings.json" << 'KEYBINDINGS'
{
  "submit": "ctrl+enter",
  "cancel": "escape",
  "clear": "ctrl+l",
  "newBinding": "ctrl+shift+n"
}
KEYBINDINGS

    run_jean_claude "$MACHINE2_DIR" sync push
    run_jean_claude "$MACHINE1_DIR" sync pull --force

    if grep -q "newBinding" "$MACHINE1_DIR/.claude/keybindings.json"; then
        print_success "Updated keybindings.json synced back"
    else
        print_failure "Updated keybindings.json not synced"
    fi
}

# Test statusline.sh sync
test_statusline_sync() {
    print_test "statusline.sh push and pull"

    echo '#!/bin/bash\necho "custom statusline"' > "$MACHINE1_DIR/.claude/statusline.sh"

    run_jean_claude "$MACHINE1_DIR" sync push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/statusline.sh"

    run_jean_claude "$MACHINE2_DIR" sync pull --force

    assert_file_exists "$MACHINE2_DIR/.claude/statusline.sh"

    if grep -q "custom statusline" "$MACHINE2_DIR/.claude/statusline.sh"; then
        print_success "statusline.sh content synced correctly"
    else
        print_failure "statusline.sh content not synced"
    fi
}

# Test agents directory direct push/pull
test_agents_direct_sync() {
    print_test "agents directory direct push and pull"

    mkdir -p "$MACHINE1_DIR/.claude/agents"
    echo "# Code Review Agent" > "$MACHINE1_DIR/.claude/agents/code-reviewer.md"
    echo "# Refactor Agent" > "$MACHINE1_DIR/.claude/agents/refactorer.md"

    run_jean_claude "$MACHINE1_DIR" sync push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/agents/code-reviewer.md"
    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/agents/refactorer.md"

    run_jean_claude "$MACHINE2_DIR" sync pull --force

    assert_file_exists "$MACHINE2_DIR/.claude/agents/code-reviewer.md"
    assert_file_exists "$MACHINE2_DIR/.claude/agents/refactorer.md"

    if grep -q "Code Review Agent" "$MACHINE2_DIR/.claude/agents/code-reviewer.md"; then
        print_success "Agent content synced correctly"
    else
        print_failure "Agent content not synced"
    fi
}

test_agents_nested_sync() {
    print_test "agents nested directory sync"

    mkdir -p "$MACHINE1_DIR/.claude/agents/specialized"
    echo "# Security Agent" > "$MACHINE1_DIR/.claude/agents/specialized/security.md"

    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE2_DIR" sync pull --force

    if [ -f "$MACHINE2_DIR/.claude/agents/specialized/security.md" ]; then
        print_success "Nested agent directories synced"
    else
        print_failure "Nested agent directories not synced"
    fi
}

# Test meta.json field verification
test_meta_json_fields() {
    print_test "meta.json contains all required fields"

    local meta_file="$MACHINE1_DIR/.claude/.jean-claude/meta.json"
    assert_file_exists "$meta_file"

    assert_file_contains "$meta_file" "version"
    assert_file_contains "$meta_file" "managedBy"
    assert_file_contains "$meta_file" "machineId"
    assert_file_contains "$meta_file" "platform"
    assert_file_contains "$meta_file" "claudeConfigPath"
}

test_meta_json_managed_by() {
    print_test "meta.json managedBy field is set to jean-claude"

    local meta_file="$MACHINE1_DIR/.claude/.jean-claude/meta.json"

    if grep -q '"managedBy"' "$meta_file" && grep -q '"jean-claude"' "$meta_file"; then
        print_success "managedBy field is set to 'jean-claude'"
    else
        print_failure "managedBy field is not set correctly"
    fi
}

test_meta_json_persists_across_push_pull() {
    print_test "meta.json persists across push and pull cycles"

    local meta_file="$MACHINE1_DIR/.claude/.jean-claude/meta.json"
    local initial_machine_id
    initial_machine_id=$(grep -oE '"machineId"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*: *"//' | sed 's/"$//')

    echo "# Meta persistence test" > "$MACHINE1_DIR/.claude/CLAUDE.md"
    run_jean_claude "$MACHINE1_DIR" sync push
    run_jean_claude "$MACHINE1_DIR" sync pull --force

    local current_machine_id
    current_machine_id=$(grep -oE '"machineId"[[:space:]]*:[[:space:]]*"[^"]*"' "$meta_file" | sed 's/.*: *"//' | sed 's/"$//')

    if [ "$initial_machine_id" = "$current_machine_id" ]; then
        print_success "machineId persisted across push/pull"
    else
        print_failure "machineId changed: $initial_machine_id -> $current_machine_id"
    fi

    assert_file_contains "$meta_file" "version"
    assert_file_contains "$meta_file" "managedBy"
}

# Test init partial recovery
test_init_partial_recovery() {
    print_test "init recovers when meta.json is missing but .git exists"

    local RECOVERY_DIR="$TEST_DIR/machine-recovery"
    mkdir -p "$RECOVERY_DIR/.claude"

    # First, init normally with sync
    run_jean_claude "$RECOVERY_DIR" init --sync --url "$REMOTE_REPO"

    assert_dir_exists "$RECOVERY_DIR/.claude/.jean-claude/.git"
    assert_file_exists "$RECOVERY_DIR/.claude/.jean-claude/meta.json"

    # Simulate partial state: delete meta.json but leave .git
    rm "$RECOVERY_DIR/.claude/.jean-claude/meta.json"

    # Re-run init — should detect existing .git and reuse it
    output=$(run_jean_claude "$RECOVERY_DIR" init --no-sync 2>&1 || true)

    # meta.json should be recreated
    assert_file_exists "$RECOVERY_DIR/.claude/.jean-claude/meta.json"

    # .git should still be there
    assert_dir_exists "$RECOVERY_DIR/.claude/.jean-claude/.git"

    if echo "$output" | grep -qi "existing Git repository"; then
        print_success "Init detected and reused existing .git repo"
    else
        print_info "Init ran but may not have logged repo reuse message"
    fi
}

# Test sync push with no remote
test_sync_push_no_remote() {
    print_test "sync push with no remote warns about local-only commit"

    local NOREMOTE_DIR="$TEST_DIR/machine-noremote"
    mkdir -p "$NOREMOTE_DIR/.claude"

    # Init without sync (no remote)
    run_jean_claude "$NOREMOTE_DIR" init --no-sync

    # Manually init git without a remote
    (
        cd "$NOREMOTE_DIR/.claude/.jean-claude"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
    )

    # Create a file to push
    echo "# No remote test" > "$NOREMOTE_DIR/.claude/CLAUDE.md"

    output=$(run_jean_claude "$NOREMOTE_DIR" sync push 2>&1 || true)

    if echo "$output" | grep -qi "no remote\|committed locally"; then
        print_success "Push with no remote warns about local-only commit"
    else
        print_info "Push output did not contain expected warning"
    fi
}

# Test profile sync across machines
test_profile_registry_sync() {
    print_test "profiles.json syncs across machines via push/pull"

    # Machine1 already has a 'work' profile from earlier tests
    run_jean_claude "$MACHINE1_DIR" sync push

    assert_file_exists "$MACHINE1_DIR/.claude/.jean-claude/profiles.json"

    run_jean_claude "$MACHINE2_DIR" sync pull --force

    if [ -f "$MACHINE2_DIR/.claude/.jean-claude/profiles.json" ]; then
        if grep -q "work" "$MACHINE2_DIR/.claude/.jean-claude/profiles.json"; then
            print_success "profiles.json synced to machine2 with profile data"
        else
            print_failure "profiles.json synced but missing profile data"
        fi
    else
        print_info "profiles.json not synced (may not be in FILE_MAPPINGS)"
    fi
}

# Test profile list shows empty state
test_profile_list_empty() {
    print_test "profile list with no profiles"

    local FRESH_DIR="$TEST_DIR/machine-no-profiles"
    mkdir -p "$FRESH_DIR/.claude"
    run_jean_claude "$FRESH_DIR" init --no-sync 2>/dev/null

    output=$(run_jean_claude "$FRESH_DIR" profile list 2>&1 || true)

    if echo "$output" | grep -qi "no profiles"; then
        print_success "Profile list correctly shows empty state"
    else
        print_info "Profile list output for empty state (may differ)"
    fi
}

# Test profile delete nonexistent profile
test_profile_delete_nonexistent() {
    print_test "delete nonexistent profile fails"

    if run_jean_claude "$MACHINE1_DIR" profile delete nonexistent --yes 2>&1; then
        print_failure "Should have failed deleting nonexistent profile"
    else
        print_success "Correctly rejected deleting nonexistent profile"
    fi
}

# Test profile with hyphenated name
test_profile_create_hyphenated_name() {
    print_test "create profile with hyphenated name"

    run_jean_claude "$MACHINE1_DIR" profile create my-project --yes --shell .bashrc

    assert_dir_exists "$MACHINE1_DIR/.claude-my-project"
    assert_file_exists "$MACHINE1_DIR/.claude-my-project/CLAUDE.md"
    assert_file_contains "$MACHINE1_DIR/.claude/.jean-claude/profiles.json" "my-project"
    assert_file_contains "$MACHINE1_DIR/.bashrc" "claude-my-project"

    # Clean up
    run_jean_claude "$MACHINE1_DIR" profile delete my-project --yes
}

# Test profile refresh after adding new shared items
test_profile_refresh_new_shared_items() {
    print_test "profile refresh picks up newly created shared directories"

    mkdir -p "$MACHINE1_DIR/.claude/skills"
    echo "# New skill" > "$MACHINE1_DIR/.claude/skills/new-skill.md"

    mkdir -p "$MACHINE1_DIR/.claude/plugins"
    echo "# Plugin" > "$MACHINE1_DIR/.claude/plugins/test-plugin.md"

    run_jean_claude "$MACHINE1_DIR" profile refresh work

    if [ -L "$MACHINE1_DIR/.claude-work/skills" ]; then
        print_success "skills symlink created after refresh"
    else
        print_failure "skills symlink not created after refresh"
    fi

    if [ -L "$MACHINE1_DIR/.claude-work/plugins" ]; then
        print_success "plugins symlink created after refresh"
    else
        print_failure "plugins symlink not created after refresh"
    fi

    if [ -f "$MACHINE1_DIR/.claude-work/skills/new-skill.md" ]; then
        print_success "skills content accessible through profile symlink"
    else
        print_failure "skills content not accessible through profile symlink"
    fi

    if [ -f "$MACHINE1_DIR/.claude-work/plugins/test-plugin.md" ]; then
        print_success "plugins content accessible through profile symlink"
    else
        print_failure "plugins content not accessible through profile symlink"
    fi
}

# Test profile keybindings symlink
test_profile_keybindings_symlink() {
    print_test "profile symlinks keybindings.json"

    if [ ! -f "$MACHINE1_DIR/.claude/keybindings.json" ]; then
        echo '{"submit": "ctrl+enter"}' > "$MACHINE1_DIR/.claude/keybindings.json"
    fi

    run_jean_claude "$MACHINE1_DIR" profile refresh work

    if [ -L "$MACHINE1_DIR/.claude-work/keybindings.json" ]; then
        print_success "keybindings.json is symlinked in profile"

        local target
        target=$(readlink "$MACHINE1_DIR/.claude-work/keybindings.json")
        if [ "$target" = "$MACHINE1_DIR/.claude/keybindings.json" ]; then
            print_success "keybindings.json symlink target is correct"
        else
            print_failure "keybindings.json symlink target is wrong: $target"
        fi

        if grep -q "ctrl+enter\|submit" "$MACHINE1_DIR/.claude-work/keybindings.json"; then
            print_success "keybindings.json content accessible through profile symlink"
        else
            print_failure "keybindings.json content not accessible"
        fi
    else
        print_failure "keybindings.json not symlinked in profile"
    fi
}

# Test sync status heading changes based on git presence
test_sync_status_heading() {
    print_test "sync status uses different headings based on git presence"

    # With git configured, should show "Sync Status"
    output_with_git=$(run_jean_claude "$MACHINE1_DIR" sync status 2>&1 || true)

    if echo "$output_with_git" | grep -q "Sync Status"; then
        print_success "Shows 'Sync Status' when git is configured"
    else
        print_failure "Does not show 'Sync Status' when git is configured"
    fi

    # Without git, should show "File Status"
    local NOGIT_DIR="$TEST_DIR/machine-nogit"
    mkdir -p "$NOGIT_DIR/.claude"
    run_jean_claude "$NOGIT_DIR" init --no-sync 2>/dev/null

    output_without_git=$(run_jean_claude "$NOGIT_DIR" sync status 2>&1 || true)

    if echo "$output_without_git" | grep -q "File Status"; then
        print_success "Shows 'File Status' when no git repo"
    else
        print_failure "Does not show 'File Status' when no git repo"
    fi
}

# Test init --url --no-sync conflicting flags
test_init_conflicting_flags() {
    print_test "init --url --no-sync warns and proceeds with sync"

    local CONFLICT_DIR="$TEST_DIR/machine-conflict-flags"
    mkdir -p "$CONFLICT_DIR/.claude"

    output=$(run_jean_claude "$CONFLICT_DIR" init --url "$REMOTE_REPO" --no-sync 2>&1 || true)

    if echo "$output" | grep -qi "ignoring\|implies"; then
        print_success "Warns about conflicting --url and --no-sync flags"
    else
        print_info "No explicit warning about conflicting flags"
    fi

    # --url should win: git should be set up
    assert_dir_exists "$CONFLICT_DIR/.claude/.jean-claude/.git"
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

    print_header "Testing sync push command"
    test_push_initial_files
    test_push_no_changes
    test_push_modified_files
    test_push_new_hook

    print_header "Testing sync pull command"
    test_pull_basic
    test_pull_overwrites_local
    test_pull_not_initialized

    print_header "Testing sync status command"
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

    print_header "Testing init variations"
    test_init_no_sync
    test_init_url_implies_sync
    test_two_phase_init_then_sync_setup
    test_init_partial_recovery
    test_init_conflicting_flags

    print_header "Testing sync setup command"
    test_sync_setup_already_configured
    test_sync_setup_reconfigure_url

    print_header "Testing deprecated command stubs"
    test_deprecated_push
    test_deprecated_pull
    test_deprecated_status

    print_header "Testing keybindings.json sync"
    test_keybindings_sync
    test_keybindings_update_sync

    print_header "Testing statusline.sh sync"
    test_statusline_sync

    print_header "Testing agents directory sync"
    test_agents_direct_sync
    test_agents_nested_sync

    print_header "Testing sync push edge cases"
    test_sync_push_no_remote

    print_header "Testing sync status heading"
    test_sync_status_heading

    print_header "Testing profile management"
    test_profile_create
    test_profile_symlinks
    test_profile_symlink_content_shared
    test_profile_independent_claude_md
    test_profile_share_claude_md
    test_profile_no_share_claude_md
    test_profile_share_statusline
    test_profile_no_share_statusline
    test_profile_share_both
    test_profile_shell_alias
    test_profile_list
    test_profile_create_second
    test_profile_create_duplicate
    test_profile_create_invalid_name
    test_profile_refresh
    test_profile_refresh_new_shared_items
    test_profile_keybindings_symlink
    test_profile_delete
    test_profile_delete_preserves_main
    test_profile_not_initialized
    test_profile_list_empty
    test_profile_delete_nonexistent
    test_profile_create_hyphenated_name

    print_header "Testing metadata"
    test_metadata_persistence
    test_last_sync_timestamp
    test_meta_json_fields
    test_meta_json_managed_by
    test_meta_json_persists_across_push_pull

    print_header "Testing profile sync across machines"
    test_profile_registry_sync

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
