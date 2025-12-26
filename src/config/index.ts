import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  AppConfig,
  ProxyConfig,
  ProxyProtocol,
  ProxyAgent,
} from "../types/index.js";
import { ConfigOverrides } from "../types/index.js";

const supportedProtocolPatterns = /^(https?|socks5):\/\//i;

export const validProtocolPattern = (url: string): boolean => {
  const emptyUrl = url.trim().length === 0;
  const urlStartsWithProtocol = supportedProtocolPatterns.test(url);
  return !emptyUrl && urlStartsWithProtocol;
};

const loadProxyConfig = (overrides?: ConfigOverrides): ProxyConfig => {
  // If proxyUrl is provided via CLI, use it. Otherwise fall back to Env Vars.
  let proxyUrl = overrides?.proxyUrl;
  let enableProxy = !!proxyUrl;

  if (!proxyUrl) {
    // Fallback to Env Vars
    proxyUrl =
      process.env.SOCKS5_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.HTTP_PROXY ||
      "";
    enableProxy = process.env.ENABLE_PROXY === "true";
  }

  const isValidProtocol = validProtocolPattern(proxyUrl);

  let urlObject: URL;
  let protocol: ProxyProtocol = null;
  
  // Logic: 
  // 1. If overrides.proxyUrl is set, we assume the user WANTS to use proxy (enabled=true).
  // 2. If no override, we check process.env.ENABLE_PROXY.
  
  // Error handling
  let error: string | null = null;
  
  if (enableProxy && !isValidProtocol) {
    error = `Invalid proxy URL or protocol. Expected protocol: ${
      supportedProtocolPatterns.source
    } Received: ${proxyUrl === "" ? "empty string" : proxyUrl}`;
    console.debug(`loader: ${error ? `error detected: ${error}` : `no error`}`);
  }

  let host: string | null = null;
  let port: number | null = null;

  let username: string | null = null;
  let password: string | null = null;

  let agent: ProxyAgent | null = null;

  if (isValidProtocol) {
    try {
      urlObject = new URL(proxyUrl);
      protocol = urlObject.protocol.replace(":", "") as ProxyProtocol;
      host = urlObject.hostname;
      port = urlObject.port ? parseInt(urlObject.port, 10) : null;
      username = urlObject.username;
      password = urlObject.password;

      if (protocol && protocol.includes("socks")) {
        agent = {
          http: new SocksProxyAgent(urlObject),
          https: new SocksProxyAgent(urlObject),
        };
      } else {
        agent = {
          http: new HttpsProxyAgent(urlObject),
          https: new HttpsProxyAgent(urlObject),
        };
      }
    } catch (caughtError) {
        console.debug("loader: Failed to create proxy agent: ", caughtError);
      error = error
        ? error + `\n${caughtError};`
        : `Failed to create proxy agent: ${caughtError}`;
    }
  }

  return {
    url: proxyUrl,
    enabled: enableProxy,
    isValid: isValidProtocol,
    protocol,
    error,
    host,
    port,
    username,
    password,
    agent,
  };
};

export const loadConfig = (overrides?: ConfigOverrides): Readonly<AppConfig> => {
  const defaultSearchEnginesRaw = overrides?.engines || (process.env.DEFAULT_SEARCH_ENGINES ? process.env.DEFAULT_SEARCH_ENGINES.split(",") : ["bing", "duckduckgo", "brave"]);
  
  const defaultSearchEngines = defaultSearchEnginesRaw.filter(
          (e): e is AppConfig["defaultSearchEngines"][number] =>
            ["bing", "duckduckgo", "brave"].includes(e)
        ) as AppConfig["defaultSearchEngines"];

  const enableCors = overrides?.cors ?? process.env.ENABLE_CORS === "true";

  const config: AppConfig = {
    defaultSearchEngines,
    proxy: loadProxyConfig(overrides),
    enableCors,
    corsOrigin: process.env.CORS_ORIGIN || "*",
  };

  return Object.freeze(config);
};
