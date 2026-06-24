/**
 * test-rest-flow.js
 * Full integration test for the cookie-based, multi-role reimbursement flow.
 * Uses Node's built-in http module — no extra dependencies required.
 * Run with:  node test-rest-flow.js   (while npm run dev is active)
 */

'use strict';

const http = require('http');

const BASE = { hostname: 'localhost', port: 7002 };

// ── ANSI colour helpers ───────────────────────────────────────────
const green  = (s) => `\x1b[32m${s}\x1b[0m`;
const red    = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const bold   = (s) => `\x1b[1m${s}\x1b[0m`;

// ── HTTP helper ───────────────────────────────────────────────────
function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      ...BASE,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie  ? { 'Cookie': cookie } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'];
        const responseCookie = setCookie
          ? setCookie.map((c) => c.split(';')[0]).join('; ')
          : null;
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), cookie: responseCookie });
        } catch {
          resolve({ status: res.statusCode, body: data, cookie: responseCookie });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const post   = (path, body, cookie) => request('POST',   path, body, cookie);
const patch  = (path, body, cookie) => request('PATCH',  path, body, cookie);
const get    = (path, cookie)       => request('GET',    path, null, cookie);
const del    = (path, body, cookie) => request('DELETE', path, body, cookie);

// ── Assertion helper ─────────────────────────────────────────────
let passed = 0, failed = 0;
function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ${green('✅')} ${label}`);
    passed++;
  } else {
    console.log(`  ${red('❌')} ${label}${detail ? `  →  ${red(detail)}` : ''}`);
    failed++;
  }
}

// ── Main test flow ────────────────────────────────────────────────
async function run() {
  console.log(bold(cyan('\n══════════════════════════════════════════════════════')));
  console.log(bold(cyan('   Full REST Flow Integration Test')));
  console.log(bold(cyan('══════════════════════════════════════════════════════\n')));

  // ──────────────────────────────────────────────────────────────
  // PHASE 1: CFO Login
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 1] CFO Login')));
  const cfoLogin = await post('/rest/onboardings/login', {
    email: 'cfo@org.com',
    password: 'CFO#ORG@April2026',
  });
  assert('CFO login returns 200', cfoLogin.status === 200, `got ${cfoLogin.status}`);
  assert('CFO cookie is set',     !!cfoLogin.cookie,       'no cookie in response');
  const cfoCookie = cfoLogin.cookie;

  // ──────────────────────────────────────────────────────────────
  // PHASE 2: Register three users
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 2] Register Charlie, Alice, Bob')));

  const regCharlie = await post('/rest/onboardings/register', {
    name: 'Charlie Employee', email: 'charlie@org.com', password: 'Pass@123',
  });
  assert('Register Charlie (EMP) → 201', regCharlie.status === 201, `got ${regCharlie.status}`);
  const charlieId = regCharlie.body?.user?.id;

  const regAlice = await post('/rest/onboardings/register', {
    name: 'Alice Manager', email: 'alice@org.com', password: 'Pass@123',
  });
  assert('Register Alice (EMP→RM) → 201', regAlice.status === 201, `got ${regAlice.status}`);
  const aliceId = regAlice.body?.user?.id;

  const regBob = await post('/rest/onboardings/register', {
    name: 'Bob Engineer', email: 'bob@org.com', password: 'Pass@123',
  });
  assert('Register Bob (EMP→APE) → 201', regBob.status === 201, `got ${regBob.status}`);
  const bobId = regBob.body?.user?.id;

  console.log(`   Charlie id=${charlieId}  Alice id=${aliceId}  Bob id=${bobId}`);

  // ──────────────────────────────────────────────────────────────
  // PHASE 3: CFO admin actions
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 3] CFO assigns roles & links manager')));

  const promoteAlice = await post('/rest/roles/assign', { userId: aliceId, role: 'RM' }, cfoCookie);
  assert('CFO promotes Alice → RM (200)', promoteAlice.status === 200, `got ${promoteAlice.status}`);

  const promoteBob = await post('/rest/roles/assign', { userId: bobId, role: 'APE' }, cfoCookie);
  assert('CFO promotes Bob → APE (200)', promoteBob.status === 200, `got ${promoteBob.status}`);

  const linkCharlie = await post('/rest/employees/assign',
    { userId: charlieId, managerId: aliceId }, cfoCookie);
  assert('CFO links Charlie → Alice (200)', linkCharlie.status === 200, `got ${linkCharlie.status}`);

  // ──────────────────────────────────────────────────────────────
  // PHASE 4: Charlie submits a claim
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 4] Charlie submits a reimbursement claim')));

  const charlieLogin = await post('/rest/onboardings/login',
    { email: 'charlie@org.com', password: 'Pass@123' });
  assert('Charlie login → 200', charlieLogin.status === 200, `got ${charlieLogin.status}`);
  const charlieCookie = charlieLogin.cookie;

  const submitClaim = await post('/rest/reimbursements',
    { title: 'Client Travel', description: 'Auto fare to client office', amount: 450 },
    charlieCookie);
  assert('Charlie submits claim → 201', submitClaim.status === 201, `got ${submitClaim.status}`);
  const claimId = submitClaim.body?.claim?.id;
  assert('Claim status is PENDING',    submitClaim.body?.claim?.status === 'PENDING');
  assert('approvedByRm is false',      submitClaim.body?.claim?.approvedByRm === false);
  assert('approvedByApe is false',     submitClaim.body?.claim?.approvedByApe === false);
  console.log(`   Claim id=${claimId}`);

  // ──────────────────────────────────────────────────────────────
  // PHASE 5: APE tries to approve before RM — must be blocked
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 5] APE (Bob) tries to approve before RM signs off')));

  const bobLogin = await post('/rest/onboardings/login',
    { email: 'bob@org.com', password: 'Pass@123' });
  assert('Bob login → 200', bobLogin.status === 200, `got ${bobLogin.status}`);
  const bobCookie = bobLogin.cookie;

  const apeTooEarly = await patch('/rest/reimbursements',
    { userId: claimId, status: 'APPROVED' }, bobCookie);
  assert('APE approve before RM → 403 (blocked)', apeTooEarly.status === 403,
    `got ${apeTooEarly.status}: ${JSON.stringify(apeTooEarly.body?.message)}`);

  // ──────────────────────────────────────────────────────────────
  // PHASE 6: Alice (RM) approves → approvedByRm=true, PENDING
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 6] Alice (RM) approves the claim')));

  const aliceLogin = await post('/rest/onboardings/login',
    { email: 'alice@org.com', password: 'Pass@123' });
  assert('Alice login → 200', aliceLogin.status === 200, `got ${aliceLogin.status}`);
  const aliceCookie = aliceLogin.cookie;

  const rmApprove = await patch('/rest/reimbursements',
    { userId: claimId, status: 'APPROVED' }, aliceCookie);
  assert('RM approves → 200',             rmApprove.status === 200, `got ${rmApprove.status}`);
  assert('approvedByRm is now true',      rmApprove.body?.claim?.approvedByRm === true);
  assert('status still PENDING after RM', rmApprove.body?.claim?.status === 'PENDING');

  // ──────────────────────────────────────────────────────────────
  // PHASE 7: Bob (APE) performs final approval → APPROVED
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 7] Bob (APE) performs final approval')));

  const apeApprove = await patch('/rest/reimbursements',
    { userId: claimId, status: 'APPROVED' }, bobCookie);
  assert('APE approves → 200',           apeApprove.status === 200, `got ${apeApprove.status}`);
  assert('status is now APPROVED',       apeApprove.body?.claim?.status === 'APPROVED');
  assert('approvedByApe is now true',    apeApprove.body?.claim?.approvedByApe === true);
  assert('approvedByRm remains true',    apeApprove.body?.claim?.approvedByRm === true);

  // ──────────────────────────────────────────────────────────────
  // PHASE 8: Verify CFO visibility — should see the approved claim
  // ──────────────────────────────────────────────────────────────
  console.log(bold(yellow('\n[PHASE 8] CFO views fully approved claims')));

  const cfoClaims = await get('/rest/reimbursements', cfoCookie);
  assert('CFO GET claims → 200', cfoClaims.status === 200, `got ${cfoClaims.status}`);
  const approvedClaim = cfoClaims.body?.claims?.find((c) => c.id === claimId);
  assert('CFO can see the APPROVED claim', !!approvedClaim);

  // ── Summary ──────────────────────────────────────────────────
  const total = passed + failed;
  console.log(bold(cyan('\n══════════════════════════════════════════════════════')));
  console.log(bold(`  Results: ${green(`${passed} passed`)}  ${failed > 0 ? red(`${failed} failed`) : ''}  / ${total} total`));
  console.log(bold(failed === 0 ? green('  ✅ ALL TESTS PASSED') : red('  ❌ SOME TESTS FAILED')));
  console.log(bold(cyan('══════════════════════════════════════════════════════\n')));
}

run().catch((err) => {
  console.error(red('\n💥 Fatal error:'), err.message);
  console.error(red('Is the server running?  →  npm run dev'));
});
