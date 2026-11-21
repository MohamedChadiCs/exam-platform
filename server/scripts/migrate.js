import { migrate } from '../src/lib/migrate.js';

try {
  const n = await migrate(process.env.DATABASE_URL, console.log);
  console.log(n ? `done (${n} applied)` : 'up to date');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
