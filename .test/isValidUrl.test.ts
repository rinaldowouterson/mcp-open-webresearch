import { describe, test, expect } from "vitest";
import { isValidBrowserUrl } from "../src/utils/isValidUrl";
import { validProtocolPattern as isValidUrl } from "../src/config";

describe("isValidUrl", () => {
  test("validates HTTP URL", () => {
    expect(isValidUrl("http://proxy:8080")).toBe(true);
  });

  test("validates HTTPS URL", () => {
    expect(isValidUrl("https://proxy:8080")).toBe(true);
  });

  test("validates SOCKS5 URL", () => {
    expect(isValidUrl("socks5://proxy:1080")).toBe(true);
  });

  test("validates SOCKS5 URL with authentication", () => {
    expect(isValidUrl("socks5://user:pass@proxy:1080")).toBe(true);
  });

  test("validates SOCKS4A URL", () => {
    expect(isValidUrl("socks4a://proxy:1080")).toBe(false);
  });

  test("validates SOCKS4 URL", () => {
    expect(isValidUrl("socks4://proxy:1080")).toBe(false);
  });

  test("rejects invalid protocol", () => {
    expect(isValidUrl("ftp://proxy:21")).toBe(false);
  });

  test("rejects malformed URL", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  test("rejects URL without protocol", () => {
    expect(isValidUrl("proxy:8080")).toBe(false);
  });
});

describe("isValidBrowserUrl", () => {
  test("validates HTTP URL", () => {
    expect(isValidBrowserUrl("http://example.com")).toBe(true);
  });

  test("validates HTTPS URL", () => {
    expect(isValidBrowserUrl("https://example.com")).toBe(true);
  });

  test("rejects SOCKS5 URL", () => {
    expect(isValidBrowserUrl("socks5://proxy:1080")).toBe(false);
  });

  test("rejects FTP URL", () => {
    expect(isValidBrowserUrl("ftp://example.com")).toBe(false);
  });

  test("rejects file URL", () => {
    expect(isValidBrowserUrl("file:///path/to/file")).toBe(false);
  });

  test("rejects invalid URL", () => {
    expect(isValidBrowserUrl("not-a-url")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidBrowserUrl("")).toBe(false);
  });

  test("rejects URL without protocol", () => {
    expect(isValidBrowserUrl("example.com")).toBe(false);
  });

  test("rejects localhost", () => {
    expect(isValidBrowserUrl("http://localhost")).toBe(false);
    expect(isValidBrowserUrl("http://localhost:3000")).toBe(false);
    expect(isValidBrowserUrl("https://site.local/foo")).toBe(false);
  });

  test("rejects private IPv4 addresses", () => {
    expect(isValidBrowserUrl("http://127.0.0.1")).toBe(false);
    expect(isValidBrowserUrl("http://10.0.0.1")).toBe(false);
    expect(isValidBrowserUrl("http://192.168.1.1")).toBe(false);
    expect(isValidBrowserUrl("http://172.16.0.1")).toBe(false);
    expect(isValidBrowserUrl("http://169.254.169.254")).toBe(false);
  });

  test("rejects private IPv6 addresses", () => {
    expect(isValidBrowserUrl("http://[::1]")).toBe(false);
    expect(isValidBrowserUrl("http://[fc00::1]")).toBe(false);
  });

  test("allows public IP addresses", () => {
    expect(isValidBrowserUrl("http://8.8.8.8")).toBe(true);
    expect(isValidBrowserUrl("http://1.1.1.1")).toBe(true);
  });
});
