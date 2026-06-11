import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { createClient } from '@libsql/client';

// Đọc file .env.local để lấy biến môi trường
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim();
          env[key] = val;
        }
      }
    });
  }
  return env;
}

async function updateDb() {
  const env = loadEnv();
  
  const newPromptContent = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- DỰ ĐOÁN BAN ĐẦU TỪ CÁC MODEL AI ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng các dự đoán trên. Phát hiện và sửa đổi toàn bộ các lỗi mâu thuẫn logic suy luận (BẮT BUỘC TUÂN THỦ CÁC NGUYÊN TẮC NHẤT QUÁN LOGIC DƯỚI ĐÂY):
   - **Quy tắc Nhất quán 1X2 và Tỉ số:** Nếu tỉ số dự đoán của bạn chỉ ra một bên thắng (ví dụ: 1-0, 2-1 nghiêng về Home), thì khuyến nghị kèo 1X2 (recommendation_1x2) BẮT BUỘC phải là "Home" hoặc "Home or Draw", tuyệt đối không được phép là "Draw" hay "Away". Ngược lại, nếu tỉ số dự đoán là hòa (1-1, 0-0), kèo 1X2 phải chọn "Draw".
   - **Quy tắc Nhất quán kèo Tài Xỉu (Over/Under):** Nếu tổng số bàn thắng dự đoán nhỏ hơn mốc chấp (ví dụ: tỉ số 1-0, tổng = 1 bàn, mốc Over/Under là 2.25 hoặc 2.5), thì khuyến nghị kèo Tài Xỉu (recommendation_ou) BẮT BUỘC phải là "Under". Không bao giờ khuyên chọn "Over" khi tổng số bàn thắng thấp hơn mốc chấp.
   - **Quy tắc Nhất quán kèo chấp châu Á (Handicap):** Hãy so sánh tỉ số dự đoán của bạn với mốc chấp của nhà cái để xác định bên thắng kèo. Ví dụ: Nếu Mexico chấp 0.75 bàn (Mexico -0.75), và bạn dự đoán tỉ số là Mexico thắng 1-0 (chênh lệch 1 bàn, lớn hơn mức chấp 0.75), thì Mexico thắng kèo (ăn nửa tiền). Khuyến nghị cược Handicap phải khuyên chọn "Home" (hoặc "Mexico -0.75"), tuyệt đối không được khuyên chọn "Away" (South Africa +0.75).
   - **Quy tắc Phạt góc và Thẻ phạt:** Nhận định phạt góc và thẻ phạt phải nhất quán với lối chơi (ví dụ: đội hình 4-1-4-1 đánh trung lộ và lối chơi thận trọng của trận khai mạc thì nên ưu tiên Under phạt góc).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem các model trên có bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards) dựa trên thực tế.

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). 
Trong phần analysis.predictionReasoning, hãy ghi rõ: "[TINH CHỈNH PHẢN BIỆN]: <Lý do phản biện và những điểm đã tối ưu hóa so với các model>". 
LƯU Ý QUAN TRỌNG: Khi lập luận trong predictionReasoning, bạn PHẢI gọi tên cụ thể của từng model AI tham chiếu (ví dụ: 'gemini-3.1-flash-lite', 'meta-llama/llama-4-scout-17b-16e-instruct'...) thay vì sử dụng các từ chung chung như 'bản nháp 1', 'bản nháp 2', 'bản nháp trước'.

Lưu ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

  // 1. CẬP NHẬT DATABASE SQLITE LOCAL
  const localDbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Connecting to Local SQLite Database at: ${localDbPath}`);
  try {
    const db = await open({
      filename: localDbPath,
      driver: sqlite3.Database
    });
    const res = await db.run(
      `UPDATE system_prompts SET prompt_content = ?, last_updated = CURRENT_TIMESTAMP WHERE prompt_key = 'predict_critic_template'`,
      [newPromptContent]
    );
    console.log(`✅ [LOCAL SQLITE] Cập nhật thành công! (Số dòng thay đổi: ${res.changes})`);
    await db.close();
  } catch (err) {
    console.error(`❌ [LOCAL SQLITE ERROR] Lỗi khi cập nhật SQLite local:`, err.message);
  }

  // 2. CẬP NHẬT DATABASE TURSO PROD (libSQL Cloud)
  const tursoUrl = env.TURSO_DATABASE_URL;
  const tursoToken = env.TURSO_AUTH_TOKEN;
  
  if (tursoUrl) {
    console.log(`\n⚡ Connecting to Production Turso DB at: ${tursoUrl}`);
    try {
      const client = createClient({
        url: tursoUrl,
        authToken: tursoToken || ''
      });
      const res = await client.execute({
        sql: `UPDATE system_prompts SET prompt_content = ?, last_updated = CURRENT_TIMESTAMP WHERE prompt_key = 'predict_critic_template'`,
        args: [newPromptContent]
      });
      console.log(`✅ [TURSO PROD] Cập nhật thành công! (Số dòng thay đổi: ${res.rowsAffected})`);
    } catch (err) {
      console.error(`❌ [TURSO PROD ERROR] Lỗi khi cập nhật Turso DB:`, err.message);
    }
  } else {
    console.log('\nℹ️ Không phát hiện cấu hình TURSO_DATABASE_URL trong .env.local. Bỏ qua cập nhật Database Production.');
  }
}

updateDb();
