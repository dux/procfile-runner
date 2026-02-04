package main

import (
	"strings"
)

// ProcessDefinition represents a single process from a Procfile
type ProcessDefinition struct {
	Name    string `json:"name"`
	Command string `json:"command"`
}

// ParseProcfile parses a Procfile content and returns process definitions
func ParseProcfile(content string) []ProcessDefinition {
	var definitions []ProcessDefinition

	lines := strings.Split(content, "\n")
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
				Name:    name,
				Command: command,
			})
		}
	}

	return definitions
}
