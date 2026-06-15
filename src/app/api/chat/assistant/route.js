import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import { getDB } from '@/lib/db';
import { readLinkContent } from '@/lib/link-reader';
import { verifyToken } from '@/lib/auth-helper';

// Tắt hoàn toàn buffering của Next.js để stream hoạt động trơn tru
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const encoder = new TextEncoder();

  try {
    const { messages, pageContext, images } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Thiếu hoặc sai định dạng lịch sử tin nhắn' },
        { status: 400 }
      );
    }

    const db = await getDB();

    // 1. Xác định trạng thái đăng nhập của người dùng qua JWT Cookie
    let userId = null;
    const cookiesHeader = request.headers.get('cookie') || '';
    const tokenCookie = cookiesHeader
      .split(';')
      .find(c => c.trim().startsWith('auth_token='));

    if (tokenCookie) {
      const token = tokenCookie.split('=')[1];
      const decoded = verifyToken(token);
      if (decoded && decoded.userId) {
        userId = decoded.userId;
      }
    }

    // 2. Lấy API keys của Gemini từ DB (đã tự động giải mã qua db wrapper)
    const activeKeysRows = await db.all(
      "SELECT key_value FROM api_keys WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL)"
    );
    const geminiKeys = activeKeysRows.map(row => row.key_value.trim()).filter(Boolean);

    if (geminiKeys.length === 0) {
      return NextResponse.json(
        { error: 'Hệ thống chưa cấu hình hoặc chưa bật API key Gemini.' },
        { status: 500 }
      );
    }

    // 3. Lấy model Gemini ưu tiên từ DB
    const activeModelsRows = await db.all(
      "SELECT model_name, supports_image FROM ai_models WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL) ORDER BY priority ASC"
    );
    const activeModelObj = activeModelsRows[0] || { model_name: 'gemini-2.5-flash', supports_image: 1 };
    const activeModel = activeModelObj.model_name;
    const modelSupportsImage = activeModelObj.supports_image === 1;

    // 4. Xử lý upload ảnh lên Cloudinary (nếu có)
    let imageUrls = [];
    if (images && Array.isArray(images) && images.length > 0) {
      try {
        console.log(`[CHAT ASSISTANT] Đang upload ${images.length} ảnh lên Cloudinary...`);
        const uploadPromises = images.map(imgBase64 =>
          cloudinary.uploader.upload(imgBase64, { folder: 'football-predict-chats' })
            .then(res => res.secure_url)
        );
        imageUrls = await Promise.all(uploadPromises);
        console.log('[CHAT ASSISTANT] Upload Cloudinary thành công:', imageUrls);
      } catch (cloudinaryErr) {
        console.error('[CHAT ASSISTANT] Lỗi upload Cloudinary:', cloudinaryErr.message);
      }
    }

    // 5. Phân tích tin nhắn cuối cùng để tìm URL và đọc nội dung
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const userText = lastUserMessage?.content || '';
    let linkContext = '';
    
    if (userText) {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = userText.match(urlRegex);
      if (urls && urls.length > 0) {
        const targetUrl = urls[0];
        console.log(`[CHAT ASSISTANT] Phát hiện URL trong tin nhắn: ${targetUrl}`);
        try {
          const content = await readLinkContent(targetUrl);
          if (content) {
            linkContext = `\n\n--- DỮ LIỆU ĐỌC ĐƯỢC TỪ LIÊN KẾT (${targetUrl}) ---\n${content}\n--- HẾT DỮ LIỆU LIÊN KẾT ---`;
          }
        } catch (linkErr) {
          console.error('[CHAT ASSISTANT] Lỗi đọc liên kết:', linkErr);
        }
      }
    }

    // 6. Xây dựng System Instruction kèm ngữ cảnh trang hiện tại
    let systemInstruction = `Bạn là Trợ lý AI phân tích thể thao và soi kèo bóng đá World Cup 2026 chính thức của hệ thống. 
Nhiệm vụ của bạn là giải đáp thắc mắc, phân tích phong độ đội bóng, tính toán tỷ lệ cược dựa trên Poisson/ELO, gợi ý soi kèo (1X2, Tài Xỉu, Chấp Châu Á) chuyên nghiệp.

`;

    if (pageContext) {
      systemInstruction += `--- NGỮ CẢNH TRANG NGƯỜI DÙNG ĐANG XEM ---
- **Đường dẫn hiện tại:** ${pageContext.url || 'Chưa rõ'}
- **Tiêu đề trang:** ${pageContext.title || 'Chưa rõ'}
- **Nội dung hiển thị trên trang:** ${pageContext.content || 'Không có thông tin chi tiết.'}
----------------------------------------
Hãy linh hoạt sử dụng ngữ cảnh trang trên để trả lời nếu người dùng hỏi những câu như "Trang này nói về cái gì?", "Phân tích trận đấu này", hoặc "Giải thích kèo hiển thị ở đây".
`;
    }

    if (linkContext) {
      systemInstruction += linkContext;
    }

    systemInstruction += `\n\n--- QUY TẮC PHẢN HỒI ---
1. Trả lời ngắn gọn, chuyên nghiệp, thông thái, tập trung chuyên môn bóng đá.
2. Viết hoa theo đúng định dạng Sentence case cho các thuật ngữ và đề mục hiển thị.
3. Nếu người dùng hỏi ngoài phạm vi bóng đá và giải đấu, lịch sự từ chối và hướng họ quay lại phân tích thể thao.
4. Trình bày bằng tiếng Việt tự nhiên, sử dụng định dạng Markdown rõ ràng.
5. **Chain of Thought (Tư duy từng bước):** Phân tích kỹ lưỡng, đối chiếu dữ liệu trong đầu trước khi viết câu trả lời. Đặc biệt, hãy kiểm tra và xác nhận tính chính xác của tất cả các con số (tỷ số, tỷ lệ, ngày giờ).
6. **Độ chính xác dữ liệu trận đấu:** Khi phân tích trận đấu có chứa cả "Kết quả thực tế" và "Dự đoán tỉ số", phải đối chiếu cẩn thận và viết chính xác. Tuyệt đối không được hoán đổi hoặc nhầm lẫn giữa kết quả thực tế và dự đoán của AI.`;

    // 7. Chuẩn bị danh sách contents cho Gemini API
    const geminiContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Thêm các ảnh đính kèm vào tin nhắn cuối của người dùng nếu model hỗ trợ
    if (images && images.length > 0 && modelSupportsImage && geminiContents.length > 0) {
      const lastIndex = geminiContents.length - 1;
      images.forEach(imgBase64 => {
        const matches = imgBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          geminiContents[lastIndex].parts.unshift({
            inlineData: {
              data: matches[2],
              mimeType: matches[1]
            }
          });
        }
      });
    }

    // 8. Lưu tin nhắn của người dùng vào DB (nếu đã đăng nhập)
    if (userId && userText) {
      await db.run(
        'INSERT INTO assistant_chats (user_id, sender, message, model_used, image_url) VALUES (?, ?, ?, ?, ?)',
        [userId, 'user', userText, activeModel, imageUrls.length > 0 ? JSON.stringify(imageUrls) : null]
      );
    }

    // 9. Trả về ReadableStream để thực hiện Server-Sent Events (SSE) và lưu tin nhắn AI
    const customReadable = new ReadableStream({
      async start(controller) {
        let success = false;
        let accumulatedText = '';
        
        // Thử xoay vòng các API key
        for (let i = 0; i < geminiKeys.length; i++) {
          const currentKey = geminiKeys[i];
          try {
            const ai = new GoogleGenAI({ apiKey: currentKey });
            const responseStream = await ai.models.generateContentStream({
              model: activeModel,
              contents: geminiContents,
              config: {
                systemInstruction: systemInstruction,
                temperature: 0.7
              }
            });

            for await (const chunk of responseStream) {
              const chunkText = chunk.text;
              if (chunkText) {
                accumulatedText += chunkText;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`));
              }
            }
            success = true;
            break; // Đã chạy thành công, thoát khỏi vòng lặp xoay key
          } catch (streamError) {
            console.warn(`⚠️ [CHAT ASSISTANT] Model ${activeModel} thất bại với Key #${i + 1}: ${streamError.message}`);
          }
        }

        if (success) {
          // Lưu câu trả lời của AI vào DB nếu đã đăng nhập
          if (userId && accumulatedText) {
            try {
              await db.run(
                'INSERT INTO assistant_chats (user_id, sender, message, model_used) VALUES (?, ?, ?, ?)',
                [userId, 'ai', accumulatedText, activeModel]
              );
              console.log('[CHAT ASSISTANT] Đã lưu phản hồi AI vào database thành công.');
            } catch (dbErr) {
              console.error('[CHAT ASSISTANT] Lỗi lưu phản hồi AI vào DB:', dbErr.message);
            }
          }
        } else {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Tất cả API keys của Gemini đều lỗi hoặc hết hạn.' })}\n\n`)
          );
        }
        controller.close();
      }
    });

    return new NextResponse(customReadable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      }
    });

  } catch (err) {
    console.error('[CHAT ASSISTANT ERROR] Lỗi API assistant:', err);
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi khi kết nối với máy chủ.' },
      { status: 500 }
    );
  }
}
