const axios = require('axios');

async function testMemoryCleanup() {
  console.log('Testing memory cleanup and local cache TTL...');
  
  // Test local cache size monitoring
  console.log('Testing local cache size monitoring...');
  
  const getStats = async () => {
    const response = await axios.get('http://localhost:3000/admin/stats', { 
      validateStatus: () => true 
    });
    return response.data;
  };
  
  // Get initial stats
  const initialStats = await getStats();
  console.log(`Initial cache size: ${initialStats.rateLimiter.localCacheSize}`);
  
  // Generate unique identifiers to fill cache
  const uniqueRequests = [];
  for (let i = 0; i < 50; i++) {
    uniqueRequests.push(
      axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': `192.168.1.${i}` },
        validateStatus: () => true
      })
    );
  }
  
  await Promise.all(uniqueRequests);
  
  // Check cache size after requests
  const afterStats = await getStats();
  console.log(`Cache size after unique requests: ${afterStats.rateLimiter.localCacheSize}`);
  
  // Test throttle map cleanup
  console.log('\nTesting throttle map cleanup...');
  
  // Make rapid requests to trigger throttle map usage
  const throttlePromises = [];
  for (let i = 0; i < 25; i++) {
    throttlePromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  await Promise.all(throttlePromises);
  
  // Wait for potential cleanup
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const finalStats = await getStats();
  console.log(`Final cache size: ${finalStats.rateLimiter.localCacheSize}`);
  
  // Test TTL expiration simulation
  console.log('\nTesting TTL expiration behavior...');
  
  // Reset and make a few requests
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  // Make requests with different time intervals
  const ttlTests = [];
  for (let i = 0; i < 5; i++) {
    const response = await axios.get('http://localhost:3000/api/data', { 
      validateStatus: () => true 
    });
    
    ttlTests.push({
      timestamp: Date.now(),
      remaining: response.headers['x-ratelimit-remaining'],
      reset: response.headers['x-ratelimit-reset']
    });
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('TTL test results:');
  ttlTests.forEach((test, i) => {
    const resetTime = new Date(parseInt(test.reset) * 1000);
    console.log(`Request ${i + 1}: Remaining ${test.remaining}, Reset at ${resetTime.toISOString()}`);
  });
  
  // Test memory pressure scenarios
  console.log('\nTesting memory pressure scenarios...');
  
  const memoryPressurePromises = [];
  for (let i = 0; i < 100; i++) {
    memoryPressurePromises.push(
      axios.get('http://localhost:3000/api/data', {
        headers: { 'X-Forwarded-For': `10.0.0.${i % 255}` },
        validateStatus: () => true
      })
    );
  }
  
  const memoryResults = await Promise.all(memoryPressurePromises);
  const memorySuccess = memoryResults.filter(r => r.status === 200).length;
  const memoryBlocked = memoryResults.filter(r => r.status === 429).length;
  
  console.log(`Memory pressure test: ${memorySuccess} successful, ${memoryBlocked} blocked`);
  
  const pressureStats = await getStats();
  console.log(`Cache size under pressure: ${pressureStats.rateLimiter.localCacheSize}`);
  
  console.log('Memory cleanup test completed\n');
}

testMemoryCleanup().catch(console.error);