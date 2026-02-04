package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const maxRecentProjects = 10

// getConfigDir returns the config directory path
func getConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".config", "procfile-runner"), nil
}

// getRecentProjectsPath returns the path to the recent projects file
func getRecentProjectsPath() (string, error) {
	configDir, err := getConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "recent_projects.json"), nil
}

// GetRecentProjects returns the list of recent project paths
func GetRecentProjects() ([]string, error) {
	path, err := getRecentProjectsPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var projects []string
	if err := json.Unmarshal(data, &projects); err != nil {
		return []string{}, nil
	}

	return projects, nil
}

// AddRecentProject adds a project to the recent list and returns the updated list
func AddRecentProject(projectPath string) ([]string, error) {
	configDir, err := getConfigDir()
	if err != nil {
		return nil, err
	}

	// Ensure config directory exists
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return nil, err
	}

	// Load existing projects
	projects, err := GetRecentProjects()
	if err != nil {
		projects = []string{}
	}

	// Remove if already exists (will be added to front)
	filtered := make([]string, 0, len(projects))
	for _, p := range projects {
		if p != projectPath {
			filtered = append(filtered, p)
		}
	}

	// Add to front
	projects = append([]string{projectPath}, filtered...)

	// Keep only max recent
	if len(projects) > maxRecentProjects {
		projects = projects[:maxRecentProjects]
	}

	// Save
	filePath, err := getRecentProjectsPath()
	if err != nil {
		return nil, err
	}

	data, err := json.Marshal(projects)
	if err != nil {
		return nil, err
	}

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return nil, err
	}

	return projects, nil
}

// --- Settings ---

func getSettingsPath() (string, error) {
	configDir, err := getConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "settings.json"), nil
}

// GetSettings returns all settings as a map
func GetSettings() map[string]string {
	path, err := getSettingsPath()
	if err != nil {
		return map[string]string{}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return map[string]string{}
	}

	var settings map[string]string
	if err := json.Unmarshal(data, &settings); err != nil {
		return map[string]string{}
	}

	return settings
}

// SaveSetting saves a single setting key/value
func SaveSetting(key string, value string) error {
	configDir, err := getConfigDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}

	settings := GetSettings()
	settings[key] = value

	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}

	path, err := getSettingsPath()
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0644)
}

// --- Installed Apps ---

// GetInstalledApps scans /Applications and ~/Applications for .app bundles
func GetInstalledApps() []string {
	apps := map[string]string{} // display name -> full path

	dirs := []string{"/Applications"}
	home, err := os.UserHomeDir()
	if err == nil {
		dirs = append(dirs, filepath.Join(home, "Applications"))
	}

	for _, dir := range dirs {
		scanAppsDir(dir, apps)
	}

	// Sort by display name
	names := make([]string, 0, len(apps))
	for name := range apps {
		names = append(names, name)
	}
	sort.Strings(names)

	// Return as "DisplayName|/path/to/App.app" pairs
	result := make([]string, 0, len(names))
	for _, name := range names {
		result = append(result, name+"|"+apps[name])
	}
	return result
}

func scanAppsDir(dir string, apps map[string]string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		name := entry.Name()
		if strings.HasSuffix(name, ".app") {
			displayName := strings.TrimSuffix(name, ".app")
			fullPath := filepath.Join(dir, name)
			apps[displayName] = fullPath
		}
	}
}

