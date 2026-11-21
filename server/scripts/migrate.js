import fs from 'node:fs';
import { migrate } from '../src/lib/migrate.js';

if (fs.existsSync('.env')) {
  process.loadEnvFile?.('.env');
}

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Error: Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set.');
  process.exit(1);
}

if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
  console.error(`Error: Invalid database connection string. Expected URL starting with postgresql://, but received: "${connectionString}"`);
  console.error('Please check the DATABASE_URL and DATABASE_URL_UNPOOLED environment variables in your Render dashboard.');
  process.exit(1);
}

try {
  const n = await migrate(connectionString, console.log);
  console.log(n ? `done (${n} applied)` : 'up to date');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
