import { z } from "zod";

import { configValidationError, readConfigSection } from "../config.mts";

const clientConfigSchema = z.strictObject({
  apiBaseURL: z.string().optional(),
  homepage: z.string().optional(),
  github: z.string().optional(),
  email: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export function readClientConfig() {
  const result = clientConfigSchema.safeParse(readConfigSection("client"));
  if (!result.success) {
    throw configValidationError("client", result.error.issues);
  }
  return result.data;
}
