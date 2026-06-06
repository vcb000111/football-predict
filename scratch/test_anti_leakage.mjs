import fetch from 'node-fetch';

async function testAntiLeakage() {
  const url = 'http://localhost:3000/api/predict';
  const payload = {
    homeTeam: 'Turkey',
    awayTeam: 'North Macedonia',
    matchId: 't1',
    forceRefresh: true
  };

  console.log('🚀 Gửi yêu cầu dự đoán mới cho trận t1 (Turkey vs North Macedonia - Đã kết thúc 4-0)...');
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ API Error (${res.status}):`, errText);
      return;
    }

    const data = await res.json();
    console.log('\n✅ DỰ ĐOÁN THÀNH CÔNG!');
    console.log('--------------------------------------------------');
    console.log(`🤖 Model sử dụng: ${data.modelUsed}`);
    console.log(`🔮 Dự đoán tỷ số: Turkey ${data.predictedScore?.home} - ${data.predictedScore?.away} North Macedonia`);
    console.log(`📈 Xác suất: Thắng ${data.winProbability?.home}% | Hòa ${data.winProbability?.draw}% | Thua ${data.winProbability?.away}%`);
    console.log('📝 Lập luận của AI (Chain of Thought & Refinement):');
    console.log(data.analysis?.predictionReasoning);
    console.log('--------------------------------------------------');
    
    // Kiểm tra xem kết quả có bị rò rỉ (luôn ra 4-0 hay không)
    const predictedHome = data.predictedScore?.home;
    const predictedAway = data.predictedScore?.away;
    if (predictedHome === 4 && predictedAway === 0) {
      console.log('⚠️ Cảnh báo: Tỷ số dự kiến trùng khớp hoàn toàn với kết quả thực tế (4-0). AI có thể vẫn bị ảnh hưởng hoặc trùng hợp ngẫu nhiên.');
    } else {
      console.log('🎉 Thành công: Tỷ số dự kiến là', `${predictedHome}-${predictedAway}`, '(Khác với tỷ số thực tế 4-0, chứng tỏ AI đã suy luận độc lập dựa trên Poisson/ELO/chấn thương!).');
    }
  } catch (err) {
    console.error('❌ Lỗi kết nối đến API:', err.message);
  }
}

testAntiLeakage();
