async function main() {
  const payload = {
    homeTeam: 'South Korea',
    awayTeam: 'Czechia',
    matchId: 'm2'
  };

  console.log('Sending request to /api/results/auto for South Korea vs Czechia...');
  const response = await fetch('http://localhost:3000/api/results/auto', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const status = response.status;
  const text = await response.text();
  console.log('Status code:', status);
  console.log('Response:', text);
}

main().catch(console.error);
