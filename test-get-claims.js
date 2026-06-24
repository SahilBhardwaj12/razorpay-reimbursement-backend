// test-get-claims.js
// Tests role-based GET /api/reimbursements for Charlie (EMP), Alice (RM), Bob (APE)
// Run with: node test-get-claims.js  (while npm run dev is running)

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

async function login(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = await request(
    {
      hostname: 'localhost',
      port: 7002,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    payload
  );
  if (res.status !== 200 || !res.body.token) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

async function getClaims(token) {
  return request({
    hostname: 'localhost',
    port: 7002,
    path: '/api/reimbursements',
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

function printResult(label, role, expected, res) {
  const claims = res.body.claims || [];
  const passed = res.status === 200;

  console.log(`\n${'─'.repeat(55)}`);
  console.log(`  ${label}  (${role})`);
  console.log(`${'─'.repeat(55)}`);
  console.log(`  HTTP Status  : ${res.status} ${passed ? '✅' : '❌'}`);
  console.log(`  Claims count : ${claims.length}  (expected: ${expected})`);

  if (claims.length > 0) {
    claims.forEach((c, i) => {
      console.log(`\n  Claim #${i + 1}:`);
      console.log(`    id          : ${c.id}`);
      console.log(`    title       : ${c.title}`);
      console.log(`    amount      : ₹${c.amount}`);
      console.log(`    status      : ${c.status}`);
      console.log(`    employeeId  : ${c.employeeId}`);
    });
  } else {
    console.log('  Claims       : []');
  }

  const countOk = claims.length === expected;
  console.log(`\n  Result: ${countOk ? '✅ PASS' : '❌ FAIL — unexpected claim count'}`);
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('   Role-Based GET /api/reimbursements — Security Test');
  console.log('══════════════════════════════════════════════════════');

  try {
    // ── Test 1: Employee Charlie (EMP) — sees only his own claim ──
    console.log('\n[1/3] Logging in as Employee Charlie (emp@org.com)...');
    const charlie = await login('emp@org.com', 'password123');
    const charlieRes = await getClaims(charlie.token);
    printResult('Employee Charlie', 'EMP', 1, charlieRes);

    // ── Test 2: Manager Alice (RM) — sees Charlie's PENDING claim ──
    console.log('\n[2/3] Logging in as Manager Alice (manager@org.com)...');
    const alice = await login('manager@org.com', 'password123');
    const aliceRes = await getClaims(alice.token);
    printResult('Manager Alice', 'RM', 1, aliceRes);

    // ── Test 3: Engineer Bob (APE) — sees empty list ──
    console.log('\n[3/3] Logging in as Engineer Bob (engineer@org.com)...');
    const bob = await login('engineer@org.com', 'password123');
    const bobRes = await getClaims(bob.token);
    printResult('Engineer Bob', 'APE', 0, bobRes);

    // ── Summary ──
    const results = [
      (charlieRes.body.claims || []).length === 1,
      (aliceRes.body.claims || []).length === 1,
      (bobRes.body.claims || []).length === 0,
    ];
    const allPassed = results.every(Boolean);

    console.log(`\n${'═'.repeat(55)}`);
    console.log(`  Final Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    console.log(`${'═'.repeat(55)}\n`);

  } catch (err) {
    console.error('\n❌ Test error:', err.message);
    console.error('Is the server running?  →  npm run dev');
  }
}

run();
