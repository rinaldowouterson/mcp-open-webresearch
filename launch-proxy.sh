#!/usr/bin/env bash
# Secure Environment Launcher - Compatible with existing .env format
# Fixes critical security issues while maintaining .env compatibility

set -eu

# ---------- Logging helpers ----------
log() { printf '[%s] %s: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2" >&2; }
info() { log INFO "$1"; }
warn() { log WARN "$1"; }
err() { log ERROR "$1"; }

# ---------- Small portability helpers ----------
lowercase() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

# ---------- Validation helpers (aligned with .env requirements) ----------
validate_cert() {
  local p="$1" name="$2"
  [[ -z "$p" ]] && return 0

  # Expand tilde as documented in .env
  if [[ "$p" = ~* ]]; then
    p="${p/#~/$HOME}"
  fi

  # Check for path traversal
  if [[ "$p" =~ \.\. ]]; then
    err "Path traversal detected in $name: $p"
    return 1
  fi

  # Check file exists and is readable
  if [[ ! -r "$p" ]]; then
    err "Certificate file not found or unreadable for $name: $p"
    return 1
  fi
  return 0
}

# ---------- .env loading (secure line-by-line parsing) ----------
ENV_FILE=".env"
if [[ -f "$ENV_FILE" ]]; then
  info "Loading $ENV_FILE (without overriding exported shell vars)"
  line_no=0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    ((line_no++))
    # trim surrounding whitespace
    line="$(printf '%s' "$raw" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$line" ]] && continue

    # Skip full-line comments (first non-space char is '#')
    if [[ "$line" =~ ^# ]]; then
      continue
    fi

    # Parse KEY=VALUE format with support for quoted values
    if echo "$line" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*='; then
      key="${line%%=*}"
      val="${line#*=}"
      
      # Handle quoted values
      case "$val" in
        \"*\")
          # Double-quoted: remove outer quotes and handle escaped quotes
          val="${val%\"}"
          val="${val#\"}"
          val="$(printf '%s' "$val" | sed 's/\\"/"/g')"
          ;;
        \'*\')
          # Single-quoted: remove outer quotes
          val="${val%\'}"
          val="${val#\'}"
          ;;
        *)
          # Unquoted: strip inline comments and trailing whitespace
          val="$(printf '%s' "$val" | sed -e 's/[[:space:]]*#.*$//' -e 's/[[:space:]]*$//')"
          ;;
      esac

      # Respect existing exported environment
      if printenv "$key" >/dev/null 2>&1; then
        info "Env var '$key' already present; keeping shell value"
        continue
      fi

      # Validate according to .env constraints
      case "$key" in
        USE_PROXY|DRY_RUN)
          case "$(lowercase "$val")" in
            true|false) ;;
            *) err "Invalid boolean for $key: '$val' (must be true or false)"; exit 1 ;;
          esac
          ;;
        NODE_EXTRA_CA_CERTS)
          if [[ "$val" = ~* ]]; then
            if [[ -z "$HOME" ]]; then
              err "Cannot expand tilde in $key: HOME environment variable is not set."
              exit 1
            fi
            val="${val/#~/$HOME}"
          fi
          validate_cert "$val" "$key" || exit 1
          ;;
      esac

      # assign to a shell variable visible to this script
      eval "$key=\"\$val\""
      info "Loaded .env key: $key"
    else
      err "Invalid line in $ENV_FILE at $line_no: $line"
      exit 1
    fi
  done < "$ENV_FILE"
else
  info "No .env file found"
fi

# ---------- Flags and normalization (strict true/false only) ----------
USE_PROXY="${USE_PROXY:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Strict boolean parsing: accept only 'true' or 'false' (case-insensitive)
case "$(lowercase "$USE_PROXY")" in
  true) USE_PROXY=true ;;
  false) USE_PROXY=false ;;
  *) err "Invalid boolean for USE_PROXY: '$USE_PROXY' (must be true or false)"; exit 1 ;;
esac
case "$(lowercase "$DRY_RUN")" in
  true) DRY_RUN=true ;;
  false) DRY_RUN=false ;;
  *) err "Invalid boolean for DRY_RUN: '$DR_RUN' (must be true or false)"; exit 1 ;;
esac

info "USE_PROXY=$USE_PROXY DRY_RUN=$DRY_RUN"

# ---------- Decide injection policy for NODE_EXTRA_CA_CERTS ----------
inject_cert=false
if [[ "$USE_PROXY" == true ]]; then
  if [[ -n "${NODE_EXTRA_CA_CERTS:-}" ]]; then
    inject_cert=true
    info "USE_PROXY=true and NODE_EXTRA_CA_CERTS is set -> will inject cert var"
  else
    warn "USE_PROXY=true but NODE_EXTRA_CA_CERTS not found in environment or .env -> nothing to inject"
  fi
else
  info "USE_PROXY != true -> not injecting cert var"
fi

# ---------- Validate critical values ----------
if [[ -n "${NODE_EXTRA_CA_CERTS:-}" ]]; then
  validate_cert "$NODE_EXTRA_CA_CERTS" NODE_EXTRA_CA_CERTS || exit 1
fi

# ---------- Build env array for exec (no eval) ----------
cmd=("env")
# Preserve PATH so node can be resolved in common developer setups
cmd+=("PATH=$PATH")

if [[ "$inject_cert" == true ]]; then
  cmd+=("NODE_EXTRA_CA_CERTS=${NODE_EXTRA_CA_CERTS}")
fi

# Append node and args. Default to build/index.js for production use
if [[ "$#" -eq 0 ]]; then
  node_args=("build/index.js")
else
  node_args=("$@")
fi
cmd+=("node")
cmd+=("${node_args[@]}")

# ---------- Dry run or execute ----------
info "DRY_RUN=$DRY_RUN"
info "Final command components:"
for part in "${cmd[@]}"; do
  echo "  $part"
done

if [[ "$DRY_RUN" == true ]]; then
  info "DRY RUN mode - not executing"
  exit 0
fi

info "Executing launched command"
exec "${cmd[@]}"
