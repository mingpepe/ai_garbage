#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${DIR}/threejs-repo"

if [ -d "${TARGET_DIR}" ]; then
    echo "Three.js source code already exists at: ${TARGET_DIR}"
    echo "Updating repository..."
    cd "${TARGET_DIR}"
    git pull
else
    echo "Cloning Three.js repository into: ${TARGET_DIR}..."
    git clone --depth 1 https://github.com/mrdoob/three.js.git "${TARGET_DIR}"
    echo "Cloned successfully!"
fi
