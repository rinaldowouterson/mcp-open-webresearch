import {
  DeepSearchConfig,
  SecurityConfig,
  BrowserConfig,
  LlmConfig,
} from "./app-config.js";

export interface ConfigOverrides {
  debug?: boolean;
  debugFile?: boolean;
  logPath?: string;
  cors?: boolean;
  corsOrigin?: string;
  proxyUrl?: string;
  engines?: string[];
  publicUrl?: string;
  port?: number;
  sampling?: boolean;
  skipCooldown?: boolean;
  deepSearch?: Partial<DeepSearchConfig>;
  security?: Partial<SecurityConfig>;
  browser?: Partial<BrowserConfig>;
  llm?: Partial<LlmConfig>;
  ssl?: {
    ignoreTlsErrors?: boolean;
  };
}
