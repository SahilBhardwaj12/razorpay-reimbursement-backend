const express = require('express');
const { eq, and } = require('drizzle-orm');
const { db } = require('../db/index');
const { reimbursements, users } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require a valid session cookie
router.use(authenticateToken);

// ─────────────────────────────────────────────────────────────────
// POST /rest/reimbursements — Submit a claim (EMP only)
// ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (req.user.role !== 'EMP') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: only employees (EMP) can submit claims.' });
  }

  const { title, description, amount } = req.body;

  if (!title || amount === undefined) {
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
        status: 'PENDING',
        approvedByRm: false,
        approvedByApe: false,
      })
      .returning();

    return res.status(201).json({ status: 'success', claim });
  } catch (error) {
    console.error('Submit claim error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /rest/reimbursements — Multi-tier approval / rejection
// Body: { userId: <claimId>, status: "APPROVED" | "REJECTED" }
// ─────────────────────────────────────────────────────────────────
router.patch('/', async (req, res) => {
  const { role, id: actorId } = req.user;
  const { userId: claimId, status: requestedStatus } = req.body;

  if (role !== 'RM' && role !== 'APE') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: only RM or APE can update claim status.' });
  }
  if (!claimId || !requestedStatus) {
    return res.status(400).json({ status: 'error', message: 'userId (claimId) and status are required.' });
  }
  if (!['APPROVED', 'REJECTED'].includes(requestedStatus)) {
    return res.status(400).json({ status: 'error', message: 'status must be APPROVED or REJECTED.' });
  }

  try {
    // Load claim
    const [claim] = await db.select().from(reimbursements).where(eq(reimbursements.id, claimId)).limit(1);
    if (!claim) {
      return res.status(404).json({ status: 'error', message: 'Claim not found.' });
    }
    if (claim.status === 'APPROVED' || claim.status === 'REJECTED') {
      return res.status(400).json({ status: 'error', message: `Claim is already ${claim.status.toLowerCase()} and cannot be altered.` });
    }

    // Load the employee who submitted the claim
    const [employee] = await db.select().from(users).where(eq(users.id, claim.employeeId)).limit(1);

    // ── RM tier ────────────────────────────────────────────────────
    if (role === 'RM') {
      if (employee.managerId !== actorId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden: this employee does not report to you.' });
      }

      if (requestedStatus === 'REJECTED') {
        const [updated] = await db
          .update(reimbursements)
          .set({ status: 'REJECTED' })
          .where(eq(reimbursements.id, claimId))
          .returning();
        return res.status(200).json({ status: 'success', message: 'Claim rejected by RM.', claim: updated });
      }

      // APPROVED by RM: set flag, keep status PENDING (APE still needs to act)
      const [updated] = await db
        .update(reimbursements)
        .set({ approvedByRm: true })
        .where(eq(reimbursements.id, claimId))
        .returning();
      return res.status(200).json({
        status: 'success',
        message: 'RM approval recorded. Awaiting APE approval.',
        claim: updated,
      });
    }

    // ── APE tier ───────────────────────────────────────────────────
    if (role === 'APE') {
      if (requestedStatus === 'REJECTED') {
        const [updated] = await db
          .update(reimbursements)
          .set({ status: 'REJECTED' })
          .where(eq(reimbursements.id, claimId))
          .returning();
        return res.status(200).json({ status: 'success', message: 'Claim rejected by APE.', claim: updated });
      }

      // APE can only approve after RM has approved
      if (!claim.approvedByRm) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden: claim must be approved by an RM before APE can approve.',
        });
      }

      // Both tiers approved → final status becomes APPROVED
      const [updated] = await db
        .update(reimbursements)
        .set({ approvedByApe: true, status: 'APPROVED' })
        .where(eq(reimbursements.id, claimId))
        .returning();
      return res.status(200).json({
        status: 'success',
        message: 'Claim fully approved (RM + APE). Status set to APPROVED.',
        claim: updated,
      });
    }

  } catch (error) {
    console.error('Update claim status error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /rest/reimbursements — Role-based claim visibility
// ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { id: userId, role } = req.user;

  try {
    let claims;

    if (role === 'EMP') {
      // EMP sees only their own claims
      claims = await db.select().from(reimbursements).where(eq(reimbursements.employeeId, userId));

    } else if (role === 'RM') {
      // RM sees PENDING claims from direct reports (not yet RM-approved)
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

    } else if (role === 'APE') {
      // APE sees claims already approved by RM but still PENDING (awaiting APE)
      claims = await db
        .select()
        .from(reimbursements)
        .where(
          and(
            eq(reimbursements.approvedByRm, true),
            eq(reimbursements.status, 'PENDING')
          )
        );

    } else if (role === 'CFO') {
      // CFO sees claims that APE has approved (fully approved claims)
      claims = await db
        .select()
        .from(reimbursements)
        .where(eq(reimbursements.approvedByApe, true));

    } else {
      claims = [];
    }

    return res.status(200).json({ status: 'success', claims });
  } catch (error) {
    console.error('Fetch claims error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /rest/reimbursements/:userId — View a subordinate EMP's claims
// Accessible only by their direct RM
// ─────────────────────────────────────────────────────────────────
router.get('/:userId', async (req, res) => {
  const { id: actorId, role } = req.user;
  const targetUserId = parseInt(req.params.userId, 10);

  if (role !== 'RM') {
    return res.status(403).json({ status: 'error', message: 'Forbidden: only an RM can view a specific employee\'s claims.' });
  }

  try {
    // Verify target user exists and is an EMP
    const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
    if (!target) {
      return res.status(404).json({ status: 'error', message: 'User not found.' });
    }
    if (target.role !== 'EMP') {
      return res.status(403).json({ status: 'error', message: 'Target user is not an EMP.' });
    }
    if (target.managerId !== actorId) {
      return res.status(403).json({ status: 'error', message: 'Forbidden: this employee does not report to you.' });
    }

    const claims = await db
      .select()
      .from(reimbursements)
      .where(eq(reimbursements.employeeId, targetUserId));

    return res.status(200).json({ status: 'success', claims });
  } catch (error) {
    console.error('Fetch employee claims error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

module.exports = router;
