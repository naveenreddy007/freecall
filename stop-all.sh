#!/usr/bin/env bash

set -euo pipefail

BACKEND_PID_FILE="/tmp/globcall-backend.pid"
FRONTEND_PID_FILE="/tmp/globcall-frontend.pid"

stop_process() {
  local name="$1"
  local pidfile="$2"

  if [[ ! -f "$pidfile" ]]; then
    printf '%s not running\n' "$name"
    return
  fi

  local pid
  pid="$(cat "$pidfile")"

  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    for _ in {1..10}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 1
    done

    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi

    printf '%s stopped\n' "$name"
  else
    printf '%s was not running\n' "$name"
  fi

  rm -f "$pidfile"
}

stop_process "backend" "$BACKEND_PID_FILE"
stop_process "frontend" "$FRONTEND_PID_FILE"
