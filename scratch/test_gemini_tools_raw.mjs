import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { getDB } from '../src/lib/db.js';
import { GoogleGenAI } from '@google/genai';

const chatboxToolsDeclarations = [
  {
    functionDeclarations: [
      {
        name: 'search_internet',
        description: 'Tìm kiếm tin tức bóng đá tổng quát và thông tin trực tuyến mới nhất (như thời tiết, chấn thương cầu thủ...).',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: {
              type: 'STRING',
              description: 'Từ khóa tìm kiếm (Ví dụ: "Đức vs Curaçao ngày 15/6 chấn thương")'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'search_bookmaker_odds',
        description: 'Tìm kiếm tỷ lệ kèo cược (odds 1X2, handicap, over/under) thời gian thực của trận đấu từ các nhà cái uy tín.',
        parameters: {
          type: 'OBJECT',
          properties: {
            homeTeam: { type: 'STRING', description: 'Tên đội nhà (tiếng Anh)' },
            awayTeam: { type: 'STRING', description: 'Tên đội khách (tiếng Anh)' }
          },
          required: ['homeTeam', 'awayTeam']
        }
      },
      {
        name: 'query_fixtures',
        description: 'Truy vấn danh sách lịch thi đấu và kết quả thực tế các trận đấu bóng đá của đội bóng trong database hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội bóng cần tìm kiếm' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'query_predictions',
        description: 'Truy vấn lịch sử dự đoán kèo cược AI của đội bóng từ database hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội bóng cần tìm kiếm' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'query_team_details',
        description: 'Truy vấn thông tin thực lực chi tiết của đội tuyển (ELO, Rank FIFA, phong độ, đội hình, chiến thuật) từ database.',
        parameters: {
          type: 'OBJECT',
          properties: {
            searchTerm: { type: 'STRING', description: 'Tên đội tuyển cần tra cứu' }
          },
          required: ['searchTerm']
        }
      },
      {
        name: 'predict_match',
        description: 'Kích hoạt chạy phân tích dự đoán AI realtime cho một cặp đấu chưa diễn ra hoặc cần phân tích lại.',
        parameters: {
          type: 'OBJECT',
          properties: {
            homeTeam: { type: 'STRING', description: 'Tên đội nhà' },
            awayTeam: { type: 'STRING', description: 'Tên đội khách' },
            predictType: { type: 'STRING', enum: ['full_time', 'first_half', 'second_half'], description: 'Loại dự đoán' }
          },
          required: ['homeTeam', 'awayTeam']
        }
      },
      {
        name: 'update_match_result',
        description: 'Cập nhật kết quả tỷ số thực tế và tự động chấm điểm cược cho trận đấu đã kết thúc.',
        parameters: {
          type: 'OBJECT',
          properties: {
            matchId: { type: 'STRING', description: 'ID của trận đấu (Ví dụ: "m1", "m2")' }
          },
          required: ['matchId']
        }
      },
      {
        name: 'query_ai_accuracy_stats',
        description: 'Truy vấn và tính toán tỷ lệ dự đoán chính xác tổng quan (kèo 1X2, handicap, over/under) của AI hệ thống.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      },
      {
        name: 'query_current_match_context',
        description: 'Truy vấn dữ liệu chi tiết (Poisson, Monte Carlo, kèo cược) của trận đấu người dùng đang xem trên màn hình.',
        parameters: {
          type: 'OBJECT',
          properties: {
            matchId: { type: 'STRING', description: 'ID trận đấu đang xem' }
          },
          required: ['matchId']
        }
      },
      {
        name: 'query_hot_matches',
        description: 'Truy vấn danh sách các trận đấu tiêu điểm (ELO cao hoặc World Cup) sắp diễn ra trong vòng 48 giờ để gợi ý.',
        parameters: {
          type: 'OBJECT',
          properties: {}
        }
      }
    ]
  }
];

async function test() {
  const db = await getDB();
  const apiKeys = await db.all("SELECT id, status, provider, key_value FROM api_keys WHERE status = 1 AND provider = 'gemini' LIMIT 1");
  if (apiKeys.length === 0) {
    console.error('Không tìm thấy Gemini key nào.');
    return;
  }
  const key = apiKeys[0].key_value;
  const activeModelsRows = await db.all(
    "SELECT model_name FROM ai_models WHERE status = 1 AND provider = 'gemini' ORDER BY priority ASC"
  );
  const activeModel = activeModelsRows[0]?.model_name || 'gemini-2.5-flash';

  console.log(`Kiểm thử gọi generateContentStream kèm System Instruction và Tools...`);
  console.log(`Key ID: ${apiKeys[0].id}, Model: ${activeModel}`);

  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: activeModel,
      contents: [{ role: 'user', parts: [{ text: 'Đức đá trận tiếp theo khi nào?' }] }],
      config: {
        systemInstruction: 'Bạn là trợ lý thể thao. Trả lời ngắn gọn.',
        temperature: 0.7,
        tools: chatboxToolsDeclarations
      }
    });
    
    console.log('✅ Stream khởi tạo thành công. Đang đọc stream...');
    for await (const chunk of responseStream) {
      if (chunk.functionCalls) {
        console.log('Full Chunk with Function Calls:', JSON.stringify(chunk, null, 2));
      }
      if (chunk.text) {
        console.log('Text:', chunk.text);
      }
    }
    console.log('🎉 Stream hoàn tất!');
  } catch (err) {
    console.error('❌ Lỗi gọi generateContentStream:', err);
  }
}

test().catch(err => console.error(err));
