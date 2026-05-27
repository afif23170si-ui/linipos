import { loadEnvFile } from 'node:process';

try {
  loadEnvFile();
} catch (err) {
  // Silent catch: .env may not exist in production or be loaded by PM2/Docker
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  db: {
    host: requireEnv('DB_HOST'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  },
  jwtSecret: requireEnv('JWT_SECRET'),
  corsOrigin: process.env.CORS_ORIGIN || 'https://kasir.afiframadhan.my.id',
};
