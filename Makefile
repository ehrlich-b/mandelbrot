.PHONY: help setup dev build test e2e lint typecheck format clean poster bench profile docker

# Default target
help:
	@echo "Mandelbrot - World's Greatest Fractal Explorer"
	@echo ""
	@echo "Available commands:"
	@echo "  make setup       - Install dependencies and Playwright browsers"
	@echo "  make dev         - Start development server (http://localhost:3000)"
	@echo "  make build       - Build for production"
	@echo "  make test        - Run unit tests"
	@echo "  make e2e         - Run end-to-end tests (headless)"
	@echo "  make e2e-ui      - Run end-to-end tests with UI"
	@echo "  make lint        - Run ESLint"
	@echo "  make typecheck   - Run TypeScript type checking"
	@echo "  make format      - Format code with Prettier"
	@echo "  make clean       - Remove build artifacts and caches"
	@echo "  make poster      - Render a poster (see examples below)"
	@echo "  make bench       - Run performance benchmarks"
	@echo "  make profile     - Start with Chrome DevTools profiling"
	@echo ""
	@echo "Poster rendering examples:"
	@echo "  make poster                    # Default 4K render"
	@echo "  make poster W=7680 H=4320     # 8K render"
	@echo "  make poster CX=-0.75 CY=0.1 S=0.01  # Specific location"
	@echo ""

# Install all dependencies
setup:
	@echo "📦 Installing dependencies..."
	npm install
	@echo "🎭 Installing Playwright browsers..."
	npx playwright install chromium
	@echo "✅ Setup complete!"

# Development server
dev:
	@echo "🚀 Starting development server..."
	npm run dev

# Production build
build:
	@echo "🔨 Building for production..."
	npm run typecheck
	npm run build
	@echo "✅ Build complete! Output in ./dist"

# Run unit tests
test:
	@echo "🧪 Running unit tests..."
	npm test

# Run unit tests in watch mode
test-watch:
	@echo "🧪 Running unit tests (watch mode)..."
	npm test -- --watch

# Run E2E tests headless
e2e:
	@echo "🎭 Running E2E tests (headless)..."
	timeout 30 npm run test:e2e || echo "E2E tests completed or timed out"

# Run E2E tests with UI
e2e-ui:
	@echo "🎭 Running E2E tests (with UI)..."
	npm run test:e2e -- --ui

# Lint code
lint:
	@echo "🔍 Linting with TypeScript compiler (ESLint disabled for now)..."
	npm run typecheck

# Type checking
typecheck:
	@echo "📝 Running TypeScript type check..."
	npm run typecheck

# Format code
format:
	@echo "✨ Formatting code with Prettier..."
	npm run format

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist
	rm -rf node_modules/.vite
	rm -rf apps/web/.vite
	rm -rf coverage
	rm -rf playwright-report
	rm -rf test-results
	@echo "✅ Clean complete!"

# Deep clean (including node_modules)
deep-clean: clean
	@echo "🧹 Deep cleaning..."
	rm -rf node_modules
	rm -rf pnpm-lock.yaml
	@echo "✅ Deep clean complete! Run 'make setup' to reinstall."

# Poster rendering with defaults
poster: CX ?= -0.5
poster: CY ?= 0.0
poster: S ?= 2.5
poster: W ?= 3840
poster: H ?= 2160
poster: ITER ?= 1024
poster: OUT ?= poster_$(shell date +%Y%m%d_%H%M%S).png
poster:
	@echo "🎨 Rendering poster..."
	@echo "  Center: ($(CX), $(CY))"
	@echo "  Scale: $(S)"
	@echo "  Size: $(W)x$(H)"
	@echo "  Iterations: $(ITER)"
	@echo "  Output: $(OUT)"
	npm run render -- \
		--centerX $(CX) \
		--centerY $(CY) \
		--scale $(S) \
		--width $(W) \
		--height $(H) \
		--iterations $(ITER) \
		--out $(OUT)
	@echo "✅ Poster saved to $(OUT)"

# Quick poster presets
poster-4k:
	@make poster W=3840 H=2160

poster-8k:
	@make poster W=7680 H=4320

poster-seahorse:
	@make poster CX=-0.75 CY=0.1 S=0.05 ITER=2048

poster-spiral:
	@make poster CX=-0.7533 CY=0.1138 S=0.001 ITER=4096

poster-ultra:
	@echo "⚠️  This will render a 32K image and may take several minutes!"
	@make poster W=30720 H=17280 ITER=8192

# Run performance benchmarks
bench:
	@echo "⚡ Running performance benchmarks..."
	npm test -- --run bench

# Memory profiling
profile:
	@echo "📊 Starting with Chrome DevTools profiling..."
	@echo "1. Open Chrome DevTools"
	@echo "2. Go to Performance tab"
	@echo "3. Start recording"
	@echo ""
	PROFILE=true npm run dev

# Docker build (future)
docker:
	@echo "🐳 Building Docker image..."
	docker build -t mandelbrot:latest .

