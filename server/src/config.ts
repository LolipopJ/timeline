import { configValidationError, readConfigSection } from "../../config.mts";
import { serverConfigSchema } from "./types/config";

const result = serverConfigSchema.safeParse(readConfigSection("server"));
if (!result.success) {
  throw configValidationError("server", result.error.issues);
}

export default result.data;
