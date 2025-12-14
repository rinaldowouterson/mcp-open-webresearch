# Bug Report: Docker Fetch Proxy E2E Tests

## Overview
We encountered issues enabling 'fetch_proxy_e2e.test.ts' within the Docker environment. These tests verify that the 'fetch' engine (using 'axios') correctly routes traffic through proxies.

## The Issue
The tests use 'mockttp' to create a local, self-contained proxy server.
- 'mockttp' (by default) generates a random self-signed SSL certificate.
- The 'axios' instance uses 'https-proxy-agent', which validates certificates against the system's trusted CAs.
- In Docker, this validation failed with 'Client network socket disconnected before secure TLS connection was established' (indicating a TLS error).

## Attempted Solutions

### 1. Environment Variable ('NODE_TLS_REJECT_UNAUTHORIZED=\'0\'')
- **Effect**: Failed. The 'HttpsProxyAgent' library does not automatically respect this env var for its internal TLS socket creation in all versions/configurations used.

### 2. Modifying Production Code
- **Proposed**: Update 'loader.ts' to disable SSL verification.
- **Result**: REJECTED. Unsafe for production.

### 3. Test-Side Patching
- **Proposed**: Manually overwrite 'axios.defaults.httpsAgent' in the test.
- **Result**: Flaky/Inelegant. Required complex manual agent reconstruction and was prone to race conditions or API mismatches.

## Final Solution: Trusted Test CA
We implemented a clean solution by leveraging the existing Docker test infrastructure.

- **Infrastructure**: Our 'Dockerfile_Test' and 'docker_launcher_test.sh' already install a dedicated "Test Root CA" ('test-ca.crt') into the container's system trust store.
- **Refactor**: We updated 'fetch_proxy_e2e.test.ts' to load this **same CA certificate and key** (via 'TEST_CA_KEY_PATH'/'TEST_CA_CERT_PATH') and pass them to 'mockttp.getLocal()'.
- **Outcome**: 'mockttp' now signs its fake certificates using a CA that the Docker container **already trusts**.
- **Result**: Valid Full TLS Handshake. Tests pass with '200 OK' and standard assertions. No production code changes required.

## Status
RESOLVED. All tests passing in Docker.
