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
  

  await testQueueEdgeCases();
}

async function testQueueEdgeCases() {
  console.log('\nTesting queue system edge cases...');
  
  try {

    const beforeStats = await axios.get('http://localhost:3000/admin/queue-stats');
    console.log('Queue stats before:', JSON.stringify(beforeStats.data.queues));
    

    const loadPromises = [];
    for (let i = 0; i < 20; i++) {
      loadPromises.push(
        axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
      );
    }
    await Promise.all(loadPromises);
    

    await new Promise(resolve => setTimeout(resolve, 1000));
    

    const afterStats = await axios.get('http://localhost:3000/admin/queue-stats');
    console.log('Queue stats after:', JSON.stringify(afterStats.data.queues));
    
  } catch (error) {
    console.log('Queue test error:', error.message);
  }
}

testApiRateLimit().catch(console.error);