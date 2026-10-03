import "dotenv/config";

import { parseEnv } from "./envSchema.js";

export const env = parseEnv(process.env);
