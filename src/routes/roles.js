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
    return res.status(403).json({ status: 'error', message: 'Forbidden: only the CFO can assign roles.' });
  }
  next();
});

// ─────────────────────────────────────────────────────────────────
// POST /rest/roles/assign — Update a user's role
// ─────────────────────────────────────────────────────────────────
router.post('/assign', async (req, res) => {
  const { userId, role } = req.body;

  if (!userId || !role) {
    return res.status(400).json({ status: 'error', message: 'userId and role are required.' });
  }

  const validRoles = ['EMP', 'RM', 'APE', 'CFO'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      status: 'error',
      message: `Invalid role. Must be one of: ${validRoles.join(', ')}.`,
    });
  }

  try {
    const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!target) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
    }

    const [updated] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, userId))
      .returning();

    return res.status(200).json({
      status: 'success',
      message: `Role updated to '${role}' for user ${updated.email}.`,
      user: { id: updated.id, email: updated.email, role: updated.role },
    });
  } catch (error) {
    console.error('Assign role error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;
