import { DeepSearchConfig, SecurityConfig } from "./app-config.js";

export interface ConfigOverrides {
  debug?: boolean;
  debugFile?: boolean;
  cors?: boolean;
  proxyUrl?: string;
  engines?: string[];
  publicUrl?: string;
  port?: number;
  sampling?: boolean;
  deepSearch?: Partial<DeepSearchConfig>;
  security?: Partial<SecurityConfig>;
}
