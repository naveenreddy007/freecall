#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKEND_PID_FILE="/tmp/globcall-backend.pid"
FRONTEND_PID_FILE="/tmp/globcall-frontend.pid"
BACKEND_LOG="/tmp/globcall-backend.log"
FRONTEND_LOG="/tmp/globcall-frontend.log"

start_process() {
  local name="$1"
  local pidfile="$2"
  local logfile="$3"
  shift 3

  if [[ -f "$pidfile" ]]; then
    local existing_pid
    existing_pid="$(cat "$pidfile")"
    if kill -0 "$existing_pid" 2>/dev/null; then
      printf '%s already running (pid %s)\n' "$name" "$existing_pid"
      return
    fi
    rm -f "$pidfile"
  fi

  ("$@") >"$logfile" 2>&1 &
  local pid=$!
  printf '%s started (pid %s)\n' "$name" "$pid"
  printf '%s\n' "$pid" >"$pidfile"
}

start_process "backend" "$BACKEND_PID_FILE" "$BACKEND_LOG" \
  bash -lc "cd '$ROOT_DIR/backend' && exec node server.js"

start_process "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG" \
  bash -lc "cd '$ROOT_DIR/frontend' && exec ./node_modules/.bin/vite"

printf 'Logs: %s and %s\n' "$BACKEND_LOG" "$FRONTEND_LOG"
