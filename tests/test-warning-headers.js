const axios = require('axios');

async function testWarningHeaders() {
  console.log('Testing warning headers (graduated response)...');
  
  try {
    // Reset rate limits first
    await axios.post('http://localhost:3000/admin/reset-rate-limit', {
      identifier: '::1'
    });
    
    // Make requests to approach burst limit (80% of 100)
    for (let i = 0; i < 80; i++) {
      await axios.get('http://localhost:3000/api/data');
    }
    
    // Check for warning headers
    const response = await axios.get('http://localhost:3000/api/data');
    const warning = response.headers['x-ratelimit-warning'];
    const remaining = response.headers['x-ratelimit-remaining'];
    
    console.log(`Remaining requests: ${remaining}`);
    console.log(`Warning header: ${warning || 'None'}`);
    console.log(`Warning headers: ${warning ? 'WORKING' : 'NOT WORKING'}`);
    
  } catch (error) {
    console.log(`Warning headers test failed: ${error.message}`);
  }
}

testWarningHeaders().catch(console.error);