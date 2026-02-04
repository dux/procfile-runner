package main

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// ParseEnvFile reads and parses a .env file, returning a map of key-value pairs
func ParseEnvFile(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	env := make(map[string]string)
	scanner := bufio.NewScanner(file)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Find the first = sign
		idx := strings.Index(line, "=")
		if idx == -1 {
			continue
		}

		key := strings.TrimSpace(line[:idx])
		value := strings.TrimSpace(line[idx+1:])

		// Skip if key is empty
		if key == "" {
			continue
		}

		// Remove surrounding quotes from value
		value = unquoteValue(value)

		env[key] = value
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return env, nil
}

// unquoteValue removes surrounding quotes from a value
func unquoteValue(value string) string {
	if len(value) < 2 {
		return value
	}

	// Check for double quotes
	if value[0] == '"' && value[len(value)-1] == '"' {
		return value[1 : len(value)-1]
	}

	// Check for single quotes
	if value[0] == '\'' && value[len(value)-1] == '\'' {
		return value[1 : len(value)-1]
	}

	return value
}

// FindEnvFile looks for .env file in the same directory as the procfile
func FindEnvFile(procfilePath string) string {
	dir := filepath.Dir(procfilePath)
	envPath := filepath.Join(dir, ".env")

	if _, err := os.Stat(envPath); err == nil {
		return envPath
	}

	return ""
}
