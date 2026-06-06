import { GoogleGenAI } from '@google/genai';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// 1. Tự động load env từ .env.local
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2 && !line.trim().startsWith('#')) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.error('Lỗi khi load env:', e);
}

const geminiKey = process.env.GEMINI_API_KEY;
if (!geminiKey) {
  console.error('❌ Không tìm thấy GEMINI_API_KEY trong .env.local! Vui lòng thêm key trước khi chạy.');
  process.exit(1);
}

async function testRetrospective() {
  console.log('🏁 Bắt đầu test Retrospective...');
  
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const homeTeam = 'Mexico';
  const awayTeam = 'South Africa';
  const aHome = 1;
  const aAway = 1;
  const pHome = 2;
  const pAway = 1;
  const incorrectBets = ['1X2 (Thắng/Hòa/Thua)', 'Tài/Xỉu 2.5'];
  const summaryDetail = 'Dự kiến Mexico thắng 2-1 (Over 2.5), tuy nhiên thực tế trận đấu diễn ra thực dụng, kết thúc với tỉ số hòa 1-1 (Under 2.5).';

  const lessonPrompt = `
Trận đấu giữa ${homeTeam} và ${awayTeam} kết thúc với tỷ số thực tế là ${aHome}-${aAway}.
Dự đoán ban đầu của bạn là: Tỷ số ${pHome}-${pAway}.
Các đề xuất kèo bị sai lệch bao gồm: ${incorrectBets.join(', ')}.
Chi tiết phân tích sai lệch: ${summaryDetail}

Nhiệm vụ: Hãy viết một bài học kinh nghiệm cực kỳ ngắn gọn (dưới 50 từ) giải thích lý do tại sao mô hình dự đoán sai các kèo này (ví dụ: đánh giá quá cao hàng công, đánh giá sai tính chất thực dụng của giải đấu, bỏ qua tin tức chấn thương...).
Hãy trả về duy nhất nội dung bài học bằng tiếng Việt. Không thêm bất cứ tag hay ký tự dẫn dắt nào. Do NOT include markdown blocks.
`;

  console.log('📡 Đang gọi Gemini API để tạo bài học kinh nghiệm...');
  try {
    const aiInstance = new GoogleGenAI({ apiKey: geminiKey });
    const lessonRes = await aiInstance.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: lessonPrompt,
      config: { abortSignal: AbortSignal.timeout(15000) }
    });
    
    const lessonContent = lessonRes.text?.trim() || '';
    console.log(`🤖 AI trả về bài học: "${lessonContent}"`);
    
    if (lessonContent) {
      // Lưu vào SQLite
      console.log('💾 Đang lưu bài học vào bảng ai_lessons...');
      const runRes = await db.run(
        `INSERT INTO ai_lessons (match_id, team_name, bet_type, lesson_content) VALUES (?, ?, ?, ?)`,
        ['test-match-123', homeTeam, incorrectBets.join('/'), lessonContent]
      );
      const insertedId = runRes.lastID;
      console.log(`🟢 Đã lưu thành công! ID dòng mới: ${insertedId}`);
      
      // Query ngược lại để xác nhận
      const savedLesson = await db.get("SELECT * FROM ai_lessons WHERE id = ?", [insertedId]);
      console.log('🔍 Dữ liệu bài học đọc lại từ DB:');
      console.log(savedLesson);
      
      // Dọn dẹp dòng test này để tránh làm rác database
      await db.run("DELETE FROM ai_lessons WHERE id = ?", [insertedId]);
      console.log('🧹 Đã dọn dẹp dữ liệu test thành công.');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message);
  }
}

testRetrospective().catch(err => console.error(err));
