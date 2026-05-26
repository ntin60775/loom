#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# pi-restore.sh — Restore pi environment from a portable backup archive
# ══════════════════════════════════════════════════════════════════════════════
# Usage: bash pi-restore.sh <pi-backup-YYYY-MM-DD.tar.gz>
#
# Restores:
#   - System prompt (AGENTS.md)
#   - LLM provider config with API keys (models.json)
#   - Settings, auth, themes, bin/
#   - Extensions
#   - npm dependencies (reinstalled via npm install)
#   - pi-search-hub working copy
#   - Global skills
#   - Home context
#
# ⚠️  Manual step after restore: verify/update API keys in models.json
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: bash pi-restore.sh <pi-backup-YYYY-MM-DD.tar.gz>"
    exit 1
fi

ARCHIVE="$1"

if [ ! -f "$ARCHIVE" ]; then
    echo "ERROR: Archive not found: $ARCHIVE"
    exit 1
fi

echo "=== pi restore from: $(basename "$ARCHIVE") ==="
echo ""

# ── Preflight checks ──────────────────────────────────────────────────────

if ! command -v pi &>/dev/null; then
    echo "ERROR: pi is not installed."
    echo "Install pi first: https://github.com/earendil-works/pi-coding-agent"
    exit 1
fi

echo "✓ pi found: $(pi --version 2>/dev/null || echo 'version unknown')"

# ── Warn about existing pi config ─────────────────────────────────────────

PI_AGENT="${HOME}/.pi/agent"
if [ -d "$PI_AGENT" ] && [ -f "${PI_AGENT}/AGENTS.md" ]; then
    echo ""
    echo "⚠️  Existing pi config found at ${HOME}/.pi/"
    echo "   Restoring will OVERWRITE:"
    echo "     - AGENTS.md, models.json, settings.json, auth.json"
    echo "     - themes/, bin/, extensions/ (cache preserved)"
    echo "     - skills/ in ~/.agents/"
    echo "   Sessions and most node_modules will be preserved."
    echo ""
    read -rp "   Continue? [y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 0
    fi
fi

# ── Extract ────────────────────────────────────────────────────────────────

echo ""
echo "Extracting archive..."
tar xzf "$ARCHIVE" -C /tmp/

STAGE="/tmp/pi-backup"
if [ ! -d "$STAGE" ]; then
    echo "ERROR: Archive structure incorrect (expected pi-backup/ root)"
    exit 1
fi

# ── Restore files ──────────────────────────────────────────────────────────

echo "Restoring configs..."

# System prompt
if [ -f "${STAGE}/.pi/agent/AGENTS.md" ]; then
    mkdir -p "${PI_AGENT}"
    cp "${STAGE}/.pi/agent/AGENTS.md" "${PI_AGENT}/"
    echo "  ✓ AGENTS.md"
fi

# Models config (API keys)
if [ -f "${STAGE}/.pi/agent/models.json" ]; then
    cp "${STAGE}/.pi/agent/models.json" "${PI_AGENT}/"
    echo "  ✓ models.json"
fi

# Settings
if [ -f "${STAGE}/.pi/agent/settings.json" ]; then
    cp "${STAGE}/.pi/agent/settings.json" "${PI_AGENT}/"
    echo "  ✓ settings.json"
fi
if [ -f "${STAGE}/.pi/settings.json" ]; then
    cp "${STAGE}/.pi/settings.json" "${HOME}/.pi/"
    echo "  ✓ .pi/settings.json"
fi

# Auth
if [ -f "${STAGE}/.pi/agent/auth.json" ]; then
    cp "${STAGE}/.pi/agent/auth.json" "${PI_AGENT}/"
    echo "  ✓ auth.json"
fi

# Themes
if [ -d "${STAGE}/.pi/agent/themes" ]; then
    rm -rf "${PI_AGENT}/themes" 2>/dev/null || true
    cp -r "${STAGE}/.pi/agent/themes" "${PI_AGENT}/"
    echo "  ✓ themes/"
