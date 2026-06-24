require('dotenv').config();
const bcrypt = require('bcrypt');
const { db, pool } = require('./index');
const { users, reimbursements } = require('./schema');

async function seed() {
  console.log('\nSeeding database...\n');
  try {
    // ── 1. Clear tables (reimbursements first due to FK constraint) ──
    console.log('1. Clearing reimbursements table...');
    await db.delete(reimbursements);
    console.log('   ✅ reimbursements cleared.');

    console.log('2. Clearing users table...');
    await db.delete(users);
    console.log('   ✅ users cleared.');

    // ── 2. Seed root CFO ─────────────────────────────────────────────
    console.log('3. Inserting root CFO account...');
    const passwordHash = await bcrypt.hash('CFO#ORG@April2026', 10);

    const [cfo] = await db
      .insert(users)
      .values({
        name: 'Root CFO',
        email: 'cfo@org.com',
        passwordHash,
        role: 'CFO',
        managerId: null,
      })
      .returning();

    console.log(`   ✅ CFO inserted (id=${cfo.id}, email=${cfo.email})`);
    console.log('\nSeed complete.');
  } catch (error) {
    console.error('\nSeeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
