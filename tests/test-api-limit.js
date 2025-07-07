const axios = require('axios');

async function testApiRateLimit() {
  console.log('Testing API rate limiting (300 req/min)...');
  
  const promises = [];
  for (let i = 0; i < 310; i++) {
    promises.push(
      axios.get('http://localhost:3000/api/data')
        .then(res => ({ status: res.status }))
        .catch(err => ({ status: err.response?.status || 0 }))
    );
  }
  
  const results = await Promise.all(promises);
  const success = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.status === 429).length;
  
  console.log(`Results: ${success} successful, ${blocked} blocked`);
  console.log(`API rate limiting: ${blocked > 0 ? 'WORKING' : 'NOT WORKING'}`);
}

testApiRateLimit().catch(console.error);