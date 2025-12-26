#!/usr/bin/env bash
# docker_launcher_test.sh
# Special launcher for Docker-based E2E tests with MITM Proxy
# Based on docker_launcher.sh structure for consistency

# set -eu
# set -eu

# ---------- Logging Helpers ----------
log() {
    printf '[%s] %s: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2" >&2
}

info() { log INFO "$1"; }
warn() { log WARN "$1"; }
err() { log ERROR "$1"; }

ensure_variable_not_empty() {
    local var_name="$1" var_value="$2"
    if [[ -z "$var_value" ]]; then
        err "Required environment variable $var_name is not set"
        exit 1
    fi
}

info "Starting Test Launcher..."

# ---------- Environment Check ----------
# Exit if not running in Docker
if [[ ! -f "/.dockerenv" ]] && ! grep -qE '/docker/|/kubepods/' /proc/1/cgroup 2>/dev/null; then
    err "This launcher is designed to run only in Docker environments"
    exit 1
fi

info "Docker environment confirmed"
export DOCKER_ENVIRONMENT=true

# Detect Chromium executable
if [[ -f "/usr/bin/chromium" ]]; then
    export CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"
elif [[ -f "/usr/bin/chromium-browser" ]]; then
    export CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium-browser"
else
    err "Chromium executable not found in /usr/bin/"
    ls -l /usr/bin/chrom* || true
    exit 1
fi
info "Using Chromium at: $CHROMIUM_EXECUTABLE_PATH"

# ---------- 1. System CA Setup ----------
# This mirrors the production logic to ensure we are testing a realistic environment
info "Configuring System CA..."
CERT_MOUNT_STORE="/usr/local/share/ca-certificates/host_certs"

if [[ ! -d "$CERT_MOUNT_STORE" ]]; then
    warn "CERT_MOUNT_STORE ($CERT_MOUNT_STORE) not found. System CA update skipped."
else
    # Check if there are certificates to install
    count=$(find "$CERT_MOUNT_STORE" -name "*.crt" | wc -l)
    if [[ "$count" -gt 0 ]]; then
        info "Found $count certificates in $CERT_MOUNT_STORE. Installing..."
        cp "$CERT_MOUNT_STORE"/*.crt /usr/local/share/ca-certificates/
        
        if update-ca-certificates; then
            info "System CA trust store updated successfully."
            
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
            
            # Debug: List certs
            info "Listing certs in NSS DB:"
            certutil -L -d sql:/home/node/.pki/nssdb
        else

            err "Failed to update CA certificates"
            exit 1
        fi
    else
        warn "No .crt files found in $CERT_MOUNT_STORE."
    fi
fi

# ---------- 2. MITM Proxy Setup ----------
info "Configuring MITM Proxy..."

# Use environment variables passed from docker-compose
ensure_variable_not_empty "TEST_CA_KEY_PATH" "${TEST_CA_KEY_PATH:-}"
ensure_variable_not_empty "TEST_CA_CERT_PATH" "${TEST_CA_CERT_PATH:-}"

MITM_CONFDIR="/tmp/mitm"
mkdir -p "$MITM_CONFDIR"
# mitmproxy looks for 'mitmproxy-ca.pem' in the confdir for signing (dynamic generation)
PROXY_PEM_PATH="$MITM_CONFDIR/mitmproxy-ca.pem"

if [[ -f "$TEST_CA_KEY_PATH" ]] && [[ -f "$TEST_CA_CERT_PATH" ]]; then
    info "Found test key and cert. Combining into $PROXY_PEM_PATH..."
    # mitmproxy requires a single PEM file with "private key" + "certificate"
    cat "$TEST_CA_KEY_PATH" "$TEST_CA_CERT_PATH" > "$PROXY_PEM_PATH"
    chmod 600 "$PROXY_PEM_PATH"
    info "Created $PROXY_PEM_PATH"
else
    err "Test key ($TEST_CA_KEY_PATH) or certificate ($TEST_CA_CERT_PATH) not found."
    ls -l $(dirname "$TEST_CA_KEY_PATH") || true
    ls -l $(dirname "$TEST_CA_CERT_PATH") || true
    exit 1
fi

# Start mitmdump in background
info "Starting mitmdump in background..."
mitmdump \
    --listen-port 8080 \
    --set confdir="$MITM_CONFDIR" \
    > /tmp/mitmproxy.log 2>&1 &

MITM_PID=$!
info "mitmdump started with PID $MITM_PID"

# Wait for port 8080 to be active
info "Waiting for proxy to match port 8080..."
for i in {1..30}; do
    if nc -z localhost 8080; then
        info "Proxy is up!"
        break
    fi
    sleep 1
done

if ! nc -z localhost 8080; then
    err "Proxy failed to start. Check /tmp/mitmproxy.log"
    cat /tmp/mitmproxy.log
    exit 1
fi

# ---------- 3. Environment Setup ----------
export NODE_USE_SYSTEM_CA=1
export ENABLE_PROXY=true
export HTTP_PROXY="http://localhost:8080"
export HTTPS_PROXY="http://localhost:8080"

info "Environment configured: NODE_USE_SYSTEM_CA=1, Proxy at localhost:8080"

# ---------- 4. Run Tests ----------
if [[ "${DRY_RUN:-false}" == "true" ]]; then
    info "DRY RUN: exec $*"
    exit 0
fi

info "Starting Tests as user 'node'..."
# exec gosu node "$@"
set +e
gosu node "$@"
TEST_EXIT_CODE=$?
set -e

info "Tests finished with exit code $TEST_EXIT_CODE."
# if [[ -f /tmp/mitmproxy.log ]]; then
#     tail -n 50 /tmp/mitmproxy.log
# else
#     warn "/tmp/mitmproxy.log not found."
# fi

exit $TEST_EXIT_CODE

