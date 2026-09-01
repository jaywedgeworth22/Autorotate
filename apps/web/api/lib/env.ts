import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  // AR-01: the console has no other credential. A production deploy without
  // it would boot an unauthenticated secrets manager, so refuse to start.
  adminToken: required("AUTOROTATE_ADMIN_TOKEN"),
  // AR-04: without it, stored connector admin credentials fall back to a
  // passphrase published in this repository.
  encryptionKey: required("AUTOROTATE_ENC_KEY"),
};
