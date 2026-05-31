/**
 * Mellow Play Backend API - Regression Test Suite
 * Run this while 'wrangler dev' is active on http://localhost:8787
 */

const BASE_URL = 'http://localhost:8787/api/v1';

async function runTests() {
  console.log('🚀 Starting Mellow Play Regression Tests...\n');
  let testsPassed = 0;
  let testsFailed = 0;

  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      testsPassed++;
    } catch (error) {
      console.error(`❌ FAIL: ${name}`);
      console.error(`   > ${error.message}`);
      if (error.response) {
        console.error(`   > Response: ${error.response}`);
      }
      testsFailed++;
    }
  };

  const assertResponse = async (res, expectedStatus, name) => {
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    
    if (res.status !== expectedStatus) {
      const err = new Error(`Expected status ${expectedStatus}, got ${res.status}`);
      err.response = typeof data === 'object' ? JSON.stringify(data) : data;
      throw err;
    }
    return data;
  };

  // --- 1. Public APIs (System Health) ---
  await test('GET /health - Should be public', async () => {
    const res = await fetch('http://localhost:8787/health');
    await assertResponse(res, 200, 'GET /health');
  });

  // --- 2. Auth Flow ---
  let testPhone = `08${Math.floor(10000000 + Math.random() * 90000000)}`;
  let debugOtp = '';

  await test('POST /auth/request-otp - Should generate OTP', async () => {
    const res = await fetch(`${BASE_URL}/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone })
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success || !data.debug_otp) {
      throw new Error(`OTP generation failed: ${JSON.stringify(data)}`);
    }
    debugOtp = data.debug_otp;
  });

  await test('POST /auth/register - Should fail with invalid OTP', async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhone, otp: '000000', password: 'password123' })
    });
    const data = await res.json();
    if (res.status !== 400 || data.success) {
      throw new Error(`Should have failed with 400, got ${res.status}`);
    }
  });

  await test('POST /auth/register - Should register successfully', async () => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone: testPhone, 
        otp: debugOtp, 
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      })
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success || !data.userId) {
      throw new Error(`Registration failed: ${JSON.stringify(data)}`);
    }
  });

  // --- 3. Login Flow ---
  let authToken = '';

  await test('POST /auth/login - Should login successfully with phone', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testPhone, password: 'password123' })
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success || !data.token) {
      throw new Error(`Login failed: ${JSON.stringify(data)}`);
    }
    authToken = data.token;
  });

  await test('POST /auth/login - Should fail with wrong password', async () => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: testPhone, password: 'wrongpassword' })
    });
    if (res.status !== 401) {
      throw new Error(`Expected 401, got ${res.status}`);
    }
  });

  // --- 4. Protected APIs ---
  
  // Roadmap Nodes
  await test('GET /journey/nodes - Should fail without token', async () => {
    const res = await fetch(`${BASE_URL}/journey/nodes`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /journey/nodes - Should return roadmap nodes with token', async () => {
    const res = await fetch(`${BASE_URL}/journey/nodes`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await assertResponse(res, 200, 'GET /journey/nodes');
    if (!data.success || !Array.isArray(data.nodes)) {
      throw new Error(`Expected success array, got ${JSON.stringify(data)}`);
    }
  });

  // Profiles
  await test('GET /profiles - Should fail without token', async () => {
    const res = await fetch(`${BASE_URL}/profiles?userId=test_user_1`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /profiles - Should list profiles with valid token', async () => {
    const res = await fetch(`${BASE_URL}/profiles?userId=test_user_1`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success) {
      throw new Error(`Profile list failed: ${JSON.stringify(data)}`);
    }
  });

  // Journey Progress
  await test('GET /journey/progress/child_pete - Should fail without token', async () => {
    const res = await fetch(`${BASE_URL}/journey/progress/child_pete`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /journey/progress/child_pete - Should return progress with token', async () => {
    const res = await fetch(`${BASE_URL}/journey/progress/child_pete`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success) {
      throw new Error(`Progress fetch failed: ${JSON.stringify(data)}`);
    }
  });

  // Album Media
  await test('GET /journey/album/child_pete - Should fail without token', async () => {
    const res = await fetch(`${BASE_URL}/journey/album/child_pete`);
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('GET /journey/album/child_pete - Should return album media with token', async () => {
    const res = await fetch(`${BASE_URL}/journey/album/child_pete`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.status !== 200 || !data.success || !Array.isArray(data.album)) {
      throw new Error(`Album fetch failed: ${JSON.stringify(data)}`);
    }
  });

  // Profile Calculation
  await test('POST /profiles/calculate - Should fail without token', async () => {
    const res = await fetch(`${BASE_URL}/profiles/calculate`, { method: 'POST' });
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  console.log(`\n🏁 Test Summary: ${testsPassed} passed, ${testsFailed} failed.`);
  if (testsFailed > 0) process.exit(1);
}

runTests();
