const express = require('express');
const { eq, and } = require('drizzle-orm');
const { db } = require('../db/index');
const { reimbursements, users } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Protect all routes in this file
router.use(authenticateToken);

// ─────────────────────────────────────────────
// POST /api/reimbursements — Submit a new claim
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, amount } = req.body;

  if (!title || !amount) {
    return res.status(400).json({ status: 'error', message: 'title and amount are required.' });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ status: 'error', message: 'amount must be a positive number.' });
  }

  try {
    const [claim] = await db
      .insert(reimbursements)
      .values({
        employeeId: req.user.id,
        title,
        description: description || null,
        amount,
        // status, approvedByRm, approvedByApe all default in schema
      })
      .returning();

    return res.status(201).json({ status: 'success', claim });
  } catch (error) {
    console.error('Submit claim error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/reimbursements — View claims (role-based)
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { id: userId, role } = req.user;

  try {
    let claims;

    if (role === 'CFO') {
      // CFO sees every claim across the org
      claims = await db.select().from(reimbursements);

    } else if (role === 'RM') {
      // RM sees all PENDING claims submitted by employees who report to them.
      // Join reimbursements → users on employeeId = users.id,
      // filter where users.managerId = RM's own id AND status = PENDING.
      const rows = await db
        .select({ claim: reimbursements })
        .from(reimbursements)
        .innerJoin(users, eq(reimbursements.employeeId, users.id))
        .where(
          and(
            eq(users.managerId, userId),
            eq(reimbursements.status, 'PENDING')
          )
        );

      claims = rows.map((r) => r.claim);

    } else {
      // EMP and APE see only their own claims
      claims = await db
        .select()
        .from(reimbursements)
        .where(eq(reimbursements.employeeId, userId));
    }

    return res.status(200).json({ status: 'success', claims });
  } catch (error) {
    console.error('Fetch claims error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;
