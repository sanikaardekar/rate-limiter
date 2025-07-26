const axios = require('axios');

async function testQueueFailure() {
  console.log('Testing queue processing failures and recovery...');
  
  // Test queue stats monitoring
  console.log('Testing queue stats monitoring...');
  
  const getQueueStats = async () => {
    const response = await axios.get('http://localhost:3000/admin/queue-stats', { 
      validateStatus: () => true 
    });
    return response.data;
  };
  
  // Get initial queue stats
  const initialStats = await getQueueStats();
  console.log('Initial queue stats:', JSON.stringify(initialStats.queues, null, 2));
  
  // Generate load to create queue jobs
  console.log('\nGenerating load to test queue processing...');
  
  const loadPromises = [];
  for (let i = 0; i < 30; i++) {
    loadPromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  await Promise.all(loadPromises);
  
  // Check queue stats after load
  const afterLoadStats = await getQueueStats();
  console.log('Queue stats after load:', JSON.stringify(afterLoadStats.queues, null, 2));
  
  // Test queue recovery after failures
  console.log('\nTesting queue recovery scenarios...');
  
  // Make requests that should trigger cleanup jobs
  const cleanupPromises = [];
  for (let i = 0; i < 60; i++) {
    cleanupPromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  const cleanupResults = await Promise.all(cleanupPromises);
  const blocked = cleanupResults.filter(r => r.status === 429).length;
  
  console.log(`Cleanup trigger test: ${blocked} requests blocked (should trigger cleanup jobs)`);
  
  // Wait for queue processing
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const cleanupStats = await getQueueStats();
  console.log('Queue stats after cleanup triggers:', JSON.stringify(cleanupStats.queues, null, 2));
  
  // Test queue job types
  console.log('\nTesting different queue job types...');
  
  // Reset rate limit (should create RESET jobs)
  await axios.post('http://localhost:3000/admin/reset-rate-limit', {
    identifier: '::1',
    ruleId: 'api'
  }, { validateStatus: () => true });
  
  // Make more requests (should create INCREMENT and CLEANUP jobs)
  const jobTypePromises = [];
  for (let i = 0; i < 10; i++) {
    jobTypePromises.push(
      axios.get('http://localhost:3000/api/data', { validateStatus: () => true })
    );
  }
  
  await Promise.all(jobTypePromises);
  
  // Wait for job processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const jobTypeStats = await getQueueStats();
  console.log('Queue stats after job type test:', JSON.stringify(jobTypeStats.queues, null, 2));
  
  // Test queue failure resilience
  console.log('\nTesting queue failure resilience...');
  
  // Generate high concurrent load to stress queues
  const stressPromises = [];
  for (let i = 0; i < 100; i++) {
    stressPromises.push(
      axios.get('http://localhost:3000/api/data', { 
        timeout: 5000,
        validateStatus: () => true 
      }).catch(err => ({ 
        status: err.response?.status || 0,
        error: err.code || err.message 
      }))
    );
  }
  
  const stressResults = await Promise.all(stressPromises);
  const stressSuccess = stressResults.filter(r => r.status === 200).length;
  const stressBlocked = stressResults.filter(r => r.status === 429).length;
  const stressErrors = stressResults.filter(r => r.error).length;
  
  console.log(`Stress test results: ${stressSuccess} success, ${stressBlocked} blocked, ${stressErrors} errors`);
  
  // Final queue stats
  const finalStats = await getQueueStats();
  console.log('Final queue stats:', JSON.stringify(finalStats.queues, null, 2));
  
  // Test queue metrics
  console.log('\nTesting queue metrics and monitoring...');
  
  const rateLimitQueue = finalStats.queues.rateLimitQueue;
  const cleanupQueue = finalStats.queues.cleanupQueue;
  
  console.log(`Rate limit queue - Completed: ${rateLimitQueue.completed}, Failed: ${rateLimitQueue.failed}`);
  console.log(`Cleanup queue - Completed: ${cleanupQueue.completed}, Failed: ${cleanupQueue.failed}`);
  
  const successRate = rateLimitQueue.completed / (rateLimitQueue.completed + rateLimitQueue.failed) * 100;
  console.log(`Queue success rate: ${successRate.toFixed(2)}%`);
  
  console.log('Queue failure test completed\n');
}

testQueueFailure().catch(console.error);