// GetAppIcon returns a base64-encoded 32x32 PNG icon for an app
func GetAppIcon(appPath string) string {
	// Cache dir
	cacheDir := filepath.Join(os.TempDir(), "procfile-runner-icons")
	os.MkdirAll(cacheDir, 0755)

	// Use app name as cache key
	appName := strings.TrimSuffix(filepath.Base(appPath), ".app")
	cachePath := filepath.Join(cacheDir, appName+".png")

	// Return cached if exists
	if data, err := os.ReadFile(cachePath); err == nil {
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
	}

	// Find the .icns file from Info.plist
	icnsPath := findAppIconPath(appPath)
	if icnsPath == "" {
		return ""
	}

	// Convert with sips
	cmd := exec.Command("sips", "-s", "format", "png", "-z", "32", "32", icnsPath, "--out", cachePath)
	if err := cmd.Run(); err != nil {
		return ""
	}

	data, err := os.ReadFile(cachePath)
	if err != nil {
		return ""
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
}

func findAppIconPath(appPath string) string {
	infoPlist := filepath.Join(appPath, "Contents", "Info.plist")
	// Use plutil to convert plist to json
	out, err := exec.Command("plutil", "-convert", "json", "-o", "-", infoPlist).Output()
	if err != nil {
		return ""
	}

	var plist map[string]interface{}
	if err := json.Unmarshal(out, &plist); err != nil {
		return ""
	}

	iconFile, _ := plist["CFBundleIconFile"].(string)
	if iconFile == "" {
		return ""
	}
	if !strings.HasSuffix(iconFile, ".icns") {
		iconFile += ".icns"
	}

	full := filepath.Join(appPath, "Contents", "Resources", iconFile)
	if _, err := os.Stat(full); err == nil {
		return full
	}
	return ""
}

// --- Open File in Editor ---

// OpenFileInEditor opens a file in the configured text editor at the given line
func OpenFileInEditor(filePath string, line int) error {
	settings := GetSettings()
	editorPath := settings["textEditor"]
	if editorPath == "" {
		return fmt.Errorf("no text editor configured")
	}

	editorName := strings.ToLower(filepath.Base(editorPath))
	lineArg := filePath + ":" + strconv.Itoa(line)

	// Handle editors that support line numbers via CLI
	switch {
	case strings.Contains(editorName, "cursor"):
		// Try cursor CLI first, fall back to open -a
		if path, err := exec.LookPath("cursor"); err == nil {
			return exec.Command(path, "--goto", lineArg).Run()
		}
		return exec.Command("open", "-a", editorPath, "--args", "--goto", lineArg).Run()

	case strings.Contains(editorName, "visual studio code"), strings.Contains(editorName, "code"):
		// Try code CLI first, fall back to open -a
		if path, err := exec.LookPath("code"); err == nil {
			return exec.Command(path, "--goto", lineArg).Run()
		}
		return exec.Command("open", "-a", editorPath, "--args", "--goto", lineArg).Run()

	case strings.Contains(editorName, "sublime"):
		// Try subl CLI first
		if path, err := exec.LookPath("subl"); err == nil {
			return exec.Command(path, lineArg).Run()
		}
		return exec.Command("open", "-a", editorPath, lineArg).Run()

	case strings.Contains(editorName, "textmate"):
		// Try mate CLI first
		if path, err := exec.LookPath("mate"); err == nil {
			return exec.Command(path, "--line", strconv.Itoa(line), filePath).Run()
		}
		return exec.Command("open", "-a", editorPath, "--args", "--line", strconv.Itoa(line), filePath).Run()

	default:
		// Generic: just open the file with the app
		return exec.Command("open", "-a", editorPath, filePath).Run()
	}
}

// EnableProcess uncomments a disabled process in the Procfile
func EnableProcess(procfilePath string, processName string) error {
	content, err := os.ReadFile(procfilePath)
	if err != nil {
		return err
	}

	lines := strings.Split(string(content), "\n")
	modified := false

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Check if this is the commented process we're looking for
		uncommented := strings.TrimSpace(strings.TrimPrefix(trimmed, "#"))
		parts := strings.SplitN(uncommented, ":", 2)
		if len(parts) != 2 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		if name == processName {
			// Preserve indentation, just remove the # and space after it
			lines[i] = strings.Replace(line, "#", "", 1)
			// Also remove leading space after # if present
			lines[i] = strings.Replace(lines[i], " "+name+":", name+":", 1)
			modified = true
			break
		}
	}

	if !modified {
		return fmt.Errorf("process %s not found as disabled", processName)
	}

	return os.WriteFile(procfilePath, []byte(strings.Join(lines, "\n")), 0644)
}

// --- Check OpenCode ---

// CheckOpenCode checks if opencode CLI is installed and returns its path
func CheckOpenCode() string {
	path, err := exec.LookPath("opencode")
	if err != nil {
		return ""
	}
	return path
}
