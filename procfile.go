package main

import (
	"strings"
)

// ProcessDefinition represents a single process from a Procfile
type ProcessDefinition struct {
	Name     string `json:"name"`
	Command  string `json:"command"`
	Disabled bool   `json:"disabled"`
}

// ParseProcfile parses a Procfile content and returns process definitions
func ParseProcfile(content string) []ProcessDefinition {
	var definitions []ProcessDefinition
	activeNames := make(map[string]bool)

	lines := strings.Split(content, "\n")

	// First pass: collect active (uncommented) processes
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Split on first colon
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		command := strings.TrimSpace(parts[1])

		if name != "" && command != "" {
			definitions = append(definitions, ProcessDefinition{
				Name:     name,
				Command:  command,
				Disabled: false,
			})
			activeNames[name] = true
		}
	}

	// Second pass: collect commented-out processes (if name not already active)
	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Only process comments that look like "# name: command"
		if !strings.HasPrefix(line, "#") {
			continue
		}

		// Remove leading # and whitespace
		line = strings.TrimSpace(strings.TrimPrefix(line, "#"))

		// Split on first colon
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}

		name := strings.TrimSpace(parts[0])
		command := strings.TrimSpace(parts[1])

		// Skip if name already exists as active, or if name/command empty
		if name == "" || command == "" || activeNames[name] {
			continue
		}

		definitions = append(definitions, ProcessDefinition{
			Name:     name,
			Command:  command,
			Disabled: true,
		})
		activeNames[name] = true // prevent duplicates from multiple commented lines
	}

	return definitions
}
