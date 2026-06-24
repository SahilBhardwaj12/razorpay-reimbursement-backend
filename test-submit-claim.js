// test-submit-claim.js
// Tests: login as Charlie (EMP) → submit a reimbursement claim
// Run with: node test-submit-claim.js  (while npm run dev is running)

const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  // ── Step 1: Login as Employee Charlie ────────────────────────────────────
  console.log('\n── Step 1: Logging in as emp@org.com ──');
  const loginPayload = JSON.stringify({ email: 'emp@org.com', password: 'password123' });

  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 7002,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginPayload),
      },
    },
    loginPayload
  );

  console.log('Status :', loginRes.status);
  if (loginRes.status !== 200 || !loginRes.body.token) {
    console.error('❌ Login failed:', JSON.stringify(loginRes.body, null, 2));
    process.exit(1);
  }

  const token = loginRes.body.token;
  console.log('✅ JWT obtained for:', loginRes.body.user.name, `(${loginRes.body.user.role})`);

  // ── Step 2: Submit the reimbursement claim ────────────────────────────────
  console.log('\n── Step 2: Submitting reimbursement claim ──');
  const claimPayload = JSON.stringify({
    title: 'Client Site Travel',
    description: 'Auto-rickshaw fare for visiting the Gurgaon client office.',
    amount: 450,
  });

  const claimRes = await request(
    {
      hostname: 'localhost',
      port: 7002,
      path: '/api/reimbursements',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(claimPayload),
        'Authorization': `Bearer ${token}`,
      },
    },
    claimPayload
  );

  console.log('Status :', claimRes.status);
  console.log('Body   :', JSON.stringify(claimRes.body, null, 2));

  if (claimRes.status === 201) {
    console.log('\n✅ Claim submitted successfully!');
    console.log(`   Claim ID : ${claimRes.body.claim.id}`);
    console.log(`   Title    : ${claimRes.body.claim.title}`);
    console.log(`   Amount   : ₹${claimRes.body.claim.amount}`);
    console.log(`   Status   : ${claimRes.body.claim.status}`);
  } else {
    console.error('\n❌ Claim submission failed.');
  }
}

run().catch((err) => {
  console.error('Request error:', err.message);
  console.error('Is the server running?  →  npm run dev');
});
