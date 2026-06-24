const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const { db } = require('../db/index');
const { users } = require('../db/schema');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// ─────────────────────────────────────────────────────────
// POST /rest/onboardings/register
// ─────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ status: 'error', message: 'name, email, and password are required.' });
  }

  if (!email.endsWith('@org.com')) {
    return res.status(400).json({ status: 'error', message: 'Email must belong to the @org.com domain.' });
  }

  try {
    // Check for duplicate email
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
        role: 'EMP',   // all self-registered users are EMP
        managerId: null,
      })
      .returning();

    return res.status(201).json({
      status: 'success',
      message: 'Account created successfully.',
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────
// POST /rest/onboardings/login
// ─────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ status: 'error', message: 'email and password are required.' });
  }

  if (!email.endsWith('@org.com')) {
    return res.status(400).json({ status: 'error', message: 'Email must belong to the @org.com domain.' });
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Deliver token as HTTP-only cookie
    res.cookie('token', token, { httpOnly: true, secure: false });

    return res.status(200).json({ status: 'success', message: 'Logged in successfully' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error.' });
  }
});

// ─────────────────────────────────────────────────────────
// POST /rest/onboardings/logout
// ─────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

module.exports = router;
