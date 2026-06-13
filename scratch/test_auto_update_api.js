async function testMatch(payload, expectedStatus) {
  console.log(`\n--------------------------------------------------`);
  console.log(`Sending request for ${payload.homeTeam} vs ${payload.awayTeam}...`);
  try {
    const response = await fetch('http://localhost:3000/api/results/auto', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const data = await response.json();
    console.log('HTTP Status:', status);
    console.log('Response Success:', data.success);
    console.log('Match Status:', data.status);
    console.log('Message:', data.message);
    
    if (data.status === expectedStatus) {
      console.log(`[PASS] Match status is ${data.status} as expected.`);
      return true;
    } else {
      console.log(`[FAIL] Expected status ${expectedStatus}, but got ${data.status}`);
      return false;
    }
  } catch (error) {
    console.error('Request failed:', error.message);
    return false;
  }
}

async function main() {
  // 1. Test trận đã đấu (m2: South Korea vs Czechia ngày 2026-06-11)
  const pass1 = await testMatch({
    homeTeam: 'South Korea',
    awayTeam: 'Czechia',
    matchId: 'm2'
  }, 'finished');

  // 2. Test trận tương lai (m13: Saudi Arabia vs Uruguay ngày 2026-06-15)
  const pass2 = await testMatch({
    homeTeam: 'Saudi Arabia',
    awayTeam: 'Uruguay',
    matchId: 'm13'
  }, 'not_started');

  if (pass1 && pass2) {
    console.log('\n==================================================');
    console.log('[ALL PASS] All API boundary tests completed successfully!');
    process.exit(0);
  } else {
    console.log('\n==================================================');
    console.log('[FAIL] Some API boundary tests failed.');
    process.exit(1);
  }
}

main().catch(console.error);
