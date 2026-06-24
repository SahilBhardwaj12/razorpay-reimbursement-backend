const express = require('express');
const { eq } = require('drizzle-orm');
const { db } = require('../db/index');
const { users } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication + CFO role
router.use(authenticateToken);

router.use((req, res, next) => {
  if (req.user.role !== 'CFO') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: only the CFO can manage employee assignments.' });
  }
  next();
});

// ─────────────────────────────────────────────────────────────────
// POST /rest/employees/assign — Link employee to a manager
// ─────────────────────────────────────────────────────────────────
router.post('/assign', async (req, res) => {
  const { userId, managerId } = req.body;

  if (!userId || !managerId) {
    return res.status(400).json({ status: 'error', message: 'userId and managerId are required.' });
  }

  try {
    // Verify the employee exists
    const [employee] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!employee) {
      return res.status(404).json({ status: 'error', message: 'Employee not found.' });
    }

    // Verify the manager exists
    const [manager] = await db.select().from(users).where(eq(users.id, managerId)).limit(1);
    if (!manager) {
      return res.status(404).json({ status: 'error', message: 'Manager not found.' });
    }

    const [updated] = await db
      .update(users)
      .set({ managerId })
      .where(eq(users.id, userId))
      .returning();

    return res.status(200).json({
      status: 'success',
      message: `Employee ${updated.email} has been assigned to manager ${manager.email}.`,
      user: { id: updated.id, email: updated.email, role: updated.role, managerId: updated.managerId },
    });
  } catch (error) {
    console.error('Assign employee error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// DELETE /rest/employees/assign — Unlink employee from their manager
// ─────────────────────────────────────────────────────────────────
router.delete('/assign', async (req, res) => {
  const { userId, managerId } = req.body;

  if (!userId || !managerId) {
    return res.status(400).json({ status: 'error', message: 'userId and managerId are required.' });
  }

  try {
    const [employee] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!employee) {
      return res.status(404).json({ status: 'error', message: 'Employee not found.' });
    }

    // Confirm the managerId actually matches before clearing
    if (employee.managerId !== managerId) {
      return res.status(400).json({
        status: 'error',
        message: 'The provided managerId does not match the employee\'s current manager.',
      });
    }

    const [updated] = await db
      .update(users)
      .set({ managerId: null })
      .where(eq(users.id, userId))
      .returning();

    return res.status(200).json({
      status: 'success',
      message: `Employee ${updated.email} has been unlinked from their manager.`,
      user: { id: updated.id, email: updated.email, role: updated.role, managerId: updated.managerId },
    });
  } catch (error) {
    console.error('Unassign employee error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;
