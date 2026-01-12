export interface ConfigOverrides {
  debug?: boolean;
  debugFile?: boolean;
  cors?: boolean;
  proxyUrl?: string;
  engines?: string[];
  publicUrl?: string;
  port?: number;
  sampling?: boolean;
}
