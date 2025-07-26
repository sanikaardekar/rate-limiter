const axios = require('axios');

async function testBurstProtection() {
  console.log('Testing burst protection with 110 concurrent requests...');
  

  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const promises = [];
  for (let i = 0; i < 110; i++) {
    promises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
        .then(res => ({ 
          status: res.status, 
          remaining: res.headers['x-ratelimit-remaining'],
          limit: res.headers['x-ratelimit-limit'],
          headers: !!res.headers['x-ratelimit-limit']
        }))
        .catch(err => ({ 
          status: err.response?.status || 0, 
          remaining: err.response?.headers['x-ratelimit-remaining'],
          limit: err.response?.headers['x-ratelimit-limit'],
          headers: !!err.response?.headers['x-ratelimit-limit']
        }))
    );
  }
  
  const results = await Promise.all(promises);
  
  const success = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.status === 429).length;
  const withHeaders = results.filter(r => r.headers).length;
  
  console.log(`Results: ${success} successful, ${blocked} blocked`);
  console.log(`Headers present: ${withHeaders}/${results.length}`);
  console.log('Rate limiter is', blocked > 0 ? 'WORKING' : 'NOT WORKING');
  
  if (results.length > 0) {
    console.log(`Sample result - Status: ${results[0].status}, Limit: ${results[0].limit}, Remaining: ${results[0].remaining}`);
  }
  

  await testAlgorithmEdgeCases();
}

async function testAlgorithmEdgeCases() {
  console.log('\nTesting algorithm edge cases...');
  

  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  

  const rapidPromises = [];
  for (let i = 0; i < 15; i++) {
    rapidPromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  const rapidResults = await Promise.all(rapidPromises);
  const rapidSuccess = rapidResults.filter(r => r.status === 200).length;
  const rapidBlocked = rapidResults.filter(r => r.status === 429).length;
  const withHeaders = rapidResults.filter(r => r.headers['x-ratelimit-limit']).length;
  
  console.log(`Sub-millisecond precision test: ${rapidSuccess} success, ${rapidBlocked} blocked`);
  console.log(`Headers in rapid test: ${withHeaders}/${rapidResults.length}`);
}

testBurstProtection().catch(console.error);