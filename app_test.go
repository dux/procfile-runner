package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseProcfile(t *testing.T) {
	content := `# Test Procfile
alpha: echo A
beta: echo B
gamma: echo C
`
	defs := ParseProcfile(content)

	if len(defs) != 3 {
		t.Errorf("Expected 3 definitions, got %d", len(defs))
	}

	expected := map[string]string{
		"alpha": "echo A",
		"beta":  "echo B",
		"gamma": "echo C",
	}

	for _, def := range defs {
		if cmd, ok := expected[def.Name]; ok {
			if def.Command != cmd {
				t.Errorf("Expected command %q for %s, got %q", cmd, def.Name, def.Command)
			}
		} else {
			t.Errorf("Unexpected process: %s", def.Name)
		}
	}
}

func TestParseProcfileSkipsComments(t *testing.T) {
	content := `# This is a comment
web: echo web
# Another comment
worker: echo worker
`
	defs := ParseProcfile(content)

	if len(defs) != 2 {
		t.Errorf("Expected 2 definitions (comments skipped), got %d", len(defs))
	}
}

func TestParseProcfileSkipsEmptyLines(t *testing.T) {
	content := `
web: echo web

worker: echo worker

`
	defs := ParseProcfile(content)

	if len(defs) != 2 {
		t.Errorf("Expected 2 definitions (empty lines skipped), got %d", len(defs))
	}
}

func TestGetParentDir(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"/Users/test/project/Procfile", "/Users/test/project"},
		{"/Procfile", ""},
		{"Procfile", "."},
		{"/a/b/c/d", "/a/b/c"},
	}

	for _, tt := range tests {
		result := getParentDir(tt.input)
		if result != tt.expected {
			t.Errorf("getParentDir(%q) = %q, expected %q", tt.input, result, tt.expected)
		}
	}
}

func TestRecentProjects(t *testing.T) {
	// Create temp config dir
	tmpDir, err := os.MkdirTemp("", "procfile-runner-test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)

	// Override config dir for testing
	origHome := os.Getenv("HOME")
	os.Setenv("HOME", tmpDir)
	defer os.Setenv("HOME", origHome)

	// Create config directory
	configDir := filepath.Join(tmpDir, ".config", "procfile-runner")
	os.MkdirAll(configDir, 0755)

	// Test adding projects
	projects, err := AddRecentProject("/test/project1/Procfile")
	if err != nil {
		t.Fatal(err)
	}

	if len(projects) != 1 {
		t.Errorf("Expected 1 project, got %d", len(projects))
	}

	// Add more projects
	AddRecentProject("/test/project2/Procfile")
	AddRecentProject("/test/project3/Procfile")

	projects, _ = GetRecentProjects()
	if len(projects) != 3 {
		t.Errorf("Expected 3 projects, got %d", len(projects))
	}

	// Most recent should be first
	if projects[0] != "/test/project3/Procfile" {
		t.Errorf("Expected project3 first, got %s", projects[0])
	}

	// Adding existing should move to front
	AddRecentProject("/test/project1/Procfile")
	projects, _ = GetRecentProjects()
	if projects[0] != "/test/project1/Procfile" {
		t.Errorf("Expected project1 first after re-adding, got %s", projects[0])
	}
}

// TestProcessSpawnAndStop tests spawning and stopping processes
func TestProcessSpawnAndStop(t *testing.T) {
	app := NewApp()

	// Create a simple procfile
	procContent := "test: while true; do echo TEST; sleep 0.1; done"
	defs := ParseProcfile(procContent)

	app.processes = make(map[string]ProcessDefinition)
	for _, def := range defs {
		app.processes[def.Name] = def
	}

	// Note: We can't fully test spawn without the Wails context
	// This is more of a structural test
	if len(app.processes) != 1 {
		t.Errorf("Expected 1 process definition, got %d", len(app.processes))
	}

	if app.processes["test"].Command != "while true; do echo TEST; sleep 0.1; done" {
		t.Errorf("Unexpected command: %s", app.processes["test"].Command)
	}
}

// Integration test - runs actual processes
func TestIntegrationProcessLifecycle(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// This test requires manual verification or a mock context
	// For now, we'll just test the parsing and config parts

	procfile := `
alpha: while true; do echo "A"; sleep 0.5; done
beta: while true; do echo "B"; sleep 0.5; done
gamma: while true; do echo "C"; sleep 0.5; done
delta: while true; do echo "D"; sleep 0.5; done
epsilon: while true; do echo "E"; sleep 0.5; done
`
	defs := ParseProcfile(procfile)

	if len(defs) != 5 {
		t.Errorf("Expected 5 process definitions, got %d", len(defs))
	}

	expectedNames := []string{"alpha", "beta", "gamma", "delta", "epsilon"}
	for i, def := range defs {
		if def.Name != expectedNames[i] {
			t.Errorf("Expected name %s at position %d, got %s", expectedNames[i], i, def.Name)
		}
	}
}

// TestSessionID verifies that session IDs are unique
func TestSessionID(t *testing.T) {
	app1 := NewApp()
	time.Sleep(time.Millisecond)
	app2 := NewApp()

	if app1.sessionID == app2.sessionID {
		t.Error("Session IDs should be unique")
	}
}

// Benchmark parsing
func BenchmarkParseProcfile(b *testing.B) {
	content := strings.Repeat("process: echo hello\n", 100)
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		ParseProcfile(content)
	}
}

// Print test summary
func TestMain(m *testing.M) {
	fmt.Println("Running Procfile Runner tests...")
	code := m.Run()
	fmt.Println("Tests completed.")
	os.Exit(code)
}
