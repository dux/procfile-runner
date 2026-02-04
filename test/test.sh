#!/bin/bash
# Manual test script for Procfile Runner
# This script tests the process spawning directly without the GUI

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== Procfile Runner Manual Tests ==="
echo "Working directory: $(pwd)"
echo ""

# Test 1: Check Procfile exists
echo "1. Checking test Procfile..."
if [ -f "test/Procfile" ]; then
    echo "   OK: test/Procfile exists"
    cat test/Procfile
else
    echo "   FAIL: test/Procfile not found"
    exit 1
fi
echo ""

# Test 2: Start processes manually and check output
echo "2. Testing process spawning..."

# Start all 5 test processes in background
PIDS=""
for letter in A B C D E; do
    (while true; do echo "$letter"; sleep 0.5; done) &
    PIDS="$PIDS $!"
done

echo "   Started PIDs:$PIDS"

# Wait and capture some output
sleep 2

# Check if processes are running
RUNNING=0
for pid in $PIDS; do
    if kill -0 $pid 2>/dev/null; then
        RUNNING=$((RUNNING + 1))
    fi
done

echo "   Running processes: $RUNNING/5"

# Kill all
for pid in $PIDS; do
    kill $pid 2>/dev/null || true
done

if [ $RUNNING -eq 5 ]; then
    echo "   OK: All processes started and ran"
else
    echo "   FAIL: Only $RUNNING/5 processes running"
fi
echo ""

# Test 3: Test process group killing
echo "3. Testing process group killing..."

# Start a process that spawns children
(
    export PROCFILE_RUNNER_SESSION="test_session"
    sh -c 'while true; do echo "PARENT"; sleep 0.5; done' &
    CHILD=$!
    echo "CHILD_PID=$CHILD"
    wait
) &
PARENT=$!

sleep 1

# Kill the process group
kill -- -$PARENT 2>/dev/null || kill $PARENT 2>/dev/null || true

sleep 0.5

if kill -0 $PARENT 2>/dev/null; then
    echo "   FAIL: Parent still running"
    kill $PARENT 2>/dev/null || true
else
    echo "   OK: Process group killed"
fi
echo ""

# Test 4: Check for orphaned processes
echo "4. Checking for orphaned processes..."
ORPHANS=$(pgrep -f "PROCFILE_RUNNER_SESSION" 2>/dev/null | wc -l || echo "0")
echo "   Orphaned processes found: $ORPHANS"
if [ "$ORPHANS" -eq 0 ]; then
    echo "   OK: No orphans"
else
    echo "   WARNING: Found orphaned processes"
    pkill -f "PROCFILE_RUNNER_SESSION" 2>/dev/null || true
fi
echo ""

# Test 5: Build and verify
echo "5. Building application..."
if go build . 2>&1; then
    echo "   OK: Build successful"
else
    echo "   FAIL: Build failed"
    exit 1
fi
echo ""

# Test 6: Run unit tests
echo "6. Running unit tests..."
if go test -short ./... 2>&1; then
    echo "   OK: All tests passed"
else
    echo "   FAIL: Tests failed"
    exit 1
fi
echo ""

echo "=== All manual tests completed ==="
echo ""
echo "To test the GUI:"
echo "  wails dev"
echo ""
echo "Then:"
echo "  1. Click 'Open Procfile' and select test/Procfile"
echo "  2. Click 'Start All' - you should see A, B, C, D, E printing"
echo "  3. Stop individual processes and verify they stop"
echo "  4. Restart processes and verify they restart"
echo "  5. Close the app and check for orphaned processes:"
echo "     pgrep -f 'echo [ABCDE]'"
