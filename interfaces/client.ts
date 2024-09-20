export interface ClientConfig {
  homepage?: string;
  github?: string;
  email?: string;
  metadata?: import("next").Metadata;
  server?: import("axios").CreateAxiosDefaults;
}
