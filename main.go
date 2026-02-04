package main

import (
	"embed"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed test/Procfile
var demoProcfile string

func main() {
	// Create an instance of the app structure
	app := NewApp()
	app.demoProcfile = demoProcfile

	// Check for Procfile path in command line arguments
	if len(os.Args) > 1 {
		arg := os.Args[1]
		// Skip flags (e.g., -NSDocumentRevisionsDebugMode from macOS)
		if !strings.HasPrefix(arg, "-") {
			// Convert to absolute path if relative
			if !filepath.IsAbs(arg) {
				if abs, err := filepath.Abs(arg); err == nil {
					arg = abs
				}
			}
			// Check if file exists
			if _, err := os.Stat(arg); err == nil {
				app.initialProcfile = arg
			}
		}
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Procfile Runner by @dux",
		Width:     1200,
		Height:    800,
		MinWidth:  800,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 17, G: 24, B: 39, A: 1}, // gray-900
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