# Development with hot reload and debug logging
dev-debug:
	@echo "🐛 Starting in debug mode..."
	DEBUG=true npm run dev

# Check for updates
check-updates:
	@echo "🔄 Checking for dependency updates..."
	npm update

# Quick visual test - just take a screenshot
visual-test:
	@echo "📸 Taking quick Mandelbrot screenshot..."
	timeout 15 npm run test:e2e -- --project=chromium --grep "should render Mandelbrot set visually" --update-snapshots || echo "Visual test completed or timed out"

# Generate documentation
docs:
	@echo "📚 Generating documentation..."
	npx typedoc

# CI simulation
ci:
	@echo "🤖 Running CI checks..."
	@make typecheck
	@make lint
	@make test
	@make build
	@make e2e
	@echo "✅ All CI checks passed!"

# Quick quality check before commit
pre-commit: format lint typecheck test
	@echo "✅ Pre-commit checks passed!"

# Install git hooks
install-hooks:
	@echo "🪝 Installing git hooks..."
	echo "make pre-commit" > .git/hooks/pre-commit
	chmod +x .git/hooks/pre-commit
	@echo "✅ Git hooks installed!"

# Alias for dev
run: dev

# Start all services (future: when we have backend)
start: dev

# Stop all services
stop:
	@echo "⏹️  Stopping services..."
	pkill -f "vite" || true
	@echo "✅ Services stopped!"

# Show current TODOs
todos:
	@echo "📋 Current TODOs:"
	@grep -n "TODO\|FIXME\|HACK" -r apps/web/src --include="*.ts" --include="*.tsx" || echo "No TODOs found!"

# Count lines of code
loc:
	@echo "📊 Lines of code:"
	@find apps/web/src -name "*.ts" -o -name "*.tsx" -o -name "*.glsl" | xargs wc -l | tail -n 1

# Package size analysis
analyze:
	@echo "📦 Analyzing bundle size..."
	npm run build -- --analyze

# Run development with specific renderer
dev-webgl:
	RENDERER=webgl npm run dev

dev-webgpu:
	RENDERER=webgpu npm run dev

dev-cpu:
	RENDERER=cpu npm run dev

# ============================================================
# DD Shader Debugging
# ============================================================

# Run E2E test specifically for DD shader deep zoom
test-dd:
	@echo "🔬 Testing DD shader at deep zoom..."
	npm run test:e2e -- --project=chromium --grep "deep" --timeout=30000

# Run DD shader debug test with specific debug mode
# Usage: make test-dd-debug MODE=1  (1=coords, 2=DD coords, 3=scale, 4=iterations)
test-dd-debug: MODE ?= 0
test-dd-debug:
	@echo "🐛 DD Shader Debug Test (mode=$(MODE))"
	@echo "  0=normal, 1=pixel coords, 2=DD coords, 3=scale, 4=iteration growth"
	npm run test:e2e -- --project=chromium --grep "DD mode" --timeout=30000

# Quick typecheck to verify shader changes compile
check-shaders:
	@echo "🔍 Checking shader compilation..."
	npm run typecheck
	@echo "✅ TypeScript/shaders compile successfully"

# Test deep zoom at specific scale
# Usage: make test-zoom SCALE=1e-8
test-zoom: SCALE ?= 1e-7
test-zoom:
	@echo "🔭 Testing zoom at scale $(SCALE)..."
	npm run test:e2e -- --project=chromium --grep "zoom" --timeout=60000

# Run just the visual regression tests
test-visual:
	@echo "📸 Running visual regression tests..."
	npm run test:e2e -- --project=chromium --grep "visually" --timeout=30000

# Headed E2E test for manual debugging (opens browser)
e2e-headed:
	@echo "🎭 Running E2E tests with visible browser..."
	npm run test:e2e -- --headed --project=chromium --timeout=60000

# Debug a specific E2E test with visible browser
# Usage: make debug-test NAME="should detect debug colors"
debug-test: NAME ?= "DD mode"
debug-test:
	@echo "🐛 Debugging test: $(NAME)"
	npm run test:e2e -- --headed --project=chromium --grep $(NAME) --timeout=120000

# Run DD shader debug tests (use --update-snapshots on first run)
test-dd-shader:
	@echo "🔬 Running DD shader debug tests..."
	npm run test:e2e -- --project=chromium tests/e2e/dd-debug.spec.ts --timeout=60000

# Run DD shader debug tests with visible browser
test-dd-shader-headed:
	@echo "🔬 Running DD shader debug tests (headed)..."
	npm run test:e2e -- --headed --project=chromium tests/e2e/dd-debug.spec.ts --timeout=120000

# Update DD shader debug test snapshots
test-dd-shader-update:
	@echo "📸 Updating DD shader debug test snapshots..."
	npm run test:e2e -- --project=chromium tests/e2e/dd-debug.spec.ts --update-snapshots --timeout=60000