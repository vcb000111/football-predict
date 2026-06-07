const http = require('http');
const fs = require('fs');
const path = require('path');

function postRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

// 5 trận đấu mẫu
const testMatches = [
  { id: 'pl1', homeTeam: 'Manchester United', awayTeam: 'Fulham', handicap: -0.75, actualHome: 1, actualAway: 0, actualCorners: 12, actualCards: 4 },
  { id: 'pl2', homeTeam: 'Chelsea', awayTeam: 'Manchester City', handicap: 0.5, actualHome: 0, actualAway: 2, actualCorners: 11, actualCards: 6 },
  { id: 'pl3', homeTeam: 'Arsenal', awayTeam: 'Chelsea', handicap: -0.75, actualHome: 1, actualAway: 1, actualCorners: 10, actualCards: 5 },
  { id: 'pl4', homeTeam: 'Aston Villa', awayTeam: 'Arsenal', handicap: 0.75, actualHome: 0, actualAway: 2, actualCorners: 10, actualCards: 4 },
  { id: 'pl5', homeTeam: 'Manchester United', awayTeam: 'Liverpool', handicap: 0.25, actualHome: 0, actualAway: 3, actualCorners: 7, actualCards: 7 }
];

async function run() {
  console.log('⚡ BẮT ĐẦU CHẠY THỬ NGHIỆM DỰ ĐOÁN 5 TRẬN ĐẤU QUÁ KHỨ...\n');
  
  for (const match of testMatches) {
    try {
      console.log(`-----------------------------------------------------------------`);
      console.log(`👉 Trận đấu [${match.id}]: ${match.homeTeam} vs ${match.awayTeam}`);
      console.log(`   Thực tế: ${match.actualHome} - ${match.actualAway} | Góc: ${match.actualCorners} | Thẻ: ${match.actualCards} | Handicap Odds: ${match.handicap}`);
      
      const startTime = Date.now();
      const res = await postRequest('http://localhost:3000/api/predict', {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        matchId: match.id,
        forceRefresh: true,
        fastMode: true,
        isBacktest: true,
        marketHandicap: match.handicap
      });
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (res.status === 200 && res.data) {
        const d = res.data;
        const predScore = `${d.predictedScore?.home}-${d.predictedScore?.away}`;
        const actualScore = `${match.actualHome}-${match.actualAway}`;
        
        // Đánh giá 1X2
        let actualOutcome = 'Draw';
        if (match.actualHome > match.actualAway) actualOutcome = 'Home';
        else if (match.actualHome < match.actualAway) actualOutcome = 'Away';
        const is1X2Correct = d.bets?.oneXTwo?.recommendation === actualOutcome ? 'ĐÚNG ✅' : 'SAI ❌';
        
        // Đánh giá Handicap
        let isHandicapCorrect = 'SAI ❌';
        const diff = match.actualHome - match.actualAway;
        const homeResult = diff + match.handicap;
        let actualHandicapWinner = 'Draw';
        if (homeResult > 0) actualHandicapWinner = 'Home';
        else if (homeResult < 0) actualHandicapWinner = 'Away';
        
        if (d.bets?.handicap?.recommendation?.includes(actualHandicapWinner)) {
          isHandicapCorrect = 'ĐÚNG ✅';
        }
        
        // Đánh giá Phạt góc (Corners)
        const isCornersCorrect = (
          (d.bets?.corners?.recommendation?.includes('Over') && match.actualCorners > d.bets?.corners?.line) ||
          (d.bets?.corners?.recommendation?.includes('Under') && match.actualCorners < d.bets?.corners?.line)
        ) ? 'ĐÚNG ✅' : 'SAI ❌';

        // Đánh giá Thẻ phạt (Cards)
        const isCardsCorrect = (
          (d.bets?.cards?.recommendation?.includes('Over') && match.actualCards > d.bets?.cards?.line) ||
          (d.bets?.cards?.recommendation?.includes('Under') && match.actualCards < d.bets?.cards?.line)
        ) ? 'ĐÚNG ✅' : 'SAI ❌';

        console.log(`⏱️ Thời gian phản hồi: ${duration}s`);
        console.log(`🎯 AI dự đoán Tỉ số: ${predScore} (Mốc Poisson thô: ${d.poissonBaseline?.predictedScore?.home}-${d.poissonBaseline?.predictedScore?.away})`);
        console.log(`💡 Nhận định AI: ${d.analysis?.predictionReasoning}`);
        console.log(`📊 ĐÁNH GIÁ KÈO:`);
        console.log(`   - Kèo 1X2: Chọn [${d.bets?.oneXTwo?.recommendation}] vs Thực tế [${actualOutcome}] -> ${is1X2Correct}`);
        console.log(`   - Kèo Handicap: Chọn [${d.bets?.handicap?.recommendation}] (Chấp: ${match.handicap}) -> ${isHandicapCorrect}`);
        console.log(`   - Kèo Phạt góc: Chọn [${d.bets?.corners?.recommendation}] (Line: ${d.bets?.corners?.line}) vs Thực tế [${match.actualCorners}] -> ${isCornersCorrect}`);
        console.log(`   - Kèo Thẻ phạt: Chọn [${d.bets?.cards?.recommendation}] (Line: ${d.bets?.cards?.line}) vs Thực tế [${match.actualCards}] -> ${isCardsCorrect}`);
      } else {
        console.error(`❌ API trả về lỗi ${res.status}:`, res.data || res.raw);
      }
      
      // Delay 2s để tránh nghẽn SQLite và rate limit
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`❌ Lỗi khi test trận ${match.id}:`, err.message);
    }
  }
  
  console.log('\n✅ HOÀN TẤT CHẠY THỬ NGHIỆM.');
}

run();
