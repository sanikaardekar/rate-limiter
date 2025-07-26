const axios = require('axios');

async function testWarningHeaders() {
  console.log('Testing warning headers...');
  
  try {
    await axios.post('http://localhost:3000/admin/reset-rate-limit', {
      identifier: '::1'
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    for (let i = 0; i < 4; i++) {
      const response = await axios.post('http://localhost:3000/auth/login', {
        email: 'test@example.com',
        password: 'password'
      }, { validateStatus: () => true });
      console.log(`Auth request ${i + 1}: ${response.status}, remaining: ${response.headers['x-ratelimit-remaining']}, warning: ${response.headers['x-ratelimit-warning'] || 'None'}`);
    }
    
    const response = await axios.post('http://localhost:3000/auth/login', {
      email: 'test@example.com',
      password: 'password'
    }, { validateStatus: () => true });
    
    const warning = response.headers['x-ratelimit-warning'];
    const remaining = response.headers['x-ratelimit-remaining'];
    const limit = response.headers['x-ratelimit-limit'];
    
    console.log(`Status: ${response.status}`);
    console.log(`Limit: ${limit}`);
    console.log(`Remaining: ${remaining}`);
    console.log(`Warning header: ${warning || 'None'}`);
    console.log(`Warning headers: ${warning ? 'WORKING' : 'NOT WORKING'}`);
    
    const blockedResponse = await axios.post('http://localhost:3000/auth/login', {
      email: 'test@example.com',
      password: 'password'
    }, { validateStatus: () => true });
    
    console.log(`6th request - Status: ${blockedResponse.status}, Headers present: ${!!blockedResponse.headers['x-ratelimit-limit']}`);
    if (blockedResponse.headers['x-ratelimit-limit']) {
      console.log(`Blocked request headers - Limit: ${blockedResponse.headers['x-ratelimit-limit']}, Remaining: ${blockedResponse.headers['x-ratelimit-remaining']}`);
    }
    
  } catch (error) {
    console.log(`Warning headers test failed: ${error.message}`);
  }
  
  await testInMemoryFallback();
}

async function testInMemoryFallback() {
  console.log('\nTesting in-memory fallback scenarios...');
  
  const identifiers = ['192.168.1.100', '::1', '2001:db8::1', 'invalid-ip'];
  
  for (const id of identifiers) {
    try {
      const response = await axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': id },
        validateStatus: () => true
      });
      console.log(`Identifier ${id}: ${response.status}`);
    } catch (error) {
      console.log(`Identifier ${id}: error`);
    }
  }
  
  console.log('Testing memory leak scenarios...');
  const uniqueIps = [];
  for (let i = 0; i < 50; i++) {
    uniqueIps.push(`192.168.1.${i}`);
  }
  
  const memoryPromises = uniqueIps.map(ip => 
    axios.get('http://localhost:3000/api/data', {
      headers: { 'X-Forwarded-For': ip },
      validateStatus: () => true
    })
  );
  
  const memoryResults = await Promise.all(memoryPromises);
  const memorySuccess = memoryResults.filter(r => r.status === 200).length;
  console.log(`Memory test: ${memorySuccess} unique IPs processed`);
  
  await testSkipLogicImplementation();
}

async function testSkipLogicImplementation() {
  console.log('\nTesting skip logic implementation...');
  
  const skipTests = [
    { method: 'GET', url: 'http://localhost:3000/api/data', desc: 'success (200)' },
    { method: 'GET', url: 'http://localhost:3000/nonexistent', desc: 'not found (404)' },
    { method: 'POST', url: 'http://localhost:3000/api/data', data: '{malformed}', desc: 'server error (500)' },
    { method: 'POST', url: 'http://localhost:3000/admin/reset-rate-limit', data: {}, desc: 'bad request (400)' }
  ];
  
  for (const test of skipTests) {
    try {
      const response = await axios({
        method: test.method,
        url: test.url,
        data: test.data,
        validateStatus: () => true
      });
      console.log(`Skip logic ${test.desc}: ${response.status}`);
    } catch (error) {
      console.log(`Skip logic ${test.desc}: error`);
    }
  }
}

testWarningHeaders().catch(console.error);