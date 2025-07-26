const axios = require('axios');

async function testRedisFallback() {
  console.log('Testing Redis failure scenarios and algorithm fallback...');
  
  // Test normal Redis operation first
  console.log('Testing normal Redis operation...');
  
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  // Make requests to verify Redis is working
  for (let i = 0; i < 3; i++) {
    const response = await axios.get('http://localhost:3000/api/data', { 
      validateStatus: () => true 
    });
    console.log(`Normal operation ${i + 1}: Status ${response.status}, Remaining: ${response.headers['x-ratelimit-remaining']}`);
  }
  
  // Test in-memory fallback behavior
  console.log('\nTesting in-memory fallback behavior...');
  
  // Simulate high load to potentially trigger fallback
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
        .then(res => ({ 
          status: res.status, 
          remaining: res.headers['x-ratelimit-remaining'],
          limit: res.headers['x-ratelimit-limit']
        }))
        .catch(err => ({ 
          status: err.response?.status || 0, 
          remaining: err.response?.headers['x-ratelimit-remaining'],
          limit: err.response?.headers['x-ratelimit-limit']
        }))
    );
  }
  
  const results = await Promise.all(promises);
  
  const successful = results.filter(r => r.status === 200).length;
  const blocked = results.filter(r => r.status === 429).length;
  const withHeaders = results.filter(r => r.limit).length;
  
  console.log(`Fallback test results: ${successful} successful, ${blocked} blocked`);
  console.log(`Headers present: ${withHeaders}/${results.length}`);
  
  // Test algorithm consistency
  console.log('\nTesting algorithm consistency...');
  
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  // Test sliding window vs fixed window behavior
  const windowTests = [];
  for (let i = 0; i < 10; i++) {
    const start = Date.now();
    const response = await axios.get('http://localhost:3000/api/data', { 
      validateStatus: () => true 
    });
    const end = Date.now();
    
    windowTests.push({
      timestamp: start,
      responseTime: end - start,
      status: response.status,
      remaining: response.headers['x-ratelimit-remaining']
    });
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log('Window algorithm test completed');
  windowTests.forEach((test, i) => {
    console.log(`Request ${i + 1}: Status ${test.status}, Remaining ${test.remaining}, Response time ${test.responseTime}ms`);
  });
  
  console.log('Redis fallback test completed\n');
}

testRedisFallback().catch(console.error);