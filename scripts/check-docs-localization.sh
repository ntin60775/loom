#!/usr/bin/env bash
# Loom localization guard wrapper
# Usage: bash scripts/check-docs-localization.sh [paths...]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
GUARD="$ROOT_DIR/skills/owned-text-localization-guard/scripts/markdown_localization_guard.py"

if [ ! -f "$GUARD" ]; then
    echo "ERROR: Localization guard script not found at $GUARD" >&2
    exit 1
fi

python3 "$GUARD" --root="$ROOT_DIR" "$@"
