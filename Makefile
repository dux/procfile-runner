.PHONY: dev build test clean install gh-release

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

# Create GitHub release with incremented minor version
gh-release:
	@# Get current version and calculate new version
	@CURRENT_VERSION=$$(grep -o '"productVersion": "[^"]*"' wails.json | cut -d'"' -f4) && \
	MAJOR=$$(echo $$CURRENT_VERSION | cut -d. -f1) && \
	MINOR=$$(echo $$CURRENT_VERSION | cut -d. -f2) && \
	NEW_MINOR=$$((MINOR + 1)) && \
	NEW_VERSION="$$MAJOR.$$NEW_MINOR.0" && \
	echo "Bumping version: $$CURRENT_VERSION -> $$NEW_VERSION" && \
	sed -i '' "s/\"productVersion\": \"$$CURRENT_VERSION\"/\"productVersion\": \"$$NEW_VERSION\"/" wails.json && \
	sed -i '' "s/version \"$$CURRENT_VERSION\"/version \"$$NEW_VERSION\"/" Casks/procfile-runner.rb && \
	echo "Building macOS app..." && \
	rm -rf "build/bin/Procfile Runner.app" && \
	wails build -platform darwin/universal && \
	echo "Creating release zip..." && \
	cd build/bin && rm -f Procfile-Runner-*.zip && zip -r "Procfile-Runner-$$NEW_VERSION-mac.zip" "Procfile Runner.app" && cd ../.. && \
	SHA256=$$(shasum -a 256 "build/bin/Procfile-Runner-$$NEW_VERSION-mac.zip" | cut -d' ' -f1) && \
	sed -i '' "s/sha256 \"[^\"]*\"/sha256 \"$$SHA256\"/" Casks/procfile-runner.rb && \
	echo "Committing version bump..." && \
	git add wails.json Casks/procfile-runner.rb && \
	git commit -m "Bump version to $$NEW_VERSION" && \
	git push && \
	echo "Creating GitHub release v$$NEW_VERSION..." && \
	gh release create "v$$NEW_VERSION" \
		"build/bin/Procfile-Runner-$$NEW_VERSION-mac.zip" \
		--title "Procfile Runner v$$NEW_VERSION" \
		--generate-notes && \
	echo "Release v$$NEW_VERSION created successfully!"
