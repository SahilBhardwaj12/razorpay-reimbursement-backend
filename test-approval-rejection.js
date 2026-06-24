// test-approval-rejection.js
// Full end-to-end test: submit → RM approve → CFO approve → reject a second claim
// Run with: node test-approval-rejection.js  (while npm run dev is running)

const http = require('http');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function post(path, body, token) {
  const payload = JSON.stringify(body);
  return request({
    hostname: 'localhost', port: 7002, path, method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }, payload);
}

function patch(path, token) {
  return request({
    hostname: 'localhost', port: 7002, path, method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function login(email, password) {
  const res = await post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}`);
  console.log(`   ✅ Logged in as ${res.body.user.name} (${res.body.user.role})`);
  return res.body.token;
}

function check(label, res, expectedStatus, expectedField) {
  const ok = res.status === expectedStatus;
  console.log(`\n   ${ok ? '✅' : '❌'} ${label}`);
  console.log(`      HTTP   : ${res.status} (expected ${expectedStatus})`);
  if (expectedField) {
    console.log(`      ${expectedField} : ${JSON.stringify(res.body.claim?.[expectedField] ?? res.body.message)}`);
  }
  if (!ok) console.log(`      Body   : ${JSON.stringify(res.body)}`);
  return ok;
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   Approve & Reject — Full Flow Test');
  console.log('══════════════════════════════════════════════════════\n');

  // ── Login all users ───────────────────────────────────────────────
  console.log('── Logging in all users ──');
  const charlieToken = await login('emp@org.com',     'password123');
  const aliceToken   = await login('manager@org.com', 'password123');
  const cfoToken     = await login('cfo@org.com',     'cfo123');
  const bobToken     = await login('engineer@org.com','password123');

  // ── Submit two claims as Charlie ──────────────────────────────────
  console.log('\n── Submitting two claims as Employee Charlie ──');
  const c1 = await post('/api/reimbursements', {
    title: 'Train Ticket', description: 'Mumbai to Pune client visit', amount: 800,
  }, charlieToken);
  const claimA = c1.body.claim;
  console.log(`   ✅ Claim A submitted (id=${claimA.id}, status=${claimA.status})`);

  const c2 = await post('/api/reimbursements', {
    title: 'Team Lunch', description: 'Quarterly team lunch', amount: 3200,
  }, charlieToken);
  const claimB = c2.body.claim;
  console.log(`   ✅ Claim B submitted (id=${claimB.id}, status=${claimB.status})`);

  // ── SCENARIO 1: Full approval chain on Claim A ────────────────────
  console.log('\n── SCENARIO 1: Full Approval Chain (Claim A) ──');

  // EMP tries to approve → 403
  const empApprove = await patch(`/api/reimbursements/${claimA.id}/approve`, charlieToken);
  check('EMP cannot approve (must be 403)', empApprove, 403, 'message');

  // CFO tries to approve EMP claim before RM → 403
  const cfoEarly = await patch(`/api/reimbursements/${claimA.id}/approve`, cfoToken);
  check('CFO blocked before RM approves (must be 403)', cfoEarly, 403, 'message');

  // Alice (RM) approves → approvedByRm=true, status=PENDING
  const rmApprove = await patch(`/api/reimbursements/${claimA.id}/approve`, aliceToken);
  check('RM approves claim A (must be 200, approvedByRm=true)', rmApprove, 200, 'approvedByRm');

  // CFO final approval → status=APPROVED
  const cfoApprove = await patch(`/api/reimbursements/${claimA.id}/approve`, cfoToken);
  check('CFO fully approves claim A (must be 200, status=APPROVED)', cfoApprove, 200, 'status');

  // Try to approve again (already APPROVED) → 400
  const duplicate = await patch(`/api/reimbursements/${claimA.id}/approve`, cfoToken);
  check('Cannot re-approve a finalised claim (must be 400)', duplicate, 400, 'message');

  // ── SCENARIO 2: Direct rejection on Claim B ───────────────────────
  console.log('\n── SCENARIO 2: Rejection Flow (Claim B) ──');

  // Bob (APE) tries to reject → 403
  const bobReject = await patch(`/api/reimbursements/${claimB.id}/reject`, bobToken);
  check('APE cannot reject (must be 403)', bobReject, 403, 'message');

  // Alice rejects Claim B → status=REJECTED immediately
  const rmReject = await patch(`/api/reimbursements/${claimB.id}/reject`, aliceToken);
  check('RM rejects claim B (must be 200, status=REJECTED)', rmReject, 200, 'status');

  // Try to approve a rejected claim → 400
  const approveRejected = await patch(`/api/reimbursements/${claimB.id}/approve`, cfoToken);
  check('Cannot approve an already-rejected claim (must be 400)', approveRejected, 400, 'message');

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   All scenarios tested. Check ✅/❌ above for results.');
  console.log('══════════════════════════════════════════════════════\n');
}

run().catch((err) => {
  console.error('\n❌ Fatal error:', err.message);
  console.error('Is the server running?  →  npm run dev');
});
