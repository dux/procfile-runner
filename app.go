package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	sessionID         string            // unique ID for this session to track orphaned processes
	envVars           map[string]string // environment variables from .env file
	initialProcfile   string            // Procfile path passed via CLI argument
	demoProcfile      string            // embedded demo Procfile content
	mu                sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		processes:         make(map[string]ProcessDefinition),
		running:           make(map[string]*ProcessHandle),
		globalAutoRestart: true,
		sessionID:         fmt.Sprintf("%d", time.Now().UnixNano()),
		envVars:           make(map[string]string),
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	// Kill any orphaned processes from previous sessions
	a.killOrphanedProcesses()

	// Load initial Procfile if specified via CLI argument
	if a.initialProcfile != "" {
		// Use a goroutine to load after frontend is ready
		go func() {
			// Small delay to ensure frontend is initialized
			time.Sleep(100 * time.Millisecond)
			a.LoadProcfile(a.initialProcfile)
			AddRecentProject(a.initialProcfile)
		}()
	}
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

	// Load .env file if present
	envVars := make(map[string]string)
	envPath := FindEnvFile(path)
	if envPath != "" {
		if parsed, err := ParseEnvFile(envPath); err == nil {
			envVars = parsed
		}
	}

	a.mu.Lock()
	a.procfilePath = path
	a.envVars = envVars
	a.processes = make(map[string]ProcessDefinition)
	for _, def := range definitions {
		a.processes[def.Name] = def
	}
	a.mu.Unlock()

	// Get process info for the event
	processInfos := make([]ProcessInfo, 0, len(definitions))
	for _, def := range definitions {
		processInfos = append(processInfos, ProcessInfo{
			Name:     def.Name,
			Disabled: def.Disabled,
		})
	}

	// Emit procfile-loaded event with env info
	envLoaded := len(envVars) > 0
	wailsRuntime.EventsEmit(a.ctx, "procfile-loaded", ProcfileLoaded{
		Path:      path,
		Processes: processInfos,
		EnvLoaded: envLoaded,
		EnvCount:  len(envVars),
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

// GetSettings returns all settings
func (a *App) GetSettings() map[string]string {
	return GetSettings()
}

// SaveSetting saves a single setting
func (a *App) SaveSetting(key string, value string) error {
	return SaveSetting(key, value)
}

// GetInstalledApps returns list of installed apps as "Name|Path" strings
func (a *App) GetInstalledApps() []string {
	return GetInstalledApps()
}

// OpenFileInEditor opens a file in the configured editor
func (a *App) OpenFileInEditor(filePath string, line int) error {
	return OpenFileInEditor(filePath, line)
}

// GetAppIcon returns a base64 data URI for an app's icon
func (a *App) GetAppIcon(appPath string) string {
	return GetAppIcon(appPath)
}

// CheckOpenCode checks if opencode is installed
func (a *App) CheckOpenCode() string {
	return CheckOpenCode()
}

// EnableProcess enables a disabled process in the Procfile and reloads
func (a *App) EnableProcess(processName string) error {
	a.mu.Lock()
	procfilePath := a.procfilePath
	a.mu.Unlock()

	if procfilePath == "" {
		return fmt.Errorf("no Procfile loaded")
	}

	if err := EnableProcess(procfilePath, processName); err != nil {
		return err
	}

	// Reload the Procfile to reflect changes
	return a.LoadProcfile(procfilePath)
}

// AskOpenCode opens a new terminal window with OpenCode, passing logs as context
func (a *App) AskOpenCode(processName string, logs string, question string) error {
	// Check if opencode is installed
	if _, err := exec.LookPath("opencode"); err != nil {
		// opencode not installed, open website
		exec.Command("open", "https://opencode.ai/").Run()
		return fmt.Errorf("opencode not installed - opening website")
	}

	// Write logs to a temp file
	tmpDir := os.TempDir()
	timestamp := time.Now().Format("2006-01-02_15-04-05")
	logFileName := fmt.Sprintf("procfile-runner-opencode_%s_%s.log", processName, timestamp)
	logFilePath := filepath.Join(tmpDir, logFileName)

	if err := os.WriteFile(logFilePath, []byte(logs), 0644); err != nil {
		return fmt.Errorf("failed to write log file: %w", err)
	}

	// Escape the question for shell - use single quotes to avoid issues
	// Replace single quotes in question with escaped version
	escapedQuestion := strings.ReplaceAll(question, `'`, `'\''`)

	// Read last used model from opencode state
	modelFlag := ""
	homeDir, _ := os.UserHomeDir()
	if homeDir != "" {
		modelFile := filepath.Join(homeDir, ".local", "state", "opencode", "model.json")
		if data, err := os.ReadFile(modelFile); err == nil {
			var modelState struct {
				Recent []struct {
					ProviderID string `json:"providerID"`
					ModelID    string `json:"modelID"`
				} `json:"recent"`
			}
			if err := json.Unmarshal(data, &modelState); err == nil && len(modelState.Recent) > 0 && modelState.Recent[0].ModelID != "" {
				model := modelState.Recent[0].ModelID
				if modelState.Recent[0].ProviderID != "" {
					model = modelState.Recent[0].ProviderID + "/" + model
				}
				modelFlag = fmt.Sprintf(` -m '%s'`, model)
			}
		}
	}

	// Build opencode commands: run one-shot with file context, then type continue command for user
	runCmd := fmt.Sprintf(`opencode run '%s' -f '%s'%s`, escapedQuestion, logFilePath, modelFlag)
	continueCmd := fmt.Sprintf(`opencode -c%s`, modelFlag)
	escRun := strings.ReplaceAll(runCmd, `"`, `\"`)
	escContinue := strings.ReplaceAll(continueCmd, `"`, `\"`)

	// Try iTerm2 first, fall back to Terminal.app
	// For iTerm: create new tab in current window if running, otherwise new window
	// First command auto-submits, second is typed without newline so user presses Enter
	itermScript := fmt.Sprintf(`
		tell application "System Events"
			set isRunning to (exists (processes where name is "iTerm2"))
		end tell
		tell application "iTerm"
			activate
			if isRunning then
				tell current window
					create tab with default profile
					tell current session
						write text "%s"
						write text "%s" without newline
					end tell
				end tell
			else
				set newWindow to (create window with default profile)
				tell current session of newWindow
					write text "%s"
					write text "%s" without newline
				end tell
			end if
		end tell
	`, escRun, escContinue, escRun, escContinue)

	terminalScript := fmt.Sprintf(`
		tell application "Terminal"
			activate
			do script "%s"
		end tell
	`, escRun)

	// Check if iTerm2 exists
	itermPath := "/Applications/iTerm.app"
	if _, err := os.Stat(itermPath); err == nil {
		// iTerm2 exists, use it
		cmd := exec.Command("osascript", "-e", itermScript)
		return cmd.Run()
	}

	// Fall back to Terminal.app
	cmd := exec.Command("osascript", "-e", terminalScript)
	return cmd.Run()
}

// GetProcfileContent returns the raw content of the currently loaded Procfile
func (a *App) GetProcfileContent() (string, error) {
	a.mu.Lock()
	path := a.procfilePath
	a.mu.Unlock()

	if path == "" {
		return "", fmt.Errorf("no Procfile loaded")
	}

	content, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}

	return string(content), nil
}

// SaveProcfileContent saves content to the currently loaded Procfile and reloads it
func (a *App) SaveProcfileContent(content string) error {
	a.mu.Lock()
	path := a.procfilePath
	a.mu.Unlock()

	if path == "" {
		return fmt.Errorf("no Procfile loaded")
	}

	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}

	// Reload the Procfile to reflect changes
	return a.LoadProcfile(path)
}

// GetDemoProcfilePath writes the demo Procfile to a temp directory and returns the path
func (a *App) GetDemoProcfilePath() (string, error) {
	if a.demoProcfile == "" {
		return "", fmt.Errorf("no demo Procfile available")
	}

	// Create demo directory in temp
	demoDir := filepath.Join(os.TempDir(), "procfile-runner-demo")
	if err := os.MkdirAll(demoDir, 0755); err != nil {
		return "", err
	}

	// Write demo Procfile
	demoPath := filepath.Join(demoDir, "Procfile")
	if err := os.WriteFile(demoPath, []byte(a.demoProcfile), 0644); err != nil {
		return "", err
	}

	return demoPath, nil
}
