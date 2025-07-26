const axios = require('axios');

async function testHealthBypass() {
  console.log('Testing health endpoint bypass...');
  
  // Reset rate limits first
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1'
  }, { validateStatus: () => true });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test health endpoint should never be rate limited
  console.log('Testing health endpoint bypass (should never be rate limited)...');
  
  for (let i = 0; i < 200; i++) {
    const response = await axios.get('http://localhost:3000/health', { 
      validateStatus: () => true 
    });
    
    if (response.status !== 200) {
      console.error(`FAILED: Health endpoint returned ${response.status} on request ${i + 1}`);
      return;
    }
    
    if (i % 50 === 0) {
      console.log(`Health request ${i + 1}: Status ${response.status} ✓`);
    }
  }
  
  console.log('✓ Health endpoint bypass working correctly');
  
  // Verify other endpoints are still rate limited
  console.log('\nVerifying other endpoints are still rate limited...');
  
  // Exhaust rate limit on API endpoint
  const apiPromises = [];
  for (let i = 0; i < 100; i++) {
    apiPromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  const apiResults = await Promise.all(apiPromises);
  const apiBlocked = apiResults.filter(r => r.status === 429).length;
  const apiSuccess = apiResults.filter(r => r.status === 200).length;
  
  console.log(`API endpoint test: ${apiSuccess} successful, ${apiBlocked} blocked`);
  
  if (apiBlocked > 0) {
    console.log('✓ API endpoints are properly rate limited');
  } else {
    console.error('✗ API endpoints are not being rate limited');
  }
  
  // Test health endpoint still works after API is rate limited
  console.log('\nTesting health endpoint after API rate limit...');
  
  for (let i = 0; i < 10; i++) {
    const response = await axios.get('http://localhost:3000/health', { 
      validateStatus: () => true 
    });
    
    if (response.status !== 200) {
      console.error(`FAILED: Health endpoint affected by rate limiting: ${response.status}`);
      return;
    }
  }
  
  console.log('✓ Health endpoint remains unaffected by rate limiting');
  console.log('Health endpoint bypass test completed\n');
}

testHealthBypass().catch(console.error);