fi

# Bin
if [ -d "${STAGE}/.pi/agent/bin" ]; then
    mkdir -p "${PI_AGENT}/bin"
    cp -r "${STAGE}/.pi/agent/bin/"* "${PI_AGENT}/bin/" 2>/dev/null || true
    echo "  ✓ bin/"
fi

# Extensions
if [ -d "${STAGE}/.pi/agent/extensions" ]; then
    mkdir -p "${PI_AGENT}/extensions"
    for item in "${STAGE}/.pi/agent/extensions"/*; do
        name="$(basename "$item")"
        if [ -d "${PI_AGENT}/extensions/${name}" ]; then
            # Merge: keep cache if it exists locally
            if [ -d "${PI_AGENT}/extensions/${name}/cache" ]; then
                rm -rf "${item}/cache" 2>/dev/null || true
            fi
        fi
        cp -r "$item" "${PI_AGENT}/extensions/"
    done
    echo "  ✓ extensions/"
fi

# npm: package.json + package-lock.json + pi-search-hub
if [ -f "${STAGE}/.pi/agent/npm/package.json" ]; then
    NPM_DIR="${PI_AGENT}/npm"
    mkdir -p "${NPM_DIR}"
    cp "${STAGE}/.pi/agent/npm/package.json" "${NPM_DIR}/"
    echo "  ✓ npm/package.json"
fi
if [ -f "${STAGE}/.pi/agent/npm/package-lock.json" ]; then
    cp "${STAGE}/.pi/agent/npm/package-lock.json" "${NPM_DIR}/"
    echo "  ✓ npm/package-lock.json"
fi

# pi-search-hub (working local copy)
PSH_SRC="${STAGE}/.pi/agent/npm/node_modules/pi-search-hub"
PSH_DST="${PI_AGENT}/npm/node_modules/pi-search-hub"
if [ -d "$PSH_SRC" ]; then
    mkdir -p "$(dirname "$PSH_DST")"
    rm -rf "$PSH_DST" 2>/dev/null || true
    cp -r "$PSH_SRC" "$PSH_DST"
    echo "  ✓ pi-search-hub (local copy)"
fi

# Skills
if [ -d "${STAGE}/.agents/skills" ]; then
    mkdir -p "${HOME}/.agents"
    rm -rf "${HOME}/.agents/skills" 2>/dev/null || true
    cp -r "${STAGE}/.agents/skills" "${HOME}/.agents/"
    echo "  ✓ skills/"
fi

# Home context
if [ -f "${STAGE}/agent-context.toml" ]; then
    cp "${STAGE}/agent-context.toml" "${HOME}/"
    echo "  ✓ agent-context.toml"
fi
if [ -f "${STAGE}/AGENTS.md" ]; then
    cp "${STAGE}/AGENTS.md" "${HOME}/"
    echo "  ✓ AGENTS.md"
fi

# ── Cleanup ────────────────────────────────────────────────────────────────

rm -rf "$STAGE"

# ── npm install ────────────────────────────────────────────────────────────

echo ""
echo "Installing npm dependencies..."
if [ -f "${NPM_DIR}/package.json" ]; then
    cd "${NPM_DIR}"
    npm install --production 2>&1 | tail -3
    echo "  ✓ npm dependencies installed"
else
    echo "  ⚠️  No package.json — skipping npm install"
fi

# ── Final instructions ─────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅  pi environment restored successfully"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "⚠️  MANUAL STEPS:"
echo ""
echo "  1. Check API keys in ${PI_AGENT}/models.json"
echo "     Replace any placeholder keys with real ones."
echo ""
echo "  2. Install loom (if needed):"
echo "     pi install <path-to-loom-repo>"
echo ""
echo "  3. Restart pi to load the restored configuration."
echo ""
