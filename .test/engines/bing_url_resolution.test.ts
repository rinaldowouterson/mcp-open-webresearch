import { describe, it, expect } from "vitest";
import { resolveRedirect } from "../../src/engines/search/bing/bing.js";

describe("Bing URL Resolution", () => {
  it("should decode a Wikipedia redirect URL", () => {
    const input =
      "https://www.bing.com/ck/a?!&&p=4c109fcb6ef0e4a08bda16317afee5dc1eb45066ee2048d3d12665d2a08bb89cJmltdHM9MTc2NzEzOTIwMA&ptn=3&ver=2&hsh=4&fclid=1abccba1-14df-649a-0e2f-dd72156b65e3&u=a1aHR0cHM6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvU2hhd2FybWE&ntb=1";
    const expected = "https://en.wikipedia.org/wiki/Shawarma";
    expect(resolveRedirect(input)).toBe(expected);
  });

  it("should decode a blog redirect URL", () => {
    const input =
      "https://www.bing.com/ck/a?!&&p=3c87756730cbbce8719ebc9e21f425aa8219bd101da1e61ddb0dacfa14771fb6JmltdHM9MTc2NzEzOTIwMA&ptn=3&ver=2&hsh=4&fclid=1abccba1-14df-649a-0e2f-dd72156b65e3&u=a1aHR0cHM6Ly9ibG9nLmNvb2twYWQuY29tL3VzL3NoYXdhcm1hLXRoZS1taWRkbGUtZWFzdGVybi1jbGFzc2ljLw&ntb=1";
    const expected =
      "https://blog.cookpad.com/us/shawarma-the-middle-eastern-classic/";
    expect(resolveRedirect(input)).toBe(expected);
  });

  it("should return the original URL if it's not a /ck/a redirect", () => {
    const input = "https://example.com/direct-link";
    expect(resolveRedirect(input)).toBe(input);
  });

  it("should return null if input is undefined", () => {
    expect(resolveRedirect(undefined)).toBe(null);
  });

  it("should return the original URL if decoding fails (missing u param)", () => {
    const input = "https://www.bing.com/ck/a?something=else";
    expect(resolveRedirect(input)).toBe(input);
  });

  it("should return the original URL if u param is too short", () => {
    const input = "https://www.bing.com/ck/a?u=a";
    expect(resolveRedirect(input)).toBe(input);
  });
});
