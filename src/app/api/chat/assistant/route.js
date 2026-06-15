import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { readLinkContent } from '@/lib/link-reader';

// Tắt hoàn toàn buffering của Next.js để stream hoạt động trơn tru
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const encoder = new TextEncoder();

  try {
    const { messages, pageContext } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Thiếu hoặc sai định dạng lịch sử tin nhắn' },
        { status: 400 }
      );
    }

    const db = await getDB();

    // 1. Lấy API keys của Gemini từ DB (đã tự động giải mã qua db wrapper)
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

    // 2. Lấy model Gemini ưu tiên từ DB
    const activeModelsRows = await db.all(
      "SELECT model_name FROM ai_models WHERE status = 1 AND (provider = 'gemini' OR provider IS NULL) ORDER BY priority ASC"
    );
    const activeModel = activeModelsRows[0]?.model_name || 'gemini-2.5-flash';

    // 3. Phân tích tin nhắn cuối cùng để tìm URL và đọc nội dung
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    let linkContext = '';
    
    if (lastUserMessage && lastUserMessage.content) {
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = lastUserMessage.content.match(urlRegex);
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

    // 4. Xây dựng System Instruction kèm ngữ cảnh trang hiện tại
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
4. Trình bày bằng tiếng Việt tự nhiên, sử dụng định dạng Markdown rõ ràng.`;

    // 5. Chuẩn bị danh sách contents cho Gemini API
    // Gemini SDK yêu cầu contents: array of { role: 'user'|'model', parts: [{ text: '...' }] }
    const geminiContents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // 6. Trả về ReadableStream để thực hiện Server-Sent Events (SSE)
    const customReadable = new ReadableStream({
      async start(controller) {
        let success = false;
        
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
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`));
              }
            }
            success = true;
            break; // Đã chạy thành công, thoát khỏi vòng lặp xoay key
          } catch (streamError) {
            console.warn(`⚠️ [CHAT ASSISTANT] Model ${activeModel} thất bại với Key #${i + 1}: ${streamError.message}`);
          }
        }

        if (!success) {
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
