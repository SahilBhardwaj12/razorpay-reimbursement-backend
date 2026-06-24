require('dotenv').config();
const bcrypt = require('bcrypt');
const { db, pool } = require('./index');
const { users } = require('./schema');

async function seed() {
  console.log('Seeding database...');
  try {
    const passwordHash = await bcrypt.hash('cfo123', 10);

    await db.insert(users).values({
      name: 'Root CFO',
      email: 'cfo@org.com',
      passwordHash,
      role: 'CFO',
      managerId: null,
    });

    console.log('Seed complete: Root CFO user inserted successfully.');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
