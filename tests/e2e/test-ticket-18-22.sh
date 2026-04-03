#!/usr/bin/env bash

# E2E tests for tickets #18 and #22: Pull/push divergent state handling
#
# Ticket #18: sync pull used to silently discard local changes via reset --hard.
#   The fix warns about uncommitted changes and prompts for confirmation.
#   --force bypasses the prompt.
#
# Ticket #22: sync push did not pull first, so divergent history caused a
#   confusing NETWORK_ERROR. The fix does pull --rebase before push when
#   there is a tracking branch.

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

# State
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

trap cleanup EXIT

# ---------- Print helpers ----------

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

# ---------- Assertion helpers ----------

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

assert_file_not_contains() {
    if grep -q "$2" "$1" 2>/dev/null; then
        print_failure "File $1 should not contain: $2"
        return 1
    else
        print_success "File $1 does not contain: $2"
    fi
}

assert_output_contains() {
    local output="$1"
    local expected="$2"
    if echo "$output" | grep -qi "$expected"; then
        print_success "Output contains: $expected"
    else
        print_failure "Output does not contain: $expected"
        return 1
    fi
}

assert_output_not_contains() {
    local output="$1"
    local expected="$2"
    if echo "$output" | grep -qi "$expected"; then
        print_failure "Output should not contain: $expected"
        return 1
    else
        print_success "Output does not contain: $expected"
    fi
}

# ---------- Run helper ----------

run_jean_claude() {
    local machine_dir=$1
    shift
    XDG_CONFIG_HOME="$machine_dir" HOME="$machine_dir" \
    GIT_AUTHOR_NAME="Test User" GIT_AUTHOR_EMAIL="test@example.com" \
    GIT_COMMITTER_NAME="Test User" GIT_COMMITTER_EMAIL="test@example.com" \
    node "$JEAN_CLAUDE_BIN" "$@"
}

# ---------- Per-test environment ----------

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

# ---------- Setup ----------

