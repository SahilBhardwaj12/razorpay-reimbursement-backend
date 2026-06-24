require('dotenv').config();
const { db, pool } = require('./index');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const path = require('path');

async function runMigrations() {
  console.log('Running migrations...');
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') });
    console.log('Migrations applied successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
