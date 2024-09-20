import type { ClientConfig } from "../interfaces/client";

export const clientConfig: ClientConfig = {
  homepage: "https://www.example.com",
  github: "https://github.com/example",
  email: "mail@example.com",
  server: {
    baseURL: "http://127.0.0.1:4000",
  },
  metadata: {
    title: "My Timeline",
    description: "What does this guy say?",
  },
};

export default clientConfig;
