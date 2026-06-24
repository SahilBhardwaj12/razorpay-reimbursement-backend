// Quick smoke-test for POST /api/auth/login
// Run with: node test-login.js  (while npm run dev is running)

const http = require('http');

const payload = JSON.stringify({ email: 'cfo@org.com', password: 'cfo123' });

const options = {
  hostname: 'localhost',
  port: 7002,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('\n--- Login Response ---');
    console.log('Status :', res.statusCode);
    console.log('Body   :', JSON.stringify(json, null, 2));

    if (json.token) {
      console.log('\n✅ JWT issued successfully!');
      console.log('Token  :', json.token);
    } else {
      console.log('\n❌ Login failed — no token in response.');
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  console.error('Make sure the server is running: npm run dev');
});

req.write(payload);
req.end();
