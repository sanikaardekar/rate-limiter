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
}

testGlobalRateLimit().catch(console.error);