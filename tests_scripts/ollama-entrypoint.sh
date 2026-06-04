#!/bin/sh
# Ollama Entrypoint Script
# Pre-downloads the specified model before starting

set -e

# Install curl if not present (needed for healthcheck)
if ! command -v curl >/dev/null 2>&1; then
    echo "Installing curl..."
    apt-get update && apt-get install -y curl
fi

MODEL="${OLLAMA_MODEL:-gemma4:latest}"

echo "========================================="
echo "Starting Ollama with model: $MODEL"
echo "========================================="

# Start Ollama in the background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
for i in $(seq 1 30); do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "✓ Ollama is ready"
        break
    fi
    echo "  Attempt $i/30..."
    sleep 2
done

# Check if Ollama is running
if ! kill -0 $OLLAMA_PID 2>/dev/null; then
    echo "✗ Ollama failed to start"
    exit 1
fi

# Pull the model if not already present
echo ""
echo "Checking/Downloading model: $MODEL"
echo "This may take several minutes on first run..."
echo ""

if ollama pull "$MODEL"; then
    echo ""
    echo "✓ Model $MODEL is ready"
    echo "========================================="
else
    echo "✗ Failed to pull model $MODEL"
    echo "Continuing anyway..."
fi

# Keep Ollama running in foreground
echo "Ollama is running and ready to accept requests"
wait $OLLAMA_PID
