package main

import (
	"fmt"
	"os/exec"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
)

// PortInfo holds information about a process listening on a port
type PortInfo struct {
	Port    int    `json:"port"`
	PID     int    `json:"pid"`
	Process string `json:"process"` // short process name
	Command string `json:"command"` // full command (truncated)
}

// GetActivePorts scans for active ports in the range 3000-9000
func (a *App) GetActivePorts() []PortInfo {
	if runtime.GOOS == "darwin" || runtime.GOOS == "linux" {
		return getActivePortsUnix()
	}
	return []PortInfo{}
}

// KillPort kills the process listening on the specified port
func (a *App) KillPort(port int) error {
	ports := a.GetActivePorts()
	for _, p := range ports {
		if p.Port == port && p.PID > 0 {
			// Kill the process
			if err := syscall.Kill(p.PID, syscall.SIGTERM); err != nil {
				// Try SIGKILL if SIGTERM fails
				syscall.Kill(p.PID, syscall.SIGKILL)
			}
			return nil
		}
	}
	return fmt.Errorf("no process found on port %d", port)
}

// getActivePortsUnix uses lsof to find listening ports on macOS/Linux
func getActivePortsUnix() []PortInfo {
	// Use lsof to find all listening TCP ports, then filter by range
	cmd := exec.Command("lsof", "-iTCP", "-sTCP:LISTEN", "-n", "-P")
	output, err := cmd.Output()
	if err != nil {
		return []PortInfo{}
	}

	return parseLsofOutput(string(output))
}

// parseLsofOutput parses lsof output to extract port info
func parseLsofOutput(output string) []PortInfo {
	var ports []PortInfo
	seen := make(map[int]bool)

	lines := strings.Split(output, "\n")
	// Skip header line
	for i, line := range lines {
		if i == 0 || line == "" {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) < 9 {
			continue
		}

		// lsof output: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (STATE)
		// NAME is second to last, STATE is last
		processName := fields[0]
		pidStr := fields[1]
		// NAME field is at index 8 (9th field), which contains address:port
		name := fields[8]

		pid, err := strconv.Atoi(pidStr)
		if err != nil {
			continue
		}

		// Extract port from name (e.g., "*:3000" -> 3000, "127.0.0.1:3000" -> 3000)
		port := extractPort(name)
		if port == 0 || port < 3000 || port > 9000 {
			continue
		}

		// Skip if we've already seen this port
		if seen[port] {
			continue
		}
		seen[port] = true

		// Get short process name (truncate if needed)
		shortName := processName
		if len(shortName) > 15 {
			shortName = shortName[:15]
		}

		// Get full command line for more context
		fullCmd := getProcessCommand(pid)

		ports = append(ports, PortInfo{
			Port:    port,
			PID:     pid,
			Process: shortName,
			Command: fullCmd,
		})
	}

	// Sort by port number (lowest first)
	sort.Slice(ports, func(i, j int) bool {
		return ports[i].Port < ports[j].Port
	})

	return ports
}

// extractPort extracts port number from lsof NAME field
func extractPort(name string) int {
	// Match patterns like "*:3000", "127.0.0.1:3000", "[::1]:3000"
	re := regexp.MustCompile(`:(\d+)$`)
	matches := re.FindStringSubmatch(name)
	if len(matches) < 2 {
		return 0
	}
	port, _ := strconv.Atoi(matches[1])
	return port
}

// getProcessCommand gets the command line for a process
func getProcessCommand(pid int) string {
	if runtime.GOOS == "darwin" {
		cmd := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "command=")
		output, err := cmd.Output()
		if err != nil {
			return ""
		}
		cmdLine := strings.TrimSpace(string(output))
		// Truncate long commands
		if len(cmdLine) > 50 {
			cmdLine = cmdLine[:50] + "..."
		}
		return cmdLine
	}

	// Linux: read from /proc
	cmd := exec.Command("cat", fmt.Sprintf("/proc/%d/cmdline", pid))
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	cmdLine := strings.ReplaceAll(string(output), "\x00", " ")
	cmdLine = strings.TrimSpace(cmdLine)
	if len(cmdLine) > 50 {
		cmdLine = cmdLine[:50] + "..."
	}
	return cmdLine
}
