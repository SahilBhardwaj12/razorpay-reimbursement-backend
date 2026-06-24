require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const authRouter = require('./routes/auth');
const reimbursementsRouter = require('./routes/reimbursements');
const rolesRouter = require('./routes/roles');
const employeesRouter = require('./routes/employees');

const app = express();
const PORT = 7002;

app.use(express.json());
app.use(cookieParser());

// Routes
app.use('/rest/onboardings', authRouter);
app.use('/rest/reimbursements', reimbursementsRouter);
app.use('/rest/roles', rolesRouter);
app.use('/rest/employees', employeesRouter);

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
