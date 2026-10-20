#!/usr/bin/env bash
# Air cloud startup for Skill Atlas (Node 24+ / TypeScript CLI, no servers).
#
# Runs in two modes, told apart by AIR_STARTUP_MODE:
#   warmup — the snapshot-baking run: install everything, then prove the environment with `healthcheck`.
#   task   — a real task run: make sure dependencies are in place and return promptly.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi
log() { printf '[startup %s] %s\n' "$(date +%H:%M:%S)" "$*"; }

REQUIRED_NODE_MAJOR=24   # package.json: "engines": { "node": ">=24" }

# --- Node.js toolchain -------------------------------------------------------------------------
# The Air workspace image ships Node 25 via nvm under /usr/local/nvm. If it is ever missing or too
# old, install a suitable Node in userspace with nvm (no sudo available) and hook it into the
# login/interactive shell profiles so the agent's shell sees it too.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

ensure_node() {
  if command -v node >/dev/null 2>&1 && [ "$(node_major)" -ge "$REQUIRED_NODE_MAJOR" ]; then
    log "Node $(node --version) / npm $(npm --version) already available"
    return 0
  fi
  log "Node >= $REQUIRED_NODE_MAJOR not found; installing Node $REQUIRED_NODE_MAJOR with nvm into \$HOME/.nvm"
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install "$REQUIRED_NODE_MAJOR"
  nvm alias default "$REQUIRED_NODE_MAJOR"
  nvm use default

  # Login shells read only the FIRST of these; interactive non-login shells read ~/.bashrc.
  local env_file="$HOME/.air-env.sh" marker='# air-startup: skill-atlas env' profile
  cat > "$env_file" <<'ENV'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
ENV
  profile=""
  for f in "$HOME/.bash_profile" "$HOME/.bash_login" "$HOME/.profile"; do
    if [ -f "$f" ]; then profile="$f"; break; fi
  done
  [ -n "$profile" ] || { profile="$HOME/.profile"; touch "$profile"; }
  for f in "$profile" "$HOME/.bashrc"; do
    touch "$f"
    grep -qF "$marker" "$f" || printf '\n%s\n[ -f "%s" ] && . "%s"\n' "$marker" "$env_file" "$env_file" >> "$f"
  done
  log "Installed Node $(node --version) / npm $(npm --version)"
}

ensure_node

# --- Dependencies ------------------------------------------------------------------------------
# `npm ci` is the documented first step (AGENTS.md / README). It is a ~2s step and keeps
# node_modules in sync with package-lock.json, so run it in both modes; in warmup it also primes
# the npm cache that lands in the snapshot.
log "npm ci"
npm ci --no-audit --no-fund
log "npm ci done"

# --- Health check ------------------------------------------------------------------------------
# Skill Atlas is a CLI with no long-running processes, so there is nothing to wait for: the check
# is the project's own definition of done (AGENTS.md: all tests pass) plus the CI smoke test — the
# real CLI on the fixture repository must exit 0. Any failure makes startup exit non-zero.
healthcheck() {
  log "healthcheck: typecheck"
  npm run typecheck
  log "healthcheck: tests"
  npm test
  log "healthcheck: CLI smoke test on ./fixture"
  ./skill-atlas help
  local out
  out="$(./skill-atlas scan ./fixture)"
  printf '%s\n' "$out"
  if ! printf '%s\n' "$out" | grep -q '^fixture · 3 skills$'; then
    log "healthcheck FAILED: './skill-atlas scan ./fixture' did not report the 3 fixture skills"
    return 1
  fi
  log "healthcheck passed"
}

if [ -n "${WARMUP:-}" ]; then
  log "warmup mode: running healthcheck"
  healthcheck
else
  log "task mode: environment ready"
fi
