.PHONY: build up down restart logs certs clean rebuild-tool tools

# Generate self-signed certificates
certs:
	cd cosi-ui && bash generate-cert.sh

# Build all containers
build: certs
	docker compose build

# Start the full stack
up:
	docker compose up -d

# Stop the full stack
down:
	docker compose down

# Restart all services
restart:
	docker compose restart

# View logs (all or specific service)
logs:
	docker compose logs -f $(SERVICE)

# Clean everything including volumes and images
clean:
	docker compose down -v --rmi all

# Rebuild a specific tool (usage: make rebuild-tool TOOL=jira-integration)
rebuild-tool:
	docker build -t cosi-tool-$(TOOL):latest ./tools/$(TOOL)
	docker compose up -d tool-$(TOOL)
	docker compose restart orchestrator

# Show registered tools
tools:
	@find tools -name "tool.json" -exec echo "---" \; -exec cat {} \;
