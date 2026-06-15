// Sử dụng global fetch có sẵn trong Node.js 18+

async function runTest() {
  const url = 'http://localhost:3000/api/predict';
  const payload = {
    homeTeam: 'Brazil',
    awayTeam: 'France',
    predictType: 'full_time',
    fastMode: true // chạy chế độ nhanh để phản hồi nhanh và tiết kiệm token
  };

  console.log('🚀 Gửi yêu cầu dự đoán thử nghiệm đến:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const start = Date.now();
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`⏱️ Thời gian phản hồi: ${duration} giây`);

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Yêu cầu thất bại với status ${res.status}:`, errText);
      process.exit(1);
    }

    const data = await res.json();
    console.log('🟢 Yêu cầu thành công!');
    console.log('Model AI sử dụng:', data.modelUsed);
    console.log('Tỷ số dự đoán:', data.predictedScore);
    console.log('Xác suất thắng (Home/Draw/Away):', data.winProbability);
    console.log('--- NHẬN ĐỊNH CHI TIẾT (predictionReasoning) ---');
    console.log(data.analysis?.predictionReasoning);
    console.log('------------------------------------------------');
    
    if (data.analysis?.predictionReasoning && data.analysis.predictionReasoning.includes('###')) {
      console.log('✅ Xác minh: Nhận định chứa định dạng Markdown thành công!');
    } else {
      console.warn('⚠️ Cảnh báo: Nhận định không chứa định dạng Markdown. Có thể cache hoặc prompt DB cũ.');
    }
  } catch (err) {
    console.error('❌ Lỗi kết nối đến server:', err.message);
    console.error('Đảm bảo dev server đang chạy tại cổng 3000 (npm run dev)');
    process.exit(1);
  }
}

runTest();
