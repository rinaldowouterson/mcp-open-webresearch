#!/usr/bin/env bash
# VERSION="1.0.0"

set -eu

# ---------- Logging Helpers ----------
log() {
    printf '[%s] %s: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2" >&2
}

info() { log INFO "$1"; }
warn() { log WARN "$1"; }
err() { log ERROR "$1"; }

# ---------- Environment Check ----------
    # Exit if not running in Docker
    if [[ ! -f "/.dockerenv" ]] && ! grep -qE '/docker/|/kubepods/' /proc/1/cgroup 2>/dev/null; then
        err "This launcher is designed to run only in Docker environments"
        exit 1
    fi

    info "Docker environment confirmed"

    export DOCKER_ENVIRONMENT=true

    # Validate Chromium executable from ENV
    if [[ -z "${CHROMIUM_EXECUTABLE_PATH:-}" ]]; then
        # If not set, try to detect standard locations for logging/fallback (but prefer fixed ENV)
        if [[ -f "/usr/bin/chromium" ]]; then
            warn "CHROMIUM_EXECUTABLE_PATH not set, defaulting to /usr/bin/chromium"
            export CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"
        elif [[ -f "/usr/bin/chromium-browser" ]]; then
            warn "CHROMIUM_EXECUTABLE_PATH not set, defaulting to /usr/bin/chromium-browser"
            export CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium-browser"
        else
            err "CHROMIUM_EXECUTABLE_PATH not set and no chromium found in standard paths"
            exit 1
        fi
    fi

    if [[ ! -f "$CHROMIUM_EXECUTABLE_PATH" ]]; then
         err "Chromium not found at $CHROMIUM_EXECUTABLE_PATH"
         exit 1
    fi
     
    info "Using Chromium at: $CHROMIUM_EXECUTABLE_PATH"

    info "Configuration: ENABLE_PROXY==> $ENABLE_PROXY |____| DRY_RUN==> $DRY_RUN"

    # If not using proxy, we can skip all certificate validation and run node directly
    if [[ "$ENABLE_PROXY" == "false" ]]; then
        export NODE_USE_SYSTEM_CA=0
        info "Proxy disabled - NODE_USE_SYSTEM_CA set to 0"
        info "Proxy not required - proceeding with simple startup"
        if [[ "$DRY_RUN" == "true" ]]; then
            info "DRY RUN: 'exec gosu node node build/index.js'"
            exit 0
        fi
        info "Starting node.js as non-root user with ES modules support"
        exec gosu node node "build/index.js"
    fi
# If ENABLE_PROXY is not "false", it must be "true" for proxy configuration
if [[ "$ENABLE_PROXY" != "true" ]]; then
    err "Invalid value for ENABLE_PROXY: '$ENABLE_PROXY'. Must be 'true' or 'false'."
    exit 1
fi

export NODE_USE_SYSTEM_CA=1
info "Proxy enabled - NODE_USE_SYSTEM_CA set to 1"


ensure_variable_not_empty() {
    local var_name="$1" var_value="$2"
    if [[ -z "$var_value" ]]; then
        err "Required environment variable $var_name is not set"
        exit 1
    fi
}

    # Proxy configuration validation
    info "Proxy required - proceeding with proxy configuration validation"
    ensure_variable_not_empty "CERT_HOST_FOR_STORE" "${CERT_HOST_FOR_STORE:-}"

    # Validate CERT_HOST_FOR_STORE mount (check if the mounted directory exists in container)
    local cert_mount_store="/usr/local/share/ca-certificates/host_certs"
    if [[ ! -d "$cert_mount_store" ]]; then
        err "CERT_HOST_FOR_STORE mount missing or invalid. Ensure CERT_HOST_FOR_STORE is set in .env and points to a valid host directory with store subdir containing certificates."
        exit 1
    fi

    validate_certificate_file() {
        local path="$1" name="$2"
        if [[ -z "$path" ]]; then
            err "No certificate file path provided for $name."
            exit 1
        fi

        # Check file exists and is readable
        if [[ ! -r "$path" ]]; then
            err "Certificate file not found or unreadable for $name: $path"
            exit 1
        fi

        # Validate with openssl for full cert validity
        if ! openssl x509 -in "$path" -text -noout >/dev/null 2>&1; then
            err "Invalid certificate file for $name: $path (openssl validation failed)"
            exit 1
        fi

        info "Certificate $name validated: $path"
        return 0
    }

    # Check and validate each certificate file in the mounted dir
    local has_valid_certs=false
    for file in "$cert_mount_store"/*.crt; do
        if [[ -f "$file" ]]; then
            validate_certificate_file "$file" "system CA"
            has_valid_certs=true
        fi
    done
    if [[ "$has_valid_certs" == "false" ]]; then
        err "No valid .crt files found in mounted CERT_HOST_FOR_STORE ($cert_mount_store). Please place .crt files in the /store directory."
        exit 1
    fi
    info "CERT_HOST_FOR_STORE mount validated: All certificates valid"

    # Auto-update system CA trust store with mounted certificates (requires root)
    info "Updating system CA trust store with custom certificates..."
    cp "$cert_mount_store"/*.crt /usr/local/share/ca-certificates/
    if update-ca-certificates; then
        info "System CA trust store updated successfully"
        # Verify if our specific cert is in the text (optional, but good for debug)
        if grep -q "Test CA" /etc/ssl/certs/ca-certificates.crt 2>/dev/null; then
             info "Confirmed 'Test CA' is present in system bundle"
        fi

        # Update Chromium's NSS Database (required for it to trust the System CA)
        info "Updating Chromium NSS Database for user 'node'..."
        mkdir -p /home/node/.pki/nssdb
        certutil -d sql:/home/node/.pki/nssdb -N --empty-password
        
        for cert in /usr/local/share/ca-certificates/*.crt; do
            [ -e "$cert" ] || continue
            cert_name=$(basename "$cert")
            info "Importing $cert_name into NSS DB"
            certutil -d sql:/home/node/.pki/nssdb -A -t "C,," -n "$cert_name" -i "$cert"
        done
        
        # Fix ownership so the node user can read it
        chown -R node:node /home/node/.pki
        info "Chromium NSS Database updated."
    else
        err "Failed to update CA trust store. Check certificate formats."
        exit 1
    fi
    
    info "Proxy configuration validated successfully"


# ---------- Execution ----------
if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN: 'exec gosu node node build/index.js'"
    exit 0
fi

info "Starting node.js as non-root user"
exec gosu node node "build/index.js"
