import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';
import { searchInternet } from '@/lib/search';

const MODELS = ['gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const FIXTURES_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'fixtures.json');

export async function POST(request) {
  try {
    // 1. Phân tích danh sách API Keys giống như trong predict API
    const apiKeysList = [];
    if (process.env.GEMINI_API_KEY) {
      apiKeysList.push(process.env.GEMINI_API_KEY.trim());
    }
    if (process.env.GEMINI_API_KEYS) {
      const splitKeys = process.env.GEMINI_API_KEYS.split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      apiKeysList.push(...splitKeys);
    }
    const numberedKeys = Object.keys(process.env)
      .filter((key) => key.startsWith('GEMINI_API_KEY_'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('GEMINI_API_KEY_', ''), 10);
        const numB = parseInt(b.replace('GEMINI_API_KEY_', ''), 10);
        return numA - numB;
      });
    numberedKeys.forEach((key) => {
      if (process.env[key]) {
        apiKeysList.push(process.env[key].trim());
      }
    });
    const apiKeys = Array.from(new Set(apiKeysList));

    // 2. Chế độ Giả lập (Mock Mode) khi không có API Key
    if (apiKeys.length === 0) {
      console.log(`\n💡 [MOCK MODE - SYNC FIXTURES] Không tìm thấy API Key. Chạy giả lập đồng bộ lịch thi đấu.`);

      // Bổ sung thêm 12 trận đấu mới (lượt 2 vòng bảng + vòng Knockout) vào danh sách hiện tại
      const mockNewFixtures = [
        {
          "id": "m13",
          "homeTeam": "Mexico",
          "awayTeam": "South Korea",
          "date": "2026-06-17",
          "time": "18:00",
          "group": "Group A",
          "venue": "Estadio Azteca, Mexico City"
        },
        {
          "id": "m14",
          "homeTeam": "South Africa",
          "awayTeam": "Czechia",
          "date": "2026-06-17",
          "time": "21:00",
          "group": "Group A",
          "venue": "BMO Field, Toronto"
        },
        {
          "id": "m15",
          "homeTeam": "Canada",
          "awayTeam": "Qatar",
          "date": "2026-06-18",
          "time": "17:00",
          "group": "Group B",
          "venue": "BMO Field, Toronto"
        },
        {
          "id": "m16",
          "homeTeam": "USA",
          "awayTeam": "Australia",
          "date": "2026-06-19",
          "time": "20:00",
          "group": "Group D",
          "venue": "SoFi Stadium, Los Angeles"
        },
        {
          "id": "m17",
          "homeTeam": "Brazil",
          "awayTeam": "Morocco",
          "date": "2026-06-20",
          "time": "15:00",
          "group": "Group C",
          "venue": "MetLife Stadium, East Rutherford"
        },
        {
          "id": "m18",
          "homeTeam": "Argentina",
          "awayTeam": "Austria",
          "date": "2026-06-20",
          "time": "18:00",
          "group": "Group J",
          "venue": "Hard Rock Stadium, Miami"
        },
        {
          "id": "m19",
          "homeTeam": "Germany",
          "awayTeam": "Côte d'Ivoire",
          "date": "2026-06-21",
          "time": "14:00",
          "group": "Group E",
          "venue": "Mercedes-Benz Stadium, Atlanta"
        },
        {
          "id": "m20",
          "homeTeam": "France",
          "awayTeam": "Norway",
          "date": "2026-06-21",
          "time": "17:00",
          "group": "Group I",
          "venue": "Lincoln Financial Field, Philadelphia"
        },
        {
          "id": "m21",
          "homeTeam": "Argentina",
          "awayTeam": "Portugal",
          "date": "2026-07-02",
          "time": "20:00",
          "group": "Round of 32",
          "venue": "SoFi Stadium, Los Angeles"
        },
        {
          "id": "m22",
          "homeTeam": "Brazil",
          "awayTeam": "Spain",
          "date": "2026-07-03",
          "time": "17:00",
          "group": "Round of 32",
          "venue": "MetLife Stadium, East Rutherford"
        },
        {
          "id": "m23",
          "homeTeam": "Germany",
          "awayTeam": "England",
          "date": "2026-07-04",
          "time": "16:00",
          "group": "Round of 32",
          "venue": "AT&T Stadium, Arlington"
        },
        {
          "id": "m24",
          "homeTeam": "France",
          "awayTeam": "Netherlands",
          "date": "2026-07-05",
          "time": "19:00",
          "group": "Round of 32",
          "venue": "Hard Rock Stadium, Miami"
        }
      ];

      const mergedFixtures = [...currentData.fixtures];
      mockNewFixtures.forEach((newF) => {
        const exists = mergedFixtures.some(
          (f) => f.id === newF.id || (f.homeTeam === newF.homeTeam && f.awayTeam === newF.awayTeam && f.date === newF.date)
        );
        if (!exists) {
          mergedFixtures.push(newF);
        }
      });

      const updatedData = {
        groups: currentData.groups,
        fixtures: mergedFixtures
      };

      // Ghi đè vào file fixtures.json
      fs.writeFileSync(FIXTURES_FILE_PATH, JSON.stringify(updatedData, null, 2), 'utf-8');

      return NextResponse.json({
        success: true,
        isMock: true,
        addedCount: mergedFixtures.length - currentData.fixtures.length,
        totalCount: mergedFixtures.length,
        modelUsed: 'Dự phòng / Mock',
        message: 'Đã giả lập đồng bộ thêm 12 trận đấu mới (gồm cả các trận Vòng 32 đội).'
      });
    }

    // 3. Chế độ Real Mode: Gọi Gemini AI cùng Search Grounding
    const prompt = `Hãy tìm kiếm lịch thi đấu chính thức đầy đủ và kết quả các trận đấu bóng đá của FIFA World Cup 2026.
Nhiệm vụ của bạn:
1. Sử dụng công cụ Google Search để tìm kiếm và quét thông tin lịch thi đấu World Cup 2026.
2. Trả về danh sách các trận đấu (gồm vòng bảng và các trận đấu tiếp theo hoặc kết quả nếu có).
   Chúng tôi cần danh sách trận đấu chuẩn xác để lưu vào cơ sở dữ liệu.
3. Xuất kết quả dưới định dạng JSON thô duy nhất theo cấu trúc sau (trả về khoảng 20-30 trận tiêu biểu của giải đấu để tránh quá giới hạn Token phản hồi):
{
  "fixtures": [
    {
      "id": "m_cụ_thể", // ví dụ: m1, m2... hoặc chuỗi id tự sinh không trùng
      "homeTeam": "<Tên tiếng Anh chuẩn của đội nhà, ví dụ: Mexico, USA, Brazil...>",
      "awayTeam": "<Tên tiếng Anh chuẩn của đội khách, ví dụ: South Africa, Spain, England...>",
      "date": "<Ngày diễn ra định dạng YYYY-MM-DD>",
      "time": "<Giờ thi đấu định dạng HH:MM>",
      "group": "<Tên bảng hoặc vòng đấu, ví dụ: 'Group A', 'Group B', hoặc 'Round of 32', 'Round of 16'>",
      "venue": "<Tên sân vận động và thành phố>"
    }
  ]
}

Chú ý: Chỉ trả về chuỗi JSON thô, không chứa markdown, không có chữ thừa. Hãy giữ nguyên các tên quốc gia chuẩn tiếng Anh trùng khớp với các đội trong World Cup.`;

    let searchContext = '';
    try {
      const searchResults = await searchInternet('FIFA World Cup 2026 official match schedule dates venues matches 1 to 12');
      console.log(`   - 🔍 [RAG SEARCH RESULTS] Đã tìm thấy ${searchResults?.length || 0} kết quả lịch thi đấu:`);
      if (searchResults && searchResults.length > 0) {
        searchResults.forEach((s, idx) => {
          console.log(`     [${idx + 1}] ${s}`);
        });
        searchContext = `
--- THÔNG TIN LỊCH THI ĐẤU TRA CỨU TỪ INTERNET (THỰC TẾ) ---
Dưới đây là các kết quả tìm kiếm thực tế về lịch thi đấu từ internet:
${searchResults.map((s, idx) => `[${idx + 1}] ${s}`).join('\n')}
`;
      } else {
        console.log(`     ⚠️ Cảnh báo: Không tìm thấy lịch thi đấu chính thức nào trực tuyến.`);
      }
    } catch (searchErr) {
      console.warn('⚠️ Lỗi khi tra cứu internet cho đồng bộ lịch đấu:', searchErr.message);
    }

    const finalPrompt = prompt + '\n' + searchContext;

    let callResult = null;
    let lastError = null;

    for (let modelIdx = 0; modelIdx < MODELS.length; modelIdx++) {
      const currentModel = MODELS[modelIdx];
      for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
        const currentKey = apiKeys[keyIdx];
        const startTime = Date.now();
        try {
          console.log(`\n🤖 [AI REQUEST - SYNC FIXTURES] Gọi AI đồng bộ lịch thi đấu World Cup 2026`);
          console.log(`   - Model: ${currentModel}`);
          console.log(`   - API Key: #${keyIdx + 1}/${apiKeys.length}`);
          console.log(`   - Custom Search RAG: Bật (DuckDuckGo/Tavily)`);
          
          const ai = new GoogleGenAI({ apiKey: currentKey });
          
          const response = await ai.models.generateContent({
            model: currentModel,
            contents: finalPrompt,
            config: {
              abortSignal: AbortSignal.timeout(45000), // 45s timeout
            },
          });
          
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`🟢 [AI RESPONSE - SYNC FIXTURES] Thành công!`);
          console.log(`   - Model đã trả lời: ${currentModel}`);
          console.log(`   - Thời gian phản hồi: ${duration}s`);
          console.log(`   - Độ dài phản hồi: ${response.text?.length || 0} ký tự`);
          
          callResult = { response, modelUsed: currentModel };
          break;
        } catch (err) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.warn(`🔴 [AI ERROR - SYNC FIXTURES] Thất bại với model ${currentModel} bằng Key #${keyIdx + 1} (sau ${duration}s):`, err.message);
          lastError = err;
        }
      }
      if (callResult) break;
    }

    if (!callResult) {
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const { response } = callResult;
    const text = response.text;
    let syncData;

    const cleanJsonText = (rawText) => {
      if (!rawText) return '';
      let cleaned = rawText.trim();
      
      // Try to extract content inside markdown code block if present
      const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        cleaned = codeBlockMatch[1].trim();
      }
      
      // Find the first and last structural characters matching {} or []
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      let start = -1;
      let end = -1;
      
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = cleaned.lastIndexOf('}');
      } else if (firstBracket !== -1) {
        start = firstBracket;
        end = cleaned.lastIndexOf(']');
      }
      
      if (start !== -1 && end !== -1 && end > start) {
        return cleaned.substring(start, end + 1);
      }
      
      return cleaned;
    };

    try {
      syncData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      console.error('Lỗi parse JSON lịch thi đấu đồng bộ:', text);
      return NextResponse.json(
        { error: 'Dữ liệu lịch thi đấu trả về từ AI không đúng định dạng JSON.', raw: text },
        { status: 500 }
      );
    }

    const newFixtures = syncData.fixtures || [];
    if (newFixtures.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'AI không trả về trận đấu mới nào từ Google Search.'
      });
    }

    // Gộp lịch thi đấu cũ và mới
    const mergedFixtures = [...currentData.fixtures];
    newFixtures.forEach((newF) => {
      const exists = mergedFixtures.some(
        (f) =>
          f.id === newF.id ||
          (f.homeTeam === newF.homeTeam && f.awayTeam === newF.awayTeam && f.date === newF.date)
      );
      if (!exists) {
        if (!newF.id) {
          newF.id = `m${mergedFixtures.length + 1}`;
        }
        mergedFixtures.push(newF);
      }
    });

    const updatedData = {
      groups: currentData.groups,
      fixtures: mergedFixtures
    };

    // Ghi lại vào file fixtures.json
    fs.writeFileSync(FIXTURES_FILE_PATH, JSON.stringify(updatedData, null, 2), 'utf-8');

    return NextResponse.json({
      success: true,
      isMock: false,
      addedCount: mergedFixtures.length - currentData.fixtures.length,
      totalCount: mergedFixtures.length,
      modelUsed: callResult.modelUsed,
      message: `Đồng bộ thành công! Đã chèn thêm ${mergedFixtures.length - currentData.fixtures.length} trận đấu chính thức mới từ Internet.`
    });

  } catch (error) {
    console.error('Lỗi khi đồng bộ lịch thi đấu:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi đồng bộ lịch thi đấu', details: error.message },
      { status: 500 }
    );
  }
}
