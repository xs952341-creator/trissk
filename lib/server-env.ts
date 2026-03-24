export function getServerEnvOptional(key: string): string | undefined {
  return process.env[key];
}

export function requireServerEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}
