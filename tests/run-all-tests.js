const { spawn } = require('child_process');

function runTest(testFile) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running ${testFile}...`);
    console.log('='.repeat(50));
    
    const child = spawn('node', [`tests/${testFile}`], { stdio: 'inherit' });
    
    child.on('close', (code) => {
      resolve(code);
    });
  });
}

async function runAllTests() {
  console.log('Running all rate limiter tests...');
  
  const tests = [
    'test-health-bypass.js',
    'test-burst.js',
    'test-api-limit.js', 
    'test-global-limit.js',
    'test-warning-headers.js',
    'test-skip-logic.js',
    'test-redis-fallback.js',
    'test-memory-cleanup.js',
    'test-queue-failure.js'
  ];
  
  for (const test of tests) {
    await runTest(test);

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('All rate limiter tests completed!');
  console.log('='.repeat(50));
}

runAllTests().catch(console.error);