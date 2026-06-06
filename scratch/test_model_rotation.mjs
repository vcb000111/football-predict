import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';

async function runTest() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log('📂 Mở database tại:', dbPath);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const testModelName = 'groq-invalid-model-name-for-rotation-test';
  
  try {
    // 1. Thêm model lỗi vào đầu danh sách (priority = 0)
    console.log(`➕ Đang chèn model giả lập lỗi "${testModelName}" vào SQLite...`);
    await db.run(
      `INSERT OR REPLACE INTO ai_models (model_name, priority, status, provider) VALUES (?, 0, 1, 'groq')`,
      [testModelName]
    );
    console.log('✅ Chèn thành công model giả lập lỗi.');

    // 2. Gửi request tới server local (cần server Next.js đang chạy trên cổng 3000)
    console.log('\n📡 Đang gửi request dự đoán tới http://localhost:3000/api/predict...');
    console.log('👉 Vui lòng quan sát logs terminal của Next.js dev server để xem tiến trình xoay vòng model.');
    
    const response = await fetch('http://localhost:3000/api/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        homeTeam: 'Germany',
        awayTeam: 'Turkey',
        matchId: 'test-rotation',
        forceRefresh: true // Bắt buộc chạy mới không dùng cache
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('\n🎉 Request thành công! Kết quả dự đoán trả về:');
      console.log(`- Model đã dùng cuối cùng: ${data.modelUsed}`);
      console.log(`- Tỷ số dự đoán: ${data.predictedScore?.home} - ${data.predictedScore?.away}`);
    } else {
      const errText = await response.text();
      console.error('\n❌ Server trả về lỗi:', response.status, errText);
    }

  } catch (err) {
    console.error('❌ Lỗi trong quá trình chạy test:', err.message);
  } finally {
    // 3. Dọn dẹp dữ liệu test
    console.log(`\n🧹 Đang dọn dẹp model test "${testModelName}" khỏi SQLite...`);
    await db.run(`DELETE FROM ai_models WHERE model_name = ?`, [testModelName]);
    console.log('✅ Dọn dẹp hoàn tất.');
    await db.close();
  }
}

runTest();
