require('dotenv').config();
const express = require('express');
const authRouter = require('./routes/auth');
const reimbursementsRouter = require('./routes/reimbursements');

const app = express();
const PORT = 7002;

app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/reimbursements', reimbursementsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is up and running',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Server is listening on http://localhost:${PORT}`);
});

module.exports = app;
