package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ProcessRunnerEnvKey is the environment variable used to tag our child processes
const ProcessRunnerEnvKey = "PROCFILE_RUNNER_SESSION"

// ProcessHandle holds information about a running process
type ProcessHandle struct {
	cmd    *exec.Cmd
	cancel context.CancelFunc
	pgid   int // process group ID for killing children
}

// ProcessStatus represents the status of a process sent to frontend
type ProcessStatus struct {
	Name     string `json:"name"`
	Status   string `json:"status"`
	ExitCode *int   `json:"exit_code"`
}

// ProcessOutput represents a line of output from a process
type ProcessOutput struct {
	Name     string `json:"name"`
	Line     string `json:"line"`
	IsStderr bool   `json:"is_stderr"`
}

// ProcfileLoaded represents the event when a procfile is loaded
type ProcfileLoaded struct {
	Path      string   `json:"path"`
	Processes []string `json:"processes"`
}

// spawnProcess starts a process and monitors it
func (a *App) spawnProcess(name string, def ProcessDefinition) error {
	a.mu.Lock()
	// Check if already running
	if _, exists := a.running[name]; exists {
		a.mu.Unlock()
		return nil // Already running, not an error
	}
	sessionID := a.sessionID
	a.mu.Unlock()

	// Create cancellable context
	ctx, cancel := context.WithCancel(context.Background())

	// Determine shell based on OS
	var shell, shellArg string
	if runtime.GOOS == "windows" {
		shell = "cmd"
		shellArg = "/C"
	} else {
		shell = "sh"
		shellArg = "-c"
	}

	cmd := exec.CommandContext(ctx, shell, shellArg, def.Command)

	// Set working directory to procfile's parent directory
	if a.procfilePath != "" {
		cmd.Dir = getParentDir(a.procfilePath)
	}

	// Tag the process with our session ID via environment variable
	cmd.Env = append(os.Environ(), fmt.Sprintf("%s=%s", ProcessRunnerEnvKey, sessionID))

	// Set up process group for clean killing on Unix
	if runtime.GOOS != "windows" {
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	}

	// Get stdout and stderr pipes
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		cancel()
		return err
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return err
	}

	// Start the process
	if err := cmd.Start(); err != nil {
		cancel()
		return err
	}

	// Get process group ID
	pgid := 0
	if runtime.GOOS != "windows" && cmd.Process != nil {
		pgid, _ = syscall.Getpgid(cmd.Process.Pid)
	}

	// Store the process handle
	a.mu.Lock()
	a.running[name] = &ProcessHandle{
		cmd:    cmd,
		cancel: cancel,
		pgid:   pgid,
	}
	a.mu.Unlock()

	// Emit running status
	wailsRuntime.EventsEmit(a.ctx, "process-status", ProcessStatus{
		Name:     name,
		Status:   "running",
		ExitCode: nil,
	})

	// Read stdout in goroutine
	go func() {
		scanner := bufio.NewScanner(stdout)
		for scanner.Scan() {
			wailsRuntime.EventsEmit(a.ctx, "process-output", ProcessOutput{
				Name:     name,
				Line:     scanner.Text(),
				IsStderr: false,
			})
		}
	}()

	// Read stderr in goroutine
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			wailsRuntime.EventsEmit(a.ctx, "process-output", ProcessOutput{
				Name:     name,
				Line:     scanner.Text(),
				IsStderr: true,
			})
		}
	}()

	// Monitor process in goroutine
	go func() {
		// Wait for process to exit
		err := cmd.Wait()

		// Get exit code
		var exitCode *int
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				code := exitErr.ExitCode()
				exitCode = &code
			}
		} else {
			code := 0
			exitCode = &code
		}

		// Check if process was manually stopped (removed from running map)
		a.mu.Lock()
		_, stillRunning := a.running[name]
		if stillRunning {
			delete(a.running, name)
		}
		autoRestart := a.globalAutoRestart
		a.mu.Unlock()

		// Only emit stopped status if process wasn't manually stopped
		if stillRunning {
			wailsRuntime.EventsEmit(a.ctx, "process-status", ProcessStatus{
				Name:     name,
				Status:   "stopped",
				ExitCode: exitCode,
			})

			// Auto-restart if enabled and process crashed (non-zero exit)
			shouldRestart := autoRestart && exitCode != nil && *exitCode != 0

			if shouldRestart {
				// Wait before restarting
				time.Sleep(2 * time.Second)

				// Double-check auto_restart is still enabled
				a.mu.Lock()
				stillShouldRestart := a.globalAutoRestart
				a.mu.Unlock()

				if stillShouldRestart {
					wailsRuntime.EventsEmit(a.ctx, "process-output", ProcessOutput{
						Name:     name,
						Line:     "Auto-restarting process...",
						IsStderr: false,
					})

					// Restart the process
					a.spawnProcess(name, def)
				}
			}
		}
	}()

	return nil
}

