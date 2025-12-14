import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When running from build/scripts/, certs are at ../../certs/test
const certDir = path.join(__dirname, '../../certs/test');
const keyDir = path.join(certDir, 'key');
const certFile = path.join(certDir, 'test-ca.crt');
const keyFile = path.join(keyDir, 'test-ca.key');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function checkOpenSSL(): boolean {
    try {
        execSync('openssl version', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function generateCerts() {
    console.log('Generating test certificates...');

    if (!checkOpenSSL()) {
        console.error('Error: openssl not found in PATH. Cannot generate certificates.');
        process.exit(1);
    }

    ensureDir(keyDir);

    // Generate CA certificate and private key
    // -nodes: No password for key
    // -x509: Output a X.509 structure instead of a cert request
    // -days 365: Valid for a year
    // -subj: avoid interactive prompts
    try {
        execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyFile}" -out "${certFile}" -days 365 -nodes -subj "/C=US/ST=Test/L=Test/O=Test/CN=Test CA"`, { stdio: 'inherit' });
        
        // Fix permissions (read-only for user, restrictive for key)
        fs.chmodSync(keyFile, 0o600);
        fs.chmodSync(certFile, 0o644);

        console.log(`Certificates generated at:\n  ${certFile}\n  ${keyFile}`);
    } catch (e) {
        console.error('Failed to generate certificates:', e);
        process.exit(1);
    }
}

generateCerts();
