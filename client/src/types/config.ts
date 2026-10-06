export interface ClientConfig {
  homepage?: string;
  github?: string;
  email?: string;
  metadata?: import("next").Metadata & { [key: string]: string };
  server?: import("axios").CreateAxiosDefaults;
}
