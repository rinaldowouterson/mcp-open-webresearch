/**
 * Test certificate utilities - ensures certs exist before tests run.
 * Generates them on-demand if missing.
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const DEFAULT_CERT_DIR = path.join(process.cwd(), "certs/test");
const DEFAULT_KEY_DIR = path.join(DEFAULT_CERT_DIR, "key");
const DEFAULT_CERT_FILE = path.join(DEFAULT_CERT_DIR, "test-ca.crt");
const DEFAULT_KEY_FILE = path.join(DEFAULT_KEY_DIR, "test-ca.key");

/**
 * Check if openssl is available in PATH
 */
function hasOpenSSL(): boolean {
  try {
    execSync("openssl version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate test certificates if they don't exist
 */
function generateCerts(keyPath: string, certPath: string): void {
  const keyDir = path.dirname(keyPath);
  const certDir = path.dirname(certPath);

  // Create directories if needed
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }
  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  console.log("Generating test certificates on-demand...");
  execSync(
    `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=US/ST=Test/L=Test/O=Test/CN=Test CA"`,
    { stdio: "inherit" }
  );

  // Set appropriate permissions
  fs.chmodSync(keyPath, 0o600);
  fs.chmodSync(certPath, 0o644);

  console.log(`Test certificates generated:\n  ${certPath}\n  ${keyPath}`);
}

export interface TestCerts {
  key: string;
  cert: string;
  keyPath: string;
  certPath: string;
}

/**
 * Ensures test certificates exist, generating them if needed.
 * Returns the cert/key contents ready for use.
 * 
 * @throws If openssl is not available and certs don't exist
 */
export function ensureTestCerts(): TestCerts {
  const keyPath = process.env.TEST_CA_KEY_PATH || DEFAULT_KEY_FILE;
  const certPath = process.env.TEST_CA_CERT_PATH || DEFAULT_CERT_FILE;

  const keyExists = fs.existsSync(keyPath);
  const certExists = fs.existsSync(certPath);

  if (!keyExists || !certExists) {
    if (!hasOpenSSL()) {
      throw new Error(
        `Test certificates not found and openssl is not available.\n` +
        `Expected:\n  ${keyPath}\n  ${certPath}\n` +
        `Either install openssl or create the certificates manually.`
      );
    }
    generateCerts(keyPath, certPath);
  }

  return {
    key: fs.readFileSync(keyPath, "utf8"),
    cert: fs.readFileSync(certPath, "utf8"),
    keyPath,
    certPath,
  };
}
