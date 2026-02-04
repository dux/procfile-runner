.PHONY: dev build test clean install

# Development
dev:
	wails dev

# Build production binary
build:
	wails build

# Build for specific platforms
build-darwin:
	wails build -platform darwin/universal

build-linux:
	wails build -platform linux/amd64

build-windows:
	wails build -platform windows/amd64

# Run tests
test:
	go test -v ./...

test-short:
	go test -short ./...

# Run manual integration tests
test-manual:
	./test/test.sh

# Clean build artifacts
clean:
	rm -rf build/bin
	rm -rf frontend/dist
	rm -f procfile-runner

# Install dependencies
install:
	go mod tidy
	cd frontend && npm install

# Generate Wails bindings
generate:
	wails generate module

# Format code
fmt:
	go fmt ./...

# Lint
lint:
	go vet ./...
