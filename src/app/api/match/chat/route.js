import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { v2 as cloudinary } from 'cloudinary';

// Helper xoay vòng API Key
async function callGeminiModel(model, apiKeys, contents) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          abortSignal: AbortSignal.timeout(40000), // Timeout sau 40 giây
          temperature: 0.2, // Tăng nhẹ tính tự nhiên khi tư vấn
        },
      });
      return {
        response,
        modelUsed: model,
        keyIndexUsed: keyIdx
      };
    } catch (err) {
      console.warn(`⚠️ [Match Chat AI Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');

    if (!matchId) {
      return NextResponse.json({ error: 'Thiếu matchId' }, { status: 400 });
    }

    const db = await getDB();
    const messages = await db.all(
      `SELECT sender, message, model_used, image_url, created_at FROM match_chats WHERE match_id = ? ORDER BY id ASC`,
      [matchId]
    );

    const formattedMessages = messages.map(msg => ({
      sender: msg.sender,
      message: msg.message,
      modelUsed: msg.model_used,
      imageUrl: msg.image_url,
      createdAt: msg.created_at
    }));

    return NextResponse.json({ success: true, messages: formattedMessages });
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử chat:', error);
    return NextResponse.json(
      { error: 'Không thể tải lịch sử chat', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { matchId, message, image, images } = await request.json();

    if (!matchId || ((!message || !message.trim()) && !image && (!images || images.length === 0))) {
      return NextResponse.json({ error: 'Thiếu thông tin yêu cầu' }, { status: 400 });
    }

    const db = await getDB();
    const cleanMessage = (message || '').trim();

    let imageUrls = [];
    if (images && Array.isArray(images) && images.length > 0) {
      const limitImages = images.slice(0, 10);
      try {
        const uploadPromises = limitImages.map(img => 
          cloudinary.uploader.upload(img, { folder: 'football-predict-chats' })
            .then(res => res.secure_url)
        );
        imageUrls = await Promise.all(uploadPromises);
        console.log('✅ Upload Cloudinary thành công cho các ảnh:', imageUrls);
      } catch (cloudinaryErr) {
        console.error('❌ Lỗi upload Cloudinary song song:', cloudinaryErr.message);
      }
    } else if (image) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(image, {
          folder: 'football-predict-chats',
        });
        imageUrls.push(uploadResponse.secure_url);
        console.log('✅ Upload Cloudinary thành công (tương thích ngược):', imageUrls[0]);
      } catch (cloudinaryErr) {
        console.error('❌ Lỗi upload Cloudinary (single image):', cloudinaryErr.message);
      }
    }

    const dbImageUrl = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null;

    // 1. Lưu tin nhắn của User vào DB
    await db.run(
      `INSERT INTO match_chats (match_id, sender, message, image_url) VALUES (?, 'user', ?, ?)`,
      [matchId, cleanMessage || '[Hình ảnh]', dbImageUrl]
    );

    // 2. Lấy thông tin trận đấu để làm context từ DB
    const dbFixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [matchId]);
    if (!dbFixture) {
      return NextResponse.json({ error: 'Không tìm thấy trận đấu' }, { status: 404 });
    }
    const match = {
      id: dbFixture.id,
      homeTeam: dbFixture.home_team,
      awayTeam: dbFixture.away_team,
      date: dbFixture.match_date,
      time: dbFixture.match_time,
      group: dbFixture.group_name,
      venue: dbFixture.venue,
      tournament: dbFixture.tournament,
      season: dbFixture.season
    };

    // Lấy thêm dự đoán gần nhất của trận đấu từ DB
    const prediction = await db.get(
      `SELECT * FROM predictions WHERE match_id = ? ORDER BY id DESC LIMIT 1`,
      [matchId]
    );

    let predictionContext = '';
    if (prediction) {
      predictionContext = `
- Nhận định dự kiến: Đội nhà thắng: ${prediction.win_prob_home}%, Hòa: ${prediction.win_prob_draw}%, Đội khách thắng: ${prediction.win_prob_away}%
- Tỷ số dự đoán của AI: ${prediction.predicted_home_score} - ${prediction.predicted_away_score}
- Đề xuất kèo 1X2: ${prediction.recommendation_1x2 || 'Không'}
- Đề xuất kèo Tài Xỉu (O/U): ${prediction.recommendation_ou || 'Không'} (Tỷ lệ O/U: ${prediction.ou_line || 2.5})
- Đề xuất kèo Chấp (Handicap): ${prediction.recommendation_handicap || 'Không'} (Tỷ lệ chấp: ${prediction.handicap_line || 0})
- Kết quả thực tế (nếu có): Đội nhà ${prediction.actual_home_score !== null ? prediction.actual_home_score : 'chưa có'} - ${prediction.actual_away_score !== null ? prediction.actual_away_score : 'chưa có'} Đội khách.
`;
    }

    // 3. Lấy 10 tin nhắn gần nhất làm lịch sử context đối thoại
    const historyRows = await db.all(
      `SELECT sender, message FROM match_chats WHERE match_id = ? ORDER BY id DESC LIMIT 10`,
      [matchId]
    );
    // Đảo ngược mảng để đúng thứ tự thời gian
    const historyList = [...historyRows].reverse();

    // 4. Xây dựng prompt gửi cho AI (Lấy từ Admin Prompt DB với Fallback an toàn)
    const dbPrompt = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'match_chat_system'");
    const template = dbPrompt ? dbPrompt.prompt_content : `Bạn là một trợ lý AI phân tích kèo bóng đá chuyên sâu. Hãy hỗ trợ tư vấn nhận định kèo cược cho người chơi dựa trên các thông số dữ liệu ELO, Poisson, Monte Carlo và tình huống thực tế của trận đấu sau.

--- THÔNG TIN TRẬN ĐẤU ---
- Trận đấu: {{homeTeam}} vs {{awayTeam}}
- Giải đấu: {{tournament}} | Mùa giải: {{season}}
- Thời gian: {{date}} lúc {{time}}
- Địa điểm: {{venue}}
{{predictionContext}}

--- HƯỚNG DẪN TƯ VẤN ---
1. Chỉ trả lời các câu hỏi liên quan đến trận đấu này, phong độ, chiến thuật, tình hình chấn thương, phân tích kèo cược thể thao.
2. Từ chối lịch sự nếu người dùng hỏi các chủ đề ngoài bóng đá hoặc các trận đấu không liên quan.
3. Câu trả lời cần ngắn gọn, rõ ràng, tập trung phân tích logic kèo và thực tế trận đấu để gợi ý lựa chọn tối ưu cho người chơi.`;

    const systemPrompt = template
      .replace(/{{homeTeam}}/g, match.homeTeam || '')
      .replace(/{{awayTeam}}/g, match.awayTeam || '')
      .replace(/{{tournament}}/g, match.tournament || 'Giải đấu khác')
      .replace(/{{season}}/g, match.season || 'Hiện tại')
      .replace(/{{date}}/g, match.date || '')
      .replace(/{{time}}/g, match.time || '')
      .replace(/{{venue}}/g, match.venue || 'Chưa rõ')
      .replace(/{{predictionContext}}/g, predictionContext || '');

    let conversationContext = '';
    if (historyList && historyList.length > 0) {
      conversationContext = '--- LỊCH SỬ TRÒ CHUYỆN GẦN ĐÂY ---\n' +
        historyList.map(h => `${h.sender === 'user' ? 'Người dùng' : 'AI'}: ${h.message}`).join('\n') +
        '\n\n';
    }

    const finalPrompt = `${systemPrompt}\n\n${conversationContext}Người dùng: ${cleanMessage}\nAI:`;

    // 5. Lấy danh sách Keys & Models xoay vòng từ SQLite
    const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
    const activeModelsRows = await db.all("SELECT model_name, provider, supports_image FROM ai_models WHERE status = 1 ORDER BY priority ASC");

    const geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));

    if (geminiKeys.length === 0) {
      throw new Error('Hệ thống chưa cấu hình API key Gemini.');
    }

    // Chọn model ưu tiên cao nhất của Gemini hoặc mặc định gemini-2.5-flash
    const activeGeminiModelObj = activeModelsRows.find(m => m.model_name.includes('gemini')) || { model_name: 'gemini-2.5-flash', provider: 'gemini', supports_image: 1 };
    const targetModel = activeGeminiModelObj.model_name.trim();
    const targetModelSupportsImage = activeGeminiModelObj.supports_image === 1;

    console.log(`💬 [Match Chat API] Đang gửi prompt chat cho trận ${match.homeTeam} vs ${match.awayTeam} sử dụng model: ${targetModel} (Hỗ trợ ảnh: ${targetModelSupportsImage})`);
    
    let requestContents = [];
    if (images && Array.isArray(images) && images.length > 0 && targetModelSupportsImage) {
      const limitImages = images.slice(0, 10);
      for (const imgBase64 of limitImages) {
        const matches = imgBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          requestContents.push({
            inlineData: {
              data: matches[2],
              mimeType: matches[1]
            }
          });
        }
      }
      requestContents.push(finalPrompt);
    } else if (image && targetModelSupportsImage) {
      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        requestContents = [
          {
            inlineData: {
              data: matches[2],
              mimeType: matches[1]
            }
          },
          finalPrompt
        ];
      }
    } else {
      requestContents = finalPrompt;
    }

    const aiResult = await callGeminiModel(targetModel, geminiKeys, requestContents);
    const replyText = aiResult.response.text.trim();

    // 6. Lưu câu trả lời của AI vào DB
    await db.run(
      `INSERT INTO match_chats (match_id, sender, message, model_used) VALUES (?, 'ai', ?, ?)`,
      [matchId, replyText, aiResult.modelUsed || targetModel]
    );

    return NextResponse.json({
      success: true,
      reply: replyText
    });
  } catch (error) {
    console.error('Lỗi trong tiến trình chat AI:', error);
    return NextResponse.json(
      { error: 'Lỗi xử lý phản hồi từ AI', details: error.message },
      { status: 500 }
    );
  }
}
