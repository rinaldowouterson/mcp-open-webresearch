import type { HttpsProxyAgent } from "https-proxy-agent";
import type { SocksProxyAgent } from "socks-proxy-agent";

export type ProxyProtocol =
  | "http"
  | "https"
  | "socks5"
  | null;

export type ProxyAgent = {
  http: HttpsProxyAgent<string> | SocksProxyAgent;
  https: HttpsProxyAgent<string> | SocksProxyAgent;
} | null;

export interface ProxyConfig {
  url: string | null;
  enabled: boolean;
  isValid: boolean;
  protocol: ProxyProtocol;
  error: string | null;
  host: string | null;
  port: number | null;
  username?: string | null;
  password?: string | null;
  agent?: ProxyAgent;
}

export interface AppConfig {
  // Search engine configuration (array of engines to use by default)
  defaultSearchEngines: ("bing" | "duckduckgo" | "brave")[];
  // Proxy configuration
  proxy: ProxyConfig;
  // CORS configuration
  enableCors: boolean;
  corsOrigin: string;
}
