import { isIP, isIPv4, isIPv6 } from "net";

const BROWSER_PROTOCOL_PATTERN = /^https?:$/i;

// Private IP Ranges
// 127.0.0.0/8      - Loopback
// 10.0.0.0/8       - Private Network
// 172.16.0.0/12    - Private Network
// 192.168.0.0/16   - Private Network
// 169.254.0.0/16   - Link-Local
const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
];

// Private IPv6 Ranges
// ::1/128          - Loopback
// fc00::/7         - Unique Local Address
// fe80::/10        - Link-Local Unicast
const PRIVATE_IPV6_RANGES = [
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe[8-9a-b][0-9a-f]:/i,
];

function isPrivateIP(hostname: string): boolean {
  if (isIP(hostname) === 0) return false; // Not an IP

  if (isIPv4(hostname)) {
    return PRIVATE_IPV4_RANGES.some((regex) => regex.test(hostname));
  }

  if (isIPv6(hostname)) {
    // Normalize IPv6 heavily simplified check
    // Ideally use library, but simple prefix check catches most common
    return PRIVATE_IPV6_RANGES.some((regex) => regex.test(hostname));
  }

  return false;
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  );
}

export function isValidBrowserUrl(url: string): boolean {
  if (url.trim().length === 0) return false;
  try {
    const testUrl = new URL(url);
    
    // Check Protocol
    if (!BROWSER_PROTOCOL_PATTERN.test(testUrl.protocol)) {
      return false;
    }

    let hostname = testUrl.hostname;
    // IPv6 addresses in URLs are enclosed in brackets, but net.isIP expects them without
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }

    // Check Localhost
    if (isLocalhost(hostname)) {
      return false;
    }

    // Check Private IPs
    if (isPrivateIP(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
