package main

import (
	"encoding/json"
	"os"
	"path/filepath"
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
