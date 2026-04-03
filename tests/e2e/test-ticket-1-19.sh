#!/usr/bin/env bash

# E2E tests for tickets #1 and #19
#
# Ticket #1:  Validate repo contains Claude config before syncing
#             A non-jean-claude repo should be rejected with a warning.
#
# Ticket #19: sync setup has no way to reconfigure an existing remote
#             Running `sync setup --url <new>` when a remote already exists
#             should update the remote URL.

# Don't exit on error - we want to see all test results
# set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Paths
TEST_DIR=""
JEAN_CLAUDE_BIN=""

# Per-test environment variables set by create_test_env
TICKET_REMOTE=""
TICKET_M1=""

# Cleanup function
cleanup() {
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        echo -e "\n${BLUE}Cleaning up test directory...${NC}"
        rm -rf "$TEST_DIR"
    fi
}

# Set up trap to cleanup on exit
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Print helpers
# ---------------------------------------------------------------------------
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
    echo -e "${GREEN}PASS $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_failure() {
    echo -e "${RED}FAIL $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

print_info() {
    echo -e "${BLUE}INFO $1${NC}"
}

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------
assert_output_contains() {
    local output="$1"
    local expected="$2"
    if echo "$output" | grep -q "$expected"; then
        print_success "Output contains: $expected"
    else
        print_failure "Output does not contain: $expected"
        print_info "Actual output: $output"
        return 1
    fi
}

assert_equals() {
    local actual="$1"
    local expected="$2"
    local label="${3:-values}"
    if [ "$actual" = "$expected" ]; then
        print_success "$label match: $expected"
    else
        print_failure "$label mismatch: expected '$expected', got '$actual'"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# Helper to run jean-claude with environment isolation
# ---------------------------------------------------------------------------
run_jean_claude() {
    local machine_dir=$1
    shift
    XDG_CONFIG_HOME="$machine_dir" HOME="$machine_dir" \
    GIT_AUTHOR_NAME="Test User" GIT_AUTHOR_EMAIL="test@example.com" \
    GIT_COMMITTER_NAME="Test User" GIT_COMMITTER_EMAIL="test@example.com" \
    node "$JEAN_CLAUDE_BIN" "$@"
}

# ---------------------------------------------------------------------------
# Per-test isolated environment builder
# ---------------------------------------------------------------------------
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
    mkdir -p "$m1/.claude"

    TICKET_REMOTE="$bare_repo"
    TICKET_M1="$m1"
}

# ---------------------------------------------------------------------------
# Global setup: build project, create temp dir
# ---------------------------------------------------------------------------
setup() {
    print_header "Setting up test environment"

    TEST_DIR=$(mktemp -d -t jean-claude-e2e-ticket-1-19.XXXXXX)
    print_info "Test directory: $TEST_DIR"

    # Build the project
    cd "$(dirname "$0")/../.."
    print_info "Building jean-claude..."
    npm run build > /dev/null 2>&1

    JEAN_CLAUDE_BIN="$(pwd)/dist/index.js"
    if [ ! -f "$JEAN_CLAUDE_BIN" ]; then
        echo -e "${RED}Error: jean-claude binary not found at $JEAN_CLAUDE_BIN${NC}"
        exit 1
    fi
    print_info "Binary: $JEAN_CLAUDE_BIN"
    print_info "Setup complete"
}

# ===========================================================================
# Ticket #1: Validate repo contains Claude config before syncing
# ===========================================================================
test_ticket_1_rejects_non_jean_claude_repo() {
    print_header "Ticket #1 - Reject non-jean-claude repo"

    # --- Part A: non-jean-claude repo should be rejected ---
    print_test "#1a: init with non-jean-claude repo warns and can be cancelled"

    local env_dir="$TEST_DIR/ticket1"
    mkdir -p "$env_dir"

    # Create a bare repo with non-jean-claude content
    local bare_repo="$env_dir/remote.git"
    local temp_repo="$env_dir/temp-init"
    mkdir -p "$temp_repo"
    (
        cd "$temp_repo"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
        echo "# My dotfiles" > README.md
        echo '{"some": "random config"}' > config.json
        git add .
        git commit -m "Initial commit" > /dev/null 2>&1
    )
    git clone --bare "$temp_repo" "$bare_repo" > /dev/null 2>&1
    rm -rf "$temp_repo"

    local m1="$env_dir/machine1"
    mkdir -p "$m1/.claude"

    # Pipe "n" to decline the warning prompt
    local output
    output=$(echo "n" | run_jean_claude "$m1" init --sync --url "$bare_repo" 2>&1)
    local exit_code=$?

    # Assert: warning message about invalid repo
    assert_output_contains "$output" "does not appear to be a Jean-Claude config repo"

    # Assert: init was cancelled (non-zero exit or no .jean-claude setup)
    if [ $exit_code -ne 0 ] || [ ! -d "$m1/.claude/.jean-claude/.git" ]; then
        print_success "Init was cancelled as expected (exit=$exit_code)"
    else
        print_failure "Init should have been cancelled but it completed"
    fi

    # --- Part B: valid jean-claude repo should pass validation ---
    print_test "#1b: init with valid jean-claude repo succeeds without warning"

    create_test_env "ticket1_valid" true
    local valid_output
    valid_output=$(run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" 2>&1)
    local valid_exit=$?

    assert_equals "$valid_exit" "0" "Exit code"

    # Should NOT contain the warning
    if echo "$valid_output" | grep -q "does not appear to be a Jean-Claude config repo"; then
        print_failure "Valid repo should not trigger a warning"
    else
        print_success "No warning for valid jean-claude repo"
    fi
}

# ===========================================================================
# Ticket #19: sync setup can reconfigure an existing remote
# ===========================================================================
test_ticket_19_reconfigure_existing_remote() {
    print_header "Ticket #19 - Reconfigure existing remote"

    print_test "#19: sync setup --url updates the existing remote URL"

    local env_dir="$TEST_DIR/ticket19"
    mkdir -p "$env_dir"

    # Remote 1 (valid jean-claude repo)
    create_test_env "ticket19_r1" true
    local remote1="$TICKET_REMOTE"
    local m1="$TICKET_M1"

    # Remote 2 (another valid jean-claude repo)
    local temp2="$env_dir/temp2"
    mkdir -p "$temp2"
    (
        cd "$temp2"
        git init > /dev/null 2>&1
        git config user.email "test@example.com"
        git config user.name "Test User"
        echo '{"version":"2.0.0","managedBy":"jean-claude","lastSync":null,"machineId":"test2","platform":"linux","claudeConfigPath":"/test"}' > meta.json
        git add meta.json
        git commit -m "Initial commit" > /dev/null 2>&1
    )
    local remote2="$env_dir/remote2.git"
    git clone --bare "$temp2" "$remote2" > /dev/null 2>&1
    rm -rf "$temp2"

    run_jean_claude "$m1" init --sync --url "$remote1"

    local current_url
    current_url=$(git -C "$m1/.claude/.jean-claude" remote get-url origin)
    assert_equals "$current_url" "$remote1" "Initial remote URL"

    run_jean_claude "$m1" sync setup --url "$remote2"

    local new_url
    new_url=$(git -C "$m1/.claude/.jean-claude" remote get-url origin)
    assert_equals "$new_url" "$remote2" "Updated remote URL"
}

# ===========================================================================
# Runner
# ===========================================================================
setup
test_ticket_1_rejects_non_jean_claude_repo
test_ticket_19_reconfigure_existing_remote

# Summary
echo ""
print_header "Results: $TESTS_PASSED/$TESTS_RUN passed, $TESTS_FAILED failed"
exit "$TESTS_FAILED"
