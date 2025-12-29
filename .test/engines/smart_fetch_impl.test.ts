import { test, expect } from "vitest";
import { smartFetch } from "../../src/engines/fetch/client.js";

test("smartFetch (standard mode) can fetch from DuckDuckGo", async () => {
    const url = "https://duckduckgo.com/?q=test&t=h_&ia=web";
    // browserMode: false -> standard/native fetch behavior
    const html = await smartFetch(url, { browserMode: false });
    expect(html).toBeDefined();
    expect( typeof html).toBe("string");
    // Simple check to ensure we got something back
    expect(html.length).toBeGreaterThan(100);
}, 20000);

test("smartFetch (browser mode) can fetch from Bing", async () => {
    const url = "https://www.bing.com/";
    // browserMode: true -> impersonated (impit)
    const html = await smartFetch(url, { browserMode: true });
    expect(html).toBeDefined();
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
}, 20000);
