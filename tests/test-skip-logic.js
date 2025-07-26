const axios = require('axios');

async function testSkipLogic() {
  console.log('Testing skip logic for successful/failed requests...');
  
  // Reset rate limits first
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test skipSuccessfulRequests
  console.log('Testing skipSuccessfulRequests behavior...');
  
  // Make successful requests (200 status)
  for (let i = 0; i < 5; i++) {
    const response = await axios.get('http://localhost:3000/api/data', { 
      validateStatus: () => true 
    });
    console.log(`Request ${i + 1}: Status ${response.status}, Remaining: ${response.headers['x-ratelimit-remaining']}`);
  }
  
  // Test skipFailedRequests
  console.log('\nTesting skipFailedRequests behavior...');
  
  // Make failed requests (404 status)
  for (let i = 0; i < 3; i++) {
    const response = await axios.get('http://localhost:3000/nonexistent', { 
      validateStatus: () => true 
    });
    console.log(`Failed request ${i + 1}: Status ${response.status}, Remaining: ${response.headers['x-ratelimit-remaining']}`);
  }
  
  // Test mixed success/failure
  console.log('\nTesting mixed success/failure requests...');
  
  const mixedRequests = [
    { url: '/api/data', expected: 200 },
    { url: '/nonexistent', expected: 404 },
    { url: '/api/data', expected: 200 },
    { url: '/invalid', expected: 404 }
  ];
  
  for (let i = 0; i < mixedRequests.length; i++) {
    const { url, expected } = mixedRequests[i];
    const response = await axios.get(`http://localhost:3000${url}`, { 
      validateStatus: () => true 
    });
    console.log(`Mixed request ${i + 1} (${url}): Status ${response.status}, Expected ${expected}, Remaining: ${response.headers['x-ratelimit-remaining']}`);
  }
  
  console.log('Skip logic test completed\n');
}

testSkipLogic().catch(console.error);