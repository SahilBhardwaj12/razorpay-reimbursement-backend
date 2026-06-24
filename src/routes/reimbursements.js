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

// ─────────────────────────────────────────────────────────────────
// PATCH /api/reimbursements/:id/approve — Multi-level approval
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/approve', async (req, res) => {
  const { id: approverId, role } = req.user;
  const claimId = parseInt(req.params.id, 10);

  // Only RM and CFO may call this endpoint
  if (role !== 'RM' && role !== 'CFO') {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: only RM or CFO can approve claims.',
    });
  }

  try {
    // ── 1. Load the claim ──────────────────────────────────────────
    const [claim] = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.id, claimId))
      .limit(1);

    if (!claim) {
      return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    }

    // Prevent re-approving an already finalised claim
    if (claim.status === 'APPROVED' || claim.status === 'REJECTED') {
      return res.status(400).json({
        status: 'error',
        message: `Claim is already ${claim.status.toLowerCase()}.`,
      });
    }

    // ── 2. Load the employee who submitted the claim ───────────────
    const [employee] = await db
      .select()
      .from(users)
      .where(eq(users.id, claim.employeeId))
      .limit(1);

    // ── 3. RM approval ─────────────────────────────────────────────
    if (role === 'RM') {
      // Verify the employee actually reports to this RM
      if (employee.managerId !== approverId) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden: this employee does not report to you.',
        });
      }

      // Mark RM approval; status stays PENDING until CFO signs off
      const [updated] = await db
        .update(reimbursements)
        .set({ approvedByRm: true })
        .where(eq(reimbursements.id, claimId))
        .returning();

      return res.status(200).json({
        status: 'success',
        message: 'RM approval recorded. Awaiting CFO final approval.',
        claim: updated,
      });
    }

    // ── 4. CFO approval ────────────────────────────────────────────
    if (role === 'CFO') {
      // EMP claims require prior RM sign-off
      if (employee.role === 'EMP' && !claim.approvedByRm) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden: EMP claim must be approved by the RM before CFO can finalise.',
        });
      }

      // APE claims can be approved directly by CFO (no RM required)
      const [updated] = await db
        .update(reimbursements)
        .set({
          status: 'APPROVED',
          // also stamp approvedByApe if submitter is APE, for audit clarity
          ...(employee.role === 'APE' ? { approvedByApe: true } : {}),
        })
        .where(eq(reimbursements.id, claimId))
        .returning();

      return res.status(200).json({
        status: 'success',
        message: 'Claim fully approved by CFO.',
        claim: updated,
      });
    }

  } catch (error) {
    console.error('Approve claim error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/reimbursements/:id/reject — Role-based rejection
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/reject', async (req, res) => {
  const { id: rejectorId, role } = req.user;
  const claimId = parseInt(req.params.id, 10);

  // Only RM and CFO may reject
  if (role !== 'RM' && role !== 'CFO') {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: only RM or CFO can reject claims.',
    });
  }

  try {
    // ── 1. Load the claim ──────────────────────────────────────────
    const [claim] = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.id, claimId))
      .limit(1);

    if (!claim) {
      return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    }

    // ── 2. Lock check — cannot alter a finalised claim ─────────────
    if (claim.status === 'APPROVED' || claim.status === 'REJECTED') {
      return res.status(400).json({
        status: 'error',
        message: `Claim is already ${claim.status.toLowerCase()} and cannot be altered.`,
      });
    }

    // ── 3. RM scope check ──────────────────────────────────────────
    if (role === 'RM') {
      const [employee] = await db
        .select()
        .from(users)
        .where(eq(users.id, claim.employeeId))
        .limit(1);

      if (employee.managerId !== rejectorId) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden: this employee does not report to you.',
        });
      }
    }

    // ── 4. Reject the claim (RM scoped above; CFO unrestricted) ────
    const [updated] = await db
      .update(reimbursements)
      .set({ status: 'REJECTED' })
      .where(eq(reimbursements.id, claimId))
      .returning();

    return res.status(200).json({
      status: 'success',
      message: 'Claim has been rejected.',
      claim: updated,
    });

  } catch (error) {
    console.error('Reject claim error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;

