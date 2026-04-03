#!/usr/bin/env bash

# E2E tests for tickets #36 and #35: Empty repo / first-use edge cases
#
# #36: First sync push fails on new repo — pull --rebase with no upstream
# #35: Clone fallback to local init is broken after repo validation change
#
# These tests verify that jean-claude handles empty bare repos correctly
# during first-time init and first sync push operations.

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
JEAN_CLAUDE_BIN=""

# Per-test environment variables (set by create_test_env)
TICKET_REMOTE=""
TICKET_M1=""
TICKET_M2=""

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

assert_output_not_contains() {
    local output="$1"
    local unexpected="$2"
    if echo "$output" | grep -q "$unexpected" 2>/dev/null; then
        print_failure "Output should not contain: $unexpected"
        return 1
    else
        print_success "Output does not contain: $unexpected"
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

# Helper function to run jean-claude commands
run_jean_claude() {
    local machine_dir=$1
    shift
    XDG_CONFIG_HOME="$machine_dir" HOME="$machine_dir" \
    GIT_AUTHOR_NAME="Test User" GIT_AUTHOR_EMAIL="test@example.com" \
    GIT_COMMITTER_NAME="Test User" GIT_COMMITTER_EMAIL="test@example.com" \
    node "$JEAN_CLAUDE_BIN" "$@"
}

# Per-test environment helper
# Creates an isolated environment with a bare repo and two machine directories.
# When with_initial_commit is true (default), seeds the bare repo with meta.json.
# When false, the bare repo is completely empty (no commits).
create_test_env() {
    local name=$1
    local with_initial_commit=${2:-true}

    local env_dir="$TEST_DIR/$name"
    mkdir -p "$env_dir"

    local bare_repo="$env_dir/remote.git"

    if [ "$with_initial_commit" = true ]; then
        local temp_repo="$env_dir/temp-init"
        mkdir -p "$temp_repo"
        (
            cd "$temp_repo"
            git init > /dev/null 2>&1
            git config user.email "test@example.com"
            git config user.name "Test User"
            echo '{"version":"2.0.0","managedBy":"jean-claude","lastSync":null,"machineId":"test","platform":"linux","claudeConfigPath":"/test"}' > meta.json
            git add meta.json
            git commit -m "Initial commit" > /dev/null 2>&1
        )
        git clone --bare "$temp_repo" "$bare_repo" > /dev/null 2>&1
        rm -rf "$temp_repo"
    else
        git init --bare "$bare_repo" > /dev/null 2>&1
    fi

    local m1="$env_dir/machine1"
    local m2="$env_dir/machine2"
    mkdir -p "$m1/.claude" "$m2/.claude"

    TICKET_REMOTE="$bare_repo"
    TICKET_M1="$m1"
    TICKET_M2="$m2"
}

# Setup: build project and create temp dir
setup() {
    print_header "Setting up test environment"

    TEST_DIR=$(mktemp -d -t jean-claude-e2e-ticket-36-35.XXXXXX)
    print_info "Created test directory: $TEST_DIR"

    # Build jean-claude
    print_info "Building jean-claude..."
    cd "$(dirname "$0")/../.."
    npm run build > /dev/null 2>&1

    JEAN_CLAUDE_BIN="$(pwd)/dist/index.js"
    if [ ! -f "$JEAN_CLAUDE_BIN" ]; then
        echo -e "${RED}Error: jean-claude binary not found at $JEAN_CLAUDE_BIN${NC}"
        exit 1
    fi
    print_info "Jean-claude binary: $JEAN_CLAUDE_BIN"

    print_success "Test environment setup complete"
}

# =============================================================================
# Test #36: First sync push fails on new repo — pull --rebase with no upstream
# =============================================================================
# Bug: commitAndPush() in src/lib/git.ts does `git pull --rebase` before push.
# On a fresh repo with no upstream tracking branch (empty bare repo, first push
# ever), this fails with a misleading NETWORK_ERROR.
test_ticket_36_first_push_empty_repo() {
    print_header "Ticket #36: First sync push on empty repo"

    # Step 1: Create environment with an empty bare repo (no initial commits)
    create_test_env "ticket36" false

    print_info "Remote (empty bare repo): $TICKET_REMOTE"
    print_info "Machine 1: $TICKET_M1"

    # Step 2: Init with sync pointing at the empty remote
    print_test "Init with empty remote succeeds"
    local init_output
    init_output=$(run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" 2>&1)
    local init_exit=$?
    print_info "Init output: $init_output"

    if [ $init_exit -eq 0 ]; then
        print_success "Init command exited with code 0"
    else
        print_failure "Init command exited with code $init_exit (expected 0)"
    fi

    # Step 3: Create a test config file to push
    echo "# Test config" > "$TICKET_M1/.claude/CLAUDE.md"

    # Step 4: Run sync push and capture output
    print_test "Sync push to empty remote succeeds without NETWORK_ERROR"
    local output
    output=$(run_jean_claude "$TICKET_M1" sync push 2>&1)
    local exit_code=$?
    print_info "Sync push output: $output"

    # Step 5: Assertions
    if [ $exit_code -eq 0 ]; then
        print_success "Sync push exited with code 0"
    else
        print_failure "Sync push exited with code $exit_code (expected 0)"
    fi

    assert_output_not_contains "$output" "NETWORK_ERROR"
    assert_output_not_contains "$output" "pull --rebase failed"
    assert_output_not_contains "$output" "no tracking information"

    assert_file_exists "$TICKET_M1/.claude/.jean-claude/CLAUDE.md"

    print_test "Bare repo received commits after push"
    assert_command_success "git --git-dir=\"$TICKET_REMOTE\" log --oneline"
}

# =============================================================================
# Test #35: Clone fallback to local init is broken after repo validation change
# =============================================================================
# Bug: When cloning an empty repo, the clone succeeds but git.reset(['HEAD'])
# fails (no commits). The catch block tries initRepo + addRemote but .git
# already has origin from the clone, so addRemote fails with
# "remote origin already exists."
test_ticket_35_clone_fallback_empty_repo() {
    print_header "Ticket #35: Clone fallback on empty repo"

    # Step 1: Create environment with an empty bare repo (no initial commits)
    create_test_env "ticket35" false

    print_info "Remote (empty bare repo): $TICKET_REMOTE"
    print_info "Machine 1: $TICKET_M1"

    # Step 2: Run init --sync --url against the empty remote and capture output
    print_test "Init with empty remote handles clone fallback correctly"
    local output
    output=$(run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" 2>&1)
    local exit_code=$?
    print_info "Init output: $output"

    # Step 3: Assertions
    if [ $exit_code -eq 0 ]; then
        print_success "Init command exited with code 0"
    else
        print_failure "Init command exited with code $exit_code (expected 0)"
    fi

    assert_dir_exists "$TICKET_M1/.claude/.jean-claude/.git"

    print_test "Remote origin is correctly configured"
    local remote_url
    remote_url=$(git -C "$TICKET_M1/.claude/.jean-claude" remote get-url origin 2>&1)
    local remote_exit=$?
    if [ $remote_exit -eq 0 ]; then
        print_success "Remote origin URL: $remote_url"
        # Verify it points to our bare repo
        if echo "$remote_url" | grep -q "$(basename "$TICKET_REMOTE")" 2>/dev/null; then
            print_success "Remote origin points to the expected bare repo"
        else
            print_failure "Remote origin URL '$remote_url' does not match expected repo"
        fi
    else
        print_failure "Failed to get remote origin URL: $remote_url"
    fi

    print_test "meta.json exists and contains managedBy"
    assert_file_exists "$TICKET_M1/.claude/.jean-claude/meta.json"
    assert_file_contains "$TICKET_M1/.claude/.jean-claude/meta.json" "managedBy"

    print_test "No error messages about remote origin already exists"
    assert_output_not_contains "$output" "remote origin already exists"
    assert_output_not_contains "$output" "unexpected error"
}

# =============================================================================
# Runner
# =============================================================================

setup

test_ticket_36_first_push_empty_repo
test_ticket_35_clone_fallback_empty_repo

# Summary
echo ""
print_header "Test Results"
echo -e "Results: ${GREEN}$TESTS_PASSED${NC}/${BLUE}$TESTS_RUN${NC} passed, ${RED}$TESTS_FAILED${NC} failed"
exit $TESTS_FAILED  # 0 = all passed
