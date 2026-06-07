// Dùng global fetch có sẵn trong Node v18+

async function runTest() {
  const matches = [
    { id: "e1", homeTeam: "Germany", awayTeam: "Scotland" },
    { id: "e2", homeTeam: "Hungary", awayTeam: "Switzerland" }
  ];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    console.log(`\n⏳ Đang test trận ${m.homeTeam} vs ${m.awayTeam}...`);
    try {
      const predRes = await fetch('http://localhost:3000/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          matchId: m.id,
          fastMode: true,
          forceRefresh: true,
          isBacktest: true
        })
      });
      const predData = await predRes.json();
      console.log('🔮 Kết quả dự đoán:', predRes.status, JSON.stringify(predData, null, 2));

      await new Promise(r => setTimeout(r, 2000));

      const resultRes = await fetch('http://localhost:3000/api/results/auto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          matchId: m.id
        })
      });
      const resultData = await resultRes.json();
      console.log(' Chấm điểm kết quả:', resultRes.status, JSON.stringify(resultData, null, 2));

    } catch (err) {
      console.error('❌ Lỗi:', err.message);
    }
  }
}

runTest();
