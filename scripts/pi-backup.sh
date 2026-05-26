#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# pi-backup.sh — Portable backup of pi environment for machine migration
# ══════════════════════════════════════════════════════════════════════════════
# Creates: pi-backup-YYYY-MM-DD.tar.gz
#
# Includes:
#   - System prompt (AGENTS.md)
#   - LLM provider config with API keys (models.json)
#   - Settings, auth, themes, bin/
#   - Extensions (without context7 cache)
#   - npm package.json + package-lock.json (deps list, not node_modules)
#   - pi-search-hub from node_modules (npm version is broken — keep local copy)
#   - Global skills (~/.agents/skills/)
#   - Home context (agent-context.toml, AGENTS.md)
#
# Excludes:
#   - sessions/ (1.4MB of history)
#   - node_modules/ except pi-search-hub (220MB)
#   - context7/cache/ (re-indexable)
#   - .bak files
#
# ⚠️  WARNING: Archive contains API keys from models.json.
#     Store the tarball in a secure location.
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}"
TIMESTAMP="$(date +%Y-%m-%d)"
ARCHIVE_NAME="pi-backup-${TIMESTAMP}.tar.gz"
TMPDIR="$(mktemp -d /tmp/pi-backup-XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "=== pi backup: ${TIMESTAMP} ==="

# ── Resolve home ──────────────────────────────────────────────────────────
PI_AGENT="${HOME}/.pi/agent"
AGENTS_SKILLS="${HOME}/.agents/skills"

if [ ! -d "$PI_AGENT" ]; then
    echo "ERROR: ${PI_AGENT} not found. Is pi installed?"
    exit 1
fi

# ── Create staging directory ──────────────────────────────────────────────
STAGE="${TMPDIR}/pi-backup"
mkdir -p "${STAGE}/.pi/agent"
mkdir -p "${STAGE}/.pi"

# ── 1. System prompt ──────────────────────────────────────────────────────
echo "[1/9] AGENTS.md"
cp "${PI_AGENT}/AGENTS.md" "${STAGE}/.pi/agent/"

# ── 2. Models config (with API keys — handle with care) ───────────────────
echo "[2/9] models.json"
cp "${PI_AGENT}/models.json" "${STAGE}/.pi/agent/"

# ── 3. Settings & auth ────────────────────────────────────────────────────
echo "[3/9] settings + auth"
cp "${PI_AGENT}/settings.json" "${STAGE}/.pi/agent/" 2>/dev/null || true
cp "${HOME}/.pi/settings.json" "${STAGE}/.pi/" 2>/dev/null || true
cp "${PI_AGENT}/auth.json" "${STAGE}/.pi/agent/" 2>/dev/null || true

# ── 4. Themes ─────────────────────────────────────────────────────────────
echo "[4/9] themes"
if [ -d "${PI_AGENT}/themes" ]; then
    cp -r "${PI_AGENT}/themes" "${STAGE}/.pi/agent/"
fi

# ── 5. Bin (fd, rg, etc.) ─────────────────────────────────────────────────
echo "[5/9] bin/"
if [ -d "${PI_AGENT}/bin" ]; then
    cp -r "${PI_AGENT}/bin" "${STAGE}/.pi/agent/"
fi

# ── 6. Extensions (without cache) ─────────────────────────────────────────
echo "[6/9] extensions/"
if [ -d "${PI_AGENT}/extensions" ]; then
    mkdir -p "${STAGE}/.pi/agent/extensions"
    for item in "${PI_AGENT}/extensions"/*; do
        name="$(basename "$item")"
        if [ "$name" = "context7" ]; then
            # Copy context7 extension but exclude cache/
            mkdir -p "${STAGE}/.pi/agent/extensions/context7"
            for sub in "${PI_AGENT}/extensions/context7"/*; do
                subname="$(basename "$sub")"
                if [ "$subname" != "cache" ]; then
                    cp -r "$sub" "${STAGE}/.pi/agent/extensions/context7/"
                fi
            done
        else
            cp -r "$item" "${STAGE}/.pi/agent/extensions/"
        fi
    done
fi

# ── 7. npm: package.json + package-lock.json + pi-search-hub ──────────────
echo "[7/9] npm config + pi-search-hub"
NPM_DIR="${PI_AGENT}/npm"
if [ -d "$NPM_DIR" ]; then
    mkdir -p "${STAGE}/.pi/agent/npm"
    cp "${NPM_DIR}/package.json" "${STAGE}/.pi/agent/npm/" 2>/dev/null || true
    cp "${NPM_DIR}/package-lock.json" "${STAGE}/.pi/agent/npm/" 2>/dev/null || true

    # pi-search-hub: npm version is broken, keep local working copy
    PSH="${NPM_DIR}/node_modules/pi-search-hub"
    if [ -d "$PSH" ]; then
        mkdir -p "${STAGE}/.pi/agent/npm/node_modules"
        cp -r "$PSH" "${STAGE}/.pi/agent/npm/node_modules/"
        echo "       pi-search-hub saved ($(du -sh "$PSH" | cut -f1))"
    fi
fi

# ── 8. Skills ─────────────────────────────────────────────────────────────
echo "[8/9] skills/"
if [ -d "$AGENTS_SKILLS" ]; then
    mkdir -p "${STAGE}/.agents"
    cp -r "$AGENTS_SKILLS" "${STAGE}/.agents/"
fi

# ── 9. Home context ───────────────────────────────────────────────────────
echo "[9/9] home context"
cp "${HOME}/agent-context.toml" "${STAGE}/" 2>/dev/null || true
cp "${HOME}/AGENTS.md" "${STAGE}/" 2>/dev/null || true

# ── Package ────────────────────────────────────────────────────────────────
ARCHIVE_PATH="${OUTPUT_DIR}/${ARCHIVE_NAME}"
echo ""
echo "Packaging: ${ARCHIVE_NAME}"
tar czf "$ARCHIVE_PATH" -C "$TMPDIR" pi-backup

SIZE="$(du -h "$ARCHIVE_PATH" | cut -f1)"
echo ""
echo "✅  Backup created: ${ARCHIVE_PATH}"
echo "    Size: ${SIZE}"
echo ""
echo "⚠️  WARNING: Archive contains API keys from models.json"
echo "    Keep this file in a secure location."
echo ""
echo "To restore on another machine:"
echo "    tar xzf ${ARCHIVE_NAME} -C ~/"
echo "    cd ~/.pi/agent/npm && npm install"
echo "    pi install <path-to-loom-repo>"