// stopProcess stops a running process
func (a *App) stopProcess(name string) error {
	a.mu.Lock()
	handle, exists := a.running[name]
	if !exists {
		a.mu.Unlock()
		return nil // Not running, not an error
	}
	delete(a.running, name)
	a.mu.Unlock()

	// Cancel the context
	handle.cancel()

	// On Unix, kill the entire process group
	if runtime.GOOS != "windows" && handle.pgid > 0 {
		syscall.Kill(-handle.pgid, syscall.SIGTERM)
		// Give processes a chance to terminate gracefully
		time.Sleep(100 * time.Millisecond)
		syscall.Kill(-handle.pgid, syscall.SIGKILL)
	}

	// Emit stopped status
	wailsRuntime.EventsEmit(a.ctx, "process-status", ProcessStatus{
		Name:     name,
		Status:   "stopped",
		ExitCode: nil,
	})

	return nil
}

// killOrphanedProcesses finds and kills any processes from previous sessions
// that have the PROCFILE_RUNNER_SESSION environment variable set
func (a *App) killOrphanedProcesses() {
	if runtime.GOOS == "windows" {
		return // Not implemented for Windows
	}

	a.mu.Lock()
	currentSession := a.sessionID
	a.mu.Unlock()

	// Use pgrep to find processes with our env var
	// This finds processes where the env contains PROCFILE_RUNNER_SESSION
	cmd := exec.Command("sh", "-c",
		fmt.Sprintf("ps -eo pid,command | grep -v grep | while read pid cmd; do "+
			"if [ -f /proc/$pid/environ ] 2>/dev/null; then "+
			"if grep -q '%s=' /proc/$pid/environ 2>/dev/null; then "+
			"session=$(cat /proc/$pid/environ 2>/dev/null | tr '\\0' '\\n' | grep '%s=' | cut -d= -f2); "+
			"if [ -n \"$session\" ] && [ \"$session\" != \"%s\" ]; then echo $pid; fi; "+
			"fi; fi; done",
			ProcessRunnerEnvKey, ProcessRunnerEnvKey, currentSession))

	output, err := cmd.Output()
	if err != nil {
		// On macOS, /proc doesn't exist, try alternative method using ps and lsof
		a.killOrphanedProcessesMacOS()
		return
	}

	// Kill each orphaned process
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for _, line := range lines {
		if pid, err := strconv.Atoi(strings.TrimSpace(line)); err == nil && pid > 0 {
			syscall.Kill(pid, syscall.SIGKILL)
		}
	}
}

// killOrphanedProcessesMacOS uses a different approach for macOS
func (a *App) killOrphanedProcessesMacOS() {
	// On macOS, we'll track PIDs in a file and clean them up
	// For now, use pkill with a pattern match on the command
	// This is a simpler approach that kills any sh -c processes started by us

	a.mu.Lock()
	currentSession := a.sessionID
	a.mu.Unlock()

	// Read the session file to find old session PIDs
	sessionFile := getSessionFilePath()
	data, err := os.ReadFile(sessionFile)
	if err != nil {
		return
	}

	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	for _, line := range lines {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		session := parts[0]
		pidStr := parts[1]

		// Skip current session
		if session == currentSession {
			continue
		}

		// Kill the process group
		if pgid, err := strconv.Atoi(pidStr); err == nil && pgid > 0 {
			syscall.Kill(-pgid, syscall.SIGKILL)
		}
	}

	// Clear the file and write current session
	os.Remove(sessionFile)
}

// trackProcessGroup records a process group for orphan cleanup
func (a *App) trackProcessGroup(pgid int) {
	if pgid <= 0 {
		return
	}

	a.mu.Lock()
	sessionID := a.sessionID
	a.mu.Unlock()

	sessionFile := getSessionFilePath()

	// Append to session file
	f, err := os.OpenFile(sessionFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()

	fmt.Fprintf(f, "%s:%d\n", sessionID, pgid)
}

// getSessionFilePath returns the path to the session tracking file
func getSessionFilePath() string {
	home, _ := os.UserHomeDir()
	return home + "/.config/procfile-runner/sessions.txt"
}

// getParentDir returns the parent directory of a file path
func getParentDir(path string) string {
	for i := len(path) - 1; i >= 0; i-- {
		if path[i] == '/' || path[i] == '\\' {
			return path[:i]
		}
	}
	return "."
}
