import { migrate } from '../src/lib/migrate.js';

const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

try {
  const n = await migrate(connectionString, console.log);
  console.log(n ? `done (${n} applied)` : 'up to date');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