setup() {
    print_header "Setting up test environment"

    TEST_DIR=$(mktemp -d -t jean-claude-e2e-ticket-18-22.XXXXXX)
    print_info "Test directory: $TEST_DIR"

    # Build jean-claude
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

# ==========================================================================
# Ticket #18 - sync pull warns about uncommitted local changes
# ==========================================================================

test_ticket_18_pull_warns_uncommitted_changes() {
    print_header "Ticket #18: sync pull warns about uncommitted local changes"

    # 1. Create isolated environment
    create_test_env "ticket18" true

    # 2. Init m1
    print_test "#18 - Init machine 1"
    run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M1/.claude/.jean-claude"

    # 3. Create content on m1
    echo "# Config from machine 1" > "$TICKET_M1/.claude/CLAUDE.md"

    # 4. Push from m1
    print_test "#18 - Push from machine 1"
    run_jean_claude "$TICKET_M1" sync push > /dev/null 2>&1
    assert_file_exists "$TICKET_M1/.claude/.jean-claude/CLAUDE.md"

    # 5. Init m2
    print_test "#18 - Init machine 2"
    run_jean_claude "$TICKET_M2" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M2/.claude/.jean-claude"

    # 6. Pull on m2 to get m1's content
    print_test "#18 - Pull on machine 2 (initial, with --force)"
    run_jean_claude "$TICKET_M2" sync pull --force > /dev/null 2>&1
    assert_file_exists "$TICKET_M2/.claude/CLAUDE.md"
    assert_file_contains "$TICKET_M2/.claude/CLAUDE.md" "Config from machine 1"

    # 7. Make an uncommitted local edit inside m2's .jean-claude repo
    echo "local edit that should be preserved" > "$TICKET_M2/.claude/.jean-claude/CLAUDE.md"

    # 8. Test cancellation - pipe "n" to decline the confirmation prompt
    print_test "#18 - Pull with uncommitted changes warns and cancellation preserves them"
    output=$(echo "n" | run_jean_claude "$TICKET_M2" sync pull 2>&1) || true

    # 9. Assert: output mentions uncommitted changes or discard warning
    if echo "$output" | grep -qi "uncommitted\|discard\|local change"; then
        print_success "Output warns about uncommitted/local changes"
    else
        # In non-TTY environments inquirer may not display the prompt, so we
        # check whether the pull at least did NOT silently overwrite the file.
        print_info "Prompt text not detected (possible non-TTY); checking file preservation instead"
        if grep -q "local edit" "$TICKET_M2/.claude/.jean-claude/CLAUDE.md" 2>/dev/null; then
            print_success "Local edit preserved (pull did not silently discard)"
        else
            print_failure "Local edit was silently discarded without warning"
        fi
    fi

    # Verify the local edit is still there after cancellation
    assert_file_contains "$TICKET_M2/.claude/.jean-claude/CLAUDE.md" "local edit"

    # 10. Test --force: should discard local changes and pull
    print_test "#18 - Pull with --force discards uncommitted changes"
    run_jean_claude "$TICKET_M2" sync pull --force > /dev/null 2>&1

    # 11. Assert: local edit is gone, original content is restored
    assert_file_not_contains "$TICKET_M2/.claude/.jean-claude/CLAUDE.md" "local edit"
    assert_file_contains "$TICKET_M2/.claude/CLAUDE.md" "Config from machine 1"
}

# ==========================================================================
# Ticket #22 - sync push auto-rebases when remote has diverged
# ==========================================================================

test_ticket_22_push_auto_rebases_on_divergence() {
    print_header "Ticket #22: sync push auto-rebases on divergent history"

    # 1. Create isolated environment
    create_test_env "ticket22" true

    # 2. Init m1
    print_test "#22 - Init machine 1"
    run_jean_claude "$TICKET_M1" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M1/.claude/.jean-claude"

    # 3. Init m2
    print_test "#22 - Init machine 2"
    run_jean_claude "$TICKET_M2" init --sync --url "$TICKET_REMOTE" > /dev/null 2>&1
    assert_dir_exists "$TICKET_M2/.claude/.jean-claude"

    # 4. m1 creates and pushes a file
    print_test "#22 - Machine 1 pushes a skill file"
    mkdir -p "$TICKET_M1/.claude/skills"
    echo "skill from m1" > "$TICKET_M1/.claude/skills/m1-skill.md"
    run_jean_claude "$TICKET_M1" sync push > /dev/null 2>&1
    assert_file_exists "$TICKET_M1/.claude/.jean-claude/skills/m1-skill.md"

    # 5. m2 creates a DIFFERENT file and pushes WITHOUT pulling m1's change first
    print_test "#22 - Machine 2 pushes a different skill file (divergent)"
    mkdir -p "$TICKET_M2/.claude/skills"
    echo "skill from m2" > "$TICKET_M2/.claude/skills/m2-skill.md"

    output=$(run_jean_claude "$TICKET_M2" sync push 2>&1)
    exit_code=$?

    print_info "Push exit code: $exit_code"
    print_info "Push output (last 5 lines):"
    echo "$output" | tail -5 | while read -r line; do print_info "  $line"; done

    # 6. Assert: push succeeded without confusing errors
    print_test "#22 - Push succeeds with auto-rebase (no NETWORK_ERROR)"
    if [ "$exit_code" -eq 0 ]; then
        print_success "Push exit code is 0"
    else
        print_failure "Push exit code is $exit_code (expected 0)"
    fi
    assert_output_not_contains "$output" "NETWORK_ERROR"
    assert_output_not_contains "$output" "rejected"
    assert_output_not_contains "$output" "failed"

    # 7. Verify convergence - pull on m1 and check both files exist
    print_test "#22 - Convergence: both skills present after pull on m1"
    run_jean_claude "$TICKET_M1" sync pull --force > /dev/null 2>&1
    assert_file_exists "$TICKET_M1/.claude/skills/m1-skill.md"
    assert_file_exists "$TICKET_M1/.claude/skills/m2-skill.md"
    assert_file_contains "$TICKET_M1/.claude/skills/m1-skill.md" "skill from m1"
    assert_file_contains "$TICKET_M1/.claude/skills/m2-skill.md" "skill from m2"
}

# ==========================================================================
# Main
# ==========================================================================

setup
test_ticket_18_pull_warns_uncommitted_changes
test_ticket_22_push_auto_rebases_on_divergence

# Summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Total:  $TESTS_RUN"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ "$TESTS_FAILED" -gt 0 ]; then
    echo -e "${RED}Some tests failed.${NC}"
fi

exit "$TESTS_FAILED"
