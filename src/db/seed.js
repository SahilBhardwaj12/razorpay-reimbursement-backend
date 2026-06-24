require('dotenv').config();
const bcrypt = require('bcrypt');
const { eq } = require('drizzle-orm');
const { db, pool } = require('./index');
const { users } = require('./schema');

/**
 * Upsert a user by email: inserts if not present, skips if already exists.
 * Returns the existing or newly created user row.
 */
async function upsertUser(data) {
  // Check if user already exists
  const [existing] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existing) {
    console.log(`  ↳ Skipped (already exists): ${data.email}`);
    return existing;
  }

  const [created] = await db.insert(users).values(data).returning();
  console.log(`  ↳ Inserted: ${data.email} (id=${created.id})`);
  return created;
}

async function seed() {
  console.log('\nSeeding database...\n');
  try {
    const cfoHash      = await bcrypt.hash('cfo123',      10);
    const defaultHash  = await bcrypt.hash('password123', 10);

    // 1. CFO — root account (no manager)
    console.log('1. Seeding CFO...');
    await upsertUser({
      name: 'Root CFO',
      email: 'cfo@org.com',
      passwordHash: cfoHash,
      role: 'CFO',
      managerId: null,
    });

    // 2. Regional Manager (RM) — no manager
    console.log('2. Seeding Regional Manager...');
    const rm = await upsertUser({
      name: 'Manager Alice',
      email: 'manager@org.com',
      passwordHash: defaultHash,
      role: 'RM',
      managerId: null,
    });

    // 3. Associate Project Engineer (APE) — no manager
    console.log('3. Seeding Associate Project Engineer...');
    await upsertUser({
      name: 'Engineer Bob',
      email: 'engineer@org.com',
      passwordHash: defaultHash,
      role: 'APE',
      managerId: null,
    });

    // 4. Employee (EMP) — reports to Manager Alice
    console.log('4. Seeding Employee...');
    await upsertUser({
      name: 'Employee Charlie',
      email: 'emp@org.com',
      passwordHash: defaultHash,
      role: 'EMP',
      managerId: rm.id,
    });

    console.log('\nAll users seeded successfully.');
  } catch (error) {
    console.error('\nSeeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
