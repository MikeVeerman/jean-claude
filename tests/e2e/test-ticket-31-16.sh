#!/usr/bin/env bash

# E2E tests for tickets #31 and #16:
#   #31 - Non-interactive sync setup via --url flag
#   #16 - statusline.sh file sync mapping

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

# Per-test env vars (set by create_test_env)
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

# Helper function to run jean-claude commands
run_jean_claude() {
    local machine_dir=$1
    shift
    XDG_CONFIG_HOME="$machine_dir" HOME="$machine_dir" \
    GIT_AUTHOR_NAME="Test User" GIT_AUTHOR_EMAIL="test@example.com" \
    GIT_COMMITTER_NAME="Test User" GIT_COMMITTER_EMAIL="test@example.com" \
    node "$JEAN_CLAUDE_BIN" "$@"
}

# Create an isolated test environment for a single test
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

# Global setup: build and prepare temp dir
setup() {
    print_header "Setting up test environment"

    TEST_DIR=$(mktemp -d -t jean-claude-e2e-31-16.XXXXXX)
    print_info "Created test directory: $TEST_DIR"

    # Build jean-claude
    cd "$(dirname "$0")/../.."
    print_info "Building jean-claude..."
    npm run build > /dev/null 2>&1

    JEAN_CLAUDE_BIN="$(pwd)/dist/index.js"
    if [ ! -f "$JEAN_CLAUDE_BIN" ]; then
        echo -e "${RED}Error: jean-claude binary not found at $JEAN_CLAUDE_BIN${NC}"
        exit 1
    fi
    print_info "Jean-claude binary: $JEAN_CLAUDE_BIN"
    print_success "Test environment setup complete"
}

###############################################################################
# Test #31 - sync setup --url flag for non-interactive repo URL input
###############################################################################
test_ticket_31_sync_setup_url_flag_noninteractive() {
    print_header "Ticket #31: sync setup --url flag (non-interactive)"

    create_test_env "ticket31" true

    # Step 1: init WITHOUT sync
    print_test "#31 - init --no-sync creates .jean-claude dir"
    run_jean_claude "$TICKET_M1" init --no-sync > /dev/null 2>&1
    assert_dir_exists "$TICKET_M1/.claude/.jean-claude"

    # Step 2: verify no git remote configured
    print_test "#31 - no git remote after init --no-sync"
    local remotes
    remotes=$(git -C "$TICKET_M1/.claude/.jean-claude" remote 2>&1 || true)
    if [ -z "$remotes" ]; then
        print_success "No git remotes configured after init --no-sync"
    else
        print_failure "Unexpected git remote(s) found: $remotes"
    fi

    # Step 3: run sync setup with --url (no stdin piped)
    print_test "#31 - sync setup --url configures remote non-interactively"
    local output exit_code
    output=$(run_jean_claude "$TICKET_M1" sync setup --url "$TICKET_REMOTE" 2>&1)
    exit_code=$?

    # Assert exit code is 0
    if [ "$exit_code" -eq 0 ]; then
        print_success "sync setup --url exited with code 0"
    else
        print_failure "sync setup --url exited with code $exit_code"
    fi

    # Assert remote is now set to the bare repo path
    print_test "#31 - remote origin points to bare repo after sync setup --url"
    local remote_url
    remote_url=$(git -C "$TICKET_M1/.claude/.jean-claude" remote get-url origin 2>&1)
    if [ "$remote_url" = "$TICKET_REMOTE" ]; then
        print_success "Remote origin URL matches: $remote_url"
    else
        print_failure "Remote origin URL mismatch: expected '$TICKET_REMOTE', got '$remote_url'"
    fi

    # Assert no interactive prompt was shown
    print_test "#31 - output does not contain interactive prompt"
    if echo "$output" | grep -q "Repository URL:"; then
        print_failure "Output contains 'Repository URL:' prompt (interactive mode detected)"
    else
        print_success "No interactive prompt detected in output"
    fi
}

###############################################################################
# Test #16 - statusline.sh sync mapping
###############################################################################
test_ticket_16_statusline_sync() {
    print_header "Ticket #16: statusline.sh sync"

    create_test_env "ticket16" true

    # Step 1: init both machines with sync
    print_test "#16 - init machine 1 with sync"
    run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M1/.claude/.jean-claude"

    print_test "#16 - init machine 2 with sync"
    run_jean_claude "$TICKET_M2" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M2/.claude/.jean-claude"

    # Step 2: create statusline.sh on machine 1
    print_test "#16 - create statusline.sh on machine 1 and push"
    cat > "$TICKET_M1/.claude/statusline.sh" << 'STATUSLINE'
#!/bin/bash
# Custom statusline script
echo "Claude Code v2.0"
STATUSLINE

    # Step 3: push from machine 1
    run_jean_claude "$TICKET_M1" sync push > /dev/null 2>&1

    # Step 4: verify statusline.sh is in the jean-claude sync repo
    assert_file_exists "$TICKET_M1/.claude/.jean-claude/statusline.sh"
    assert_file_contains "$TICKET_M1/.claude/.jean-claude/statusline.sh" "Custom statusline script"

    # Step 5: pull on machine 2
    print_test "#16 - pull statusline.sh on machine 2"
    run_jean_claude "$TICKET_M2" sync pull --force > /dev/null 2>&1

    # Step 6: verify statusline.sh arrived on machine 2
    assert_file_exists "$TICKET_M2/.claude/statusline.sh"
    assert_file_contains "$TICKET_M2/.claude/statusline.sh" "Custom statusline script"

    # Step 7: verify content matches between machines
    print_test "#16 - statusline.sh content matches between machines"
    if diff "$TICKET_M1/.claude/statusline.sh" "$TICKET_M2/.claude/statusline.sh" > /dev/null 2>&1; then
        print_success "statusline.sh content matches between machines"
    else
        print_failure "statusline.sh content differs between machines"
    fi
}

###############################################################################
# Runner
###############################################################################

setup
test_ticket_31_sync_setup_url_flag_noninteractive
test_ticket_16_statusline_sync

# Summary
echo ""
print_header "Test Results"
echo -e "Total:  $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""
echo "Results: $TESTS_PASSED/$TESTS_RUN passed, $TESTS_FAILED failed"

exit $TESTS_FAILED
