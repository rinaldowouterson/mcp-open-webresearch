import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import {
  AppConfig,
  ProxyConfig,
  ProxyProtocol,
  ProxyAgent,
} from "../types/app-config.js";

const PROTOCOL_PATTERN = /^(https?|socks5):\/\//i;

export const urlSeemsValid = (url: string): boolean => {
  const emptyUrl = url.trim().length === 0;
  const urlStartsWithProtocol = PROTOCOL_PATTERN.test(url);
  return !emptyUrl && urlStartsWithProtocol;
};

const loadProxyConfig = (): ProxyConfig => {
  const proxyUrl =
    process.env.SOCKS5_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "";

  const isValid = urlSeemsValid(proxyUrl);

  let urlObject: URL;
  let protocol: ProxyProtocol = null;
  let error: string | null =
    process.env.USE_PROXY === "true" && isValid
      ? null
      : process.env.USE_PROXY === "false"
      ? null
      : `Invalid proxy URL or protocol. Expected protocol: ${
          PROTOCOL_PATTERN.source
        } Received: ${proxyUrl === "" ? "empty string" : proxyUrl}`;

  if (process.env.WRITE_DEBUG_TERMINAL === "true") {
    console.debug(`loader: ${error ? `error detected: ${error}` : `no error`}`);
  }

  let host: string | null = null;
  let port: number | null = null;

  let username: string | null = null;
  let password: string | null = null;

  let agent: ProxyAgent | null = null;

  if (isValid) {
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
      if (process.env.WRITE_DEBUG_TERMINAL === "true") {
        console.debug("loader: Failed to create proxy agent: ", caughtError);
      }
      error = error
        ? error + `\n${caughtError};`
        : `Failed to create proxy agent: ${caughtError}`;
    }
  }

  return {
    url: proxyUrl,
    enabled: process.env.USE_PROXY === "true",
    isValid,
    protocol,
    error,
    host,
    port,
    username,
    password,
    agent,
  };
};

export const loadConfig = (): Readonly<AppConfig> => {
  const config: AppConfig = {
    defaultSearchEngines: process.env.DEFAULT_SEARCH_ENGINES
      ? (process.env.DEFAULT_SEARCH_ENGINES.split(",").filter(
          (e): e is AppConfig["defaultSearchEngines"][number] =>
            ["bing", "duckduckgo", "brave"].includes(e)
        ) as AppConfig["defaultSearchEngines"])
      : (["bing", "duckduckgo", "brave"] as AppConfig["defaultSearchEngines"]),
    proxy: loadProxyConfig(),
    enableCors: process.env.ENABLE_CORS === "true",
    corsOrigin: process.env.CORS_ORIGIN || "*",
  };

  return Object.freeze(config);
};
