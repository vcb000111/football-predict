import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

async function updateDb() {
  const dbPath = path.join(process.cwd(), 'worldcup_predictions.db');
  console.log(`Connecting to database at: ${dbPath}`);
  
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  const newPromptContent = `Bạn là một Chuyên gia Phản biện Bóng đá và Soi kèo cực kỳ khắt khe. Dưới đây là dự đoán ban đầu từ các mô hình AI khác nhau cho trận đấu giữa {{homeTeam}} và {{awayTeam}}:

--- DỰ ĐOÁN BAN ĐẦU TỪ CÁC MODEL AI ---
{{draftPrediction}}

--- NGỮ CẢNH BỔ SUNG (DỮ LIỆU ĐỊNH LƯỢNG & RAG SEARCH) ---
- Chỉ số ELO, Poisson & Monte Carlo: {{poissonMonteCarlo}}
- Thông tin Internet RAG: {{searchContext}}

Nhiệm vụ của bạn là:
1. Rà soát kỹ lưỡng các dự đoán trên. Tìm ra các lỗi logic suy luận (ví dụ: dự đoán đội nhà thắng ELO cao hơn nhưng lại đưa ra kèo Draw hoặc Away có tỷ lệ thắng cao hơn phi lý, hoặc dự kiến ít bàn thắng nhưng kèo Tài Xỉu khuyến nghị Over...).
2. Đối chiếu với thông tin chấn thương, phong độ và lịch sử đối đầu để kiểm chứng xem các model trên có bỏ sót yếu tố quan trọng nào không.
3. Tinh chỉnh lại xác suất thắng (phải đảm bảo tổng = 100%), tỷ số dự kiến và đề xuất các kèo cược tối ưu hơn (1X2, Over/Under, Handicap, BTTS, Corners, Cards).

Hãy trả về chuỗi JSON cuối cùng sau khi đã được tinh chỉnh hoàn hảo theo đúng định dạng cấu trúc cũ (winProbability, predictedScore, analysis, bets). 
Trong phần analysis.predictionReasoning, hãy ghi rõ: "[TINH CHỈNH PHẢN BIỆN]: <Lý do phản biện và những điểm đã tối ưu hóa so với các model>". 
LƯU Ý QUAN TRỌNG: Khi lập luận trong predictionReasoning, bạn PHẢI gọi tên cụ thể của từng model AI tham chiếu (ví dụ: 'gemini-3.1-flash-lite', 'meta-llama/llama-4-scout-17b-16e-instruct'...) thay vì sử dụng các từ chung chung như 'bản nháp 1', 'bản nháp 2', 'bản nháp trước'.

Lưu ý: Chỉ trả về chuỗi JSON thô, không nằm trong các thẻ code markdown hay ký tự thừa.`;

  try {
    const res = await db.run(
      `UPDATE system_prompts 
       SET prompt_content = ?, last_updated = CURRENT_TIMESTAMP 
       WHERE prompt_key = 'predict_critic_template'`,
      [newPromptContent]
    );
    
    if (res.changes > 0) {
      console.log('✅ Đã cập nhật thành công predict_critic_template trong SQLite!');
    } else {
      console.log('⚠️ Không tìm thấy bản ghi predict_critic_template để cập nhật.');
    }
  } catch (err) {
    console.error('❌ Lỗi khi cập nhật SQLite:', err.message);
  } finally {
    await db.close();
  }
}

updateDb();
