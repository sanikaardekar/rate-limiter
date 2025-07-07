const axios = require('axios');

async function testBurstProtection() {
  console.log('Testing burst protection with 110 concurrent requests...');
  
  const promises = [];
  for (let i = 0; i < 110; i++) {
    promises.push(
      axios.get('http://localhost:3000/api/data')
        .then(res => ({ status: res.status, remaining: res.headers['x-ratelimit-remaining'] }))
        .catch(err => ({ status: err.response?.status || 0, remaining: err.response?.headers['x-ratelimit-remaining'] }))
    );
  }
  
  const results = await Promise.all(promises);
  
  const success = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.status === 429).length;
  
  console.log(`Results: ${success} successful, ${blocked} blocked`);
  console.log('Rate limiter is', blocked > 0 ? 'WORKING' : 'NOT WORKING');
}

testBurstProtection().catch(console.error);