#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${DIR}/benchmarkdotnet_src"

if [ -d "${TARGET_DIR}" ]; then
    echo "BenchmarkDotNet source code already exists at: ${TARGET_DIR}"
    echo "Updating repository..."
    cd "${TARGET_DIR}"
    git pull
else
    echo "Cloning BenchmarkDotNet repository into: ${TARGET_DIR}..."
    git clone --depth 1 https://github.com/dotnet/BenchmarkDotNet.git "${TARGET_DIR}"
    echo "Cloned successfully!"
fi
