// Sử dụng native fetch của Node.js

async function test5Times() {
  const url = 'http://localhost:3000/api/predict';
  const body = {
    homeTeam: 'Mexico',
    awayTeam: 'South Africa',
    matchId: 'm1',
    forceRefresh: true // Ép AI chạy thực tế để kiểm tra temperature = 0
  };

  console.log('🚀 Bắt đầu gọi API dự đoán 5 lần liên tiếp (forceRefresh = true)...');
  console.log('Vui lòng đợi (mỗi lượt Consensus + Critic có thể mất 15-30 giây)...');

  const results = [];
  
  for (let i = 1; i <= 5; i++) {
    console.log(`\n👉 Lượt #${i}/5...`);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const duration = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`✅ Lượt #${i} hoàn thành trong ${duration}s`);
      
      const prob = data.winProbability || {};
      const score = data.predictedScore || {};
      const bets = data.bets || {};

      results.push({
        Lượt: i,
        Time: `${duration}s`,
        Score: `${score.home}-${score.away}`,
        "Xác suất (H/D/A)": `${prob.home}% / ${prob.draw}% / ${prob.away}%`,
        "Cược 1X2": bets.oneXTwo?.recommendation || 'N/A',
        "Cược O/U": bets.overUnder?.recommendation || 'N/A',
        "Cược Handicap": bets.handicap?.recommendation || 'N/A',
        Model: data.modelUsed || 'N/A'
      });
    } catch (err) {
      console.error(`❌ Lượt #${i} thất bại:`, err.message);
      results.push({
        Lượt: i,
        Time: 'LỖI',
        Score: 'N/A',
        "Xác suất (H/D/A)": 'N/A',
        "Cược 1X2": 'N/A',
        "Cược O/U": 'N/A',
        "Cược Handicap": 'N/A',
        Model: err.message
      });
    }
  }

  console.log('\n================ BẢNG KẾT QUẢ SO SÁNH 5 LẦN CHẠY ================');
  console.table(results);

  // Kiểm tra tính đồng nhất
  let isConsistent = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i].Score !== results[0].Score || 
        results[i]["Xác suất (H/D/A)"] !== results[0]["Xác suất (H/D/A)"] ||
        results[i]["Cược 1X2"] !== results[0]["Cược 1X2"]) {
      isConsistent = false;
      break;
    }
  }

  console.log(`\n=> Kết luận về tính nhất quán: ${isConsistent ? '🥇 TRÙNG KHỚP 100% (THÀNH CÔNG!)' : '❌ VẪN LỆCH TỶ LỆ'}`);
}

test5Times().catch(console.error);
