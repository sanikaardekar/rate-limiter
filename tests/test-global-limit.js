const axios = require('axios');

async function testGlobalRateLimit() {
  console.log('Testing global rate limiting (1000 req/15min)...');
  console.log('Note: This test sends 200 requests to different endpoints');
  
  const endpoints = ['/', '/api/data', '/test/limited'];
  const promises = [];
  
  for (let i = 0; i < 200; i++) {
    const endpoint = endpoints[i % endpoints.length];
    promises.push(
      axios.get(`http://localhost:3000${endpoint}`)
        .then(res => ({ status: res.status, endpoint }))
        .catch(err => ({ status: err.response?.status || 0, endpoint }))
    );
  }
  
  const results = await Promise.all(promises);
  const success = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.status === 429).length;
  
  console.log(`Results: ${success} successful, ${blocked} blocked`);
  console.log(`Global rate limiting: ${success > 0 ? 'ALLOWING REQUESTS' : 'BLOCKING ALL'}`);
  

  await testSecurityEdgeCases();
}

async function testSecurityEdgeCases() {
  console.log('\nTesting security edge cases...');
  

  const ipv6Tests = ['::1', '2001:db8::1', 'fe80::1%lo0'];
  for (const ip of ipv6Tests) {
    try {
      const response = await axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': ip },
        validateStatus: () => true
      });
      console.log(`IPv6 ${ip}: ${response.status}`);
    } catch (error) {
      console.log(`IPv6 ${ip}: error`);
    }
  }
  

  const malformedIps = ['999.999.999.999', '192.168.1', 'not.an.ip'];
  for (const ip of malformedIps) {
    try {
      const response = await axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': ip },
        validateStatus: () => true
      });
      console.log(`Malformed ${ip}: ${response.status}`);
    } catch (error) {
      console.log(`Malformed ${ip}: error`);
    }
  }
  

  console.log('Testing Redis Lua script edge cases...');
  const redisStressPromises = [];
  for (let i = 0; i < 1000; i++) {
    redisStressPromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  const redisResults = await Promise.all(redisStressPromises);
  const redisSuccess = redisResults.filter(r => r.status === 200).length;
  const redisBlocked = redisResults.filter(r => r.status === 429).length;
  console.log(`Redis stress test: ${redisSuccess} success, ${redisBlocked} blocked`);
  

  const injectionHeaders = [
    '127.0.0.1\r\nX-Injected: malicious',
    '10.0.0.1\nSet-Cookie: evil=true'
  ];
  
  for (const header of injectionHeaders) {
    try {
      await axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': header },
        validateStatus: () => true
      });
      console.log(`Header injection test: handled`);
    } catch (error) {
      console.log(`Header injection test: blocked`);
    }
  }
}

testGlobalRateLimit().catch(console.error);