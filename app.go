package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct holds the application state
type App struct {
	ctx               context.Context
	processes         map[string]ProcessDefinition
	running           map[string]*ProcessHandle
	procfilePath      string
	globalAutoRestart bool
	sessionID         string // unique ID for this session to track orphaned processes
	mu                sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		processes:         make(map[string]ProcessDefinition),
		running:           make(map[string]*ProcessHandle),
		globalAutoRestart: true,
		sessionID:         fmt.Sprintf("%d", time.Now().UnixNano()),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Kill any orphaned processes from previous sessions
	a.killOrphanedProcesses()
}

// shutdown is called when the app is closing
func (a *App) shutdown(ctx context.Context) {
	// Stop all running processes
	a.StopAllProcesses()
}

// OpenFileDialog opens a native file dialog for selecting a Procfile
func (a *App) OpenFileDialog() (string, error) {
	return wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Procfile",
	})
}

// LoadProcfile loads and parses a Procfile
func (a *App) LoadProcfile(path string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	definitions := ParseProcfile(string(content))

	a.mu.Lock()
	a.procfilePath = path
	a.processes = make(map[string]ProcessDefinition)
	for _, def := range definitions {
		a.processes[def.Name] = def
	}
	a.mu.Unlock()

	// Get process names for the event
	processNames := make([]string, 0, len(definitions))
	for _, def := range definitions {
		processNames = append(processNames, def.Name)
	}

	// Emit procfile-loaded event
	wailsRuntime.EventsEmit(a.ctx, "procfile-loaded", ProcfileLoaded{
		Path:      path,
		Processes: processNames,
	})

	return nil
}

// StartProcess starts a single process by name
func (a *App) StartProcess(name string) error {
	a.mu.Lock()
	def, exists := a.processes[name]
	a.mu.Unlock()

	if !exists {
		return nil // Process not found, not an error for frontend
	}

	return a.spawnProcess(name, def)
}

// StopProcess stops a single process by name
func (a *App) StopProcess(name string) error {
	return a.stopProcess(name)
}

// RestartProcess restarts a single process by name
func (a *App) RestartProcess(name string) error {
	a.mu.Lock()
	def, exists := a.processes[name]
	a.mu.Unlock()

	if !exists {
		return nil
	}

	// Stop if running
	a.stopProcess(name)

	// Small delay
	// time.Sleep(500 * time.Millisecond)

	// Start again
	return a.spawnProcess(name, def)
}

// StartAllProcesses starts all processes defined in the Procfile
func (a *App) StartAllProcesses() error {
	a.mu.Lock()
	definitions := make([]ProcessDefinition, 0, len(a.processes))
	for _, def := range a.processes {
		definitions = append(definitions, def)
	}
	a.mu.Unlock()

	for _, def := range definitions {
		// Skip if already running
		a.mu.Lock()
		_, running := a.running[def.Name]
		a.mu.Unlock()

		if running {
			continue
		}

		if err := a.spawnProcess(def.Name, def); err != nil {
			return err
		}
	}

	return nil
}

// StopAllProcesses stops all running processes
func (a *App) StopAllProcesses() error {
	a.mu.Lock()
	names := make([]string, 0, len(a.running))
	for name := range a.running {
		names = append(names, name)
	}
	a.mu.Unlock()

	for _, name := range names {
		a.stopProcess(name)
	}

	return nil
}

// SetGlobalAutoRestart sets the global auto-restart setting
func (a *App) SetGlobalAutoRestart(enabled bool) {
	a.mu.Lock()
	a.globalAutoRestart = enabled
	a.mu.Unlock()
}

// GetRecentProjects returns the list of recent project paths
func (a *App) GetRecentProjects() []string {
	projects, err := GetRecentProjects()
	if err != nil {
		return []string{}
	}
	return projects
}

// AddRecentProject adds a project to the recent list
func (a *App) AddRecentProject(path string) []string {
	projects, err := AddRecentProject(path)
	if err != nil {
		return []string{}
	}
	return projects
}

// SaveLog saves log content to a tmp file and returns the file path
func (a *App) SaveLog(processName string, content string) (string, error) {
	tmpDir := os.TempDir()
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	fileName := fmt.Sprintf("procfile-runner_%s_%s.txt", processName, timestamp)
	filePath := filepath.Join(tmpDir, fileName)

	if err := os.WriteFile(filePath, []byte(content), 0644); err != nil {
		return "", err
	}

	return filePath, nil
}
