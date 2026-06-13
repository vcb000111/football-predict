import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import currentData from '@/data/fixtures.json';
import { searchInternet } from '@/lib/search';
import { getDB } from '@/lib/db';
import { callOpenRouterModel } from '@/lib/openrouter';

const FIXTURES_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'fixtures.json');

// Hàm helper gọi đơn lẻ một model Gemini
async function callGeminiModel(model, apiKeys, prompt) {
  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(45000), // Timeout sau 45 giây
          temperature: 0,
        },
      });
      return {
        response,
        modelUsed: model,
        keyIndexUsed: keyIdx
      };
    } catch (err) {
      console.warn(`⚠️ [AI Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

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

export async function POST(request) {
  try {
    // 1. Phân tích tham số Giải đấu và Mùa giải
    let requestData = {};
    try {
      requestData = await request.json();
    } catch (e) {}
    
    const { tournament = 'World Cup 2026', season = '2026' } = requestData;

    // 2. Phân tích danh sách API Keys và Models từ SQLite
    let db = null;
    let geminiKeys = [];
    let openrouterKeys = [];
    let combinedModels = [];

    try {
      db = await getDB();
      const activeKeysRows = await db.all("SELECT key_value, provider FROM api_keys WHERE status = 1");
      const activeModelsRows = await db.all("SELECT model_name, provider FROM ai_models WHERE status = 1 ORDER BY priority ASC");
      
      geminiKeys = Array.from(new Set(activeKeysRows.filter(r => (r.provider || 'gemini') === 'gemini').map(row => row.key_value.trim())));
      openrouterKeys = Array.from(new Set(activeKeysRows.filter(r => r.provider === 'openrouter').map(row => row.key_value.trim())));
      
      combinedModels = activeModelsRows.map(row => ({
        name: row.model_name.trim(),
        provider: row.provider || 'gemini'
      }));
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // Fallback: nếu db rỗng thì đọc từ biến môi trường
    if (geminiKeys.length === 0 && openrouterKeys.length === 0) {
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
      geminiKeys = Array.from(new Set(apiKeysList));
      
      if (geminiKeys.length > 0) {
        combinedModels = [
          { name: 'gemini-2.5-flash', provider: 'gemini' },
          { name: 'gemini-1.5-flash', provider: 'gemini' }
        ];
      }
    }

    // 3. Chế độ Giả lập (Mock Mode) khi không có API Key nào khả dụng
    if (geminiKeys.length === 0 && openrouterKeys.length === 0) {
      console.log(`\n💡 [MOCK MODE - SYNC FIXTURES] Không tìm thấy API Key. Chạy giả lập lấy lịch thi đấu.`);

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

      // Gắn thông tin giải đấu và mùa giải động được yêu cầu
      const processedMock = mockNewFixtures.map(f => ({
        ...f,
        tournament,
        season
      }));

      // Lọc các trận chưa tồn tại trong fixtures.json
      const newFixtures = processedMock.filter((newF) => {
        return !currentData.fixtures.some(
          (f) => f.id === newF.id || (f.homeTeam === newF.homeTeam && f.awayTeam === newF.awayTeam && f.date === newF.date)
        );
      });

      return NextResponse.json({
        success: true,
        isMock: true,
        newFixtures,
        modelUsed: 'Dự phòng / Mock',
        message: `Lấy lịch thi đấu giả lập thành công (Đã tìm thấy ${newFixtures.length} trận đấu mới).`
      });
    }

    // 4. Chế độ Real Mode: Gọi AI cùng RAG Search Grounding
    let aiPrompt = '';
    const fallbackPrompt = `Hãy tìm kiếm lịch thi đấu chính thức đầy đủ và kết quả các trận đấu bóng đá của giải đấu ${tournament} mùa giải ${season}.
Nhiệm vụ của bạn:
1. Sử dụng thông tin tra cứu bên dưới để lấy thông tin lịch thi đấu chính thức.
2. Trả về danh sách các trận đấu (gồm vòng bảng và các trận đấu tiếp theo hoặc kết quả nếu có).
   Chúng tôi cần danh sách trận đấu chuẩn xác để lưu vào cơ sở dữ liệu.
3. Xuất kết quả dưới định dạng JSON thô duy nhất theo cấu trúc sau (trả về khoảng 20-30 trận tiêu biểu của giải đấu để tránh quá giới hạn Token phản hồi):
{
  "fixtures": [
    {
      "id": "m_cụ_thể", // ví dụ: m1, m2... hoặc chuỗi id tự sinh không trùng
      "homeTeam": "<Tên tiếng Anh chuẩn của đội nhà, ví dụ: Arsenal, Chelsea, Real Madrid, Mexico, USA, Brazil...>",
      "awayTeam": "<Tên tiếng Anh chuẩn của đội khách, ví dụ: South Africa, Spain, England...>",
      "date": "<Ngày diễn ra định dạng YYYY-MM-DD>",
      "time": "<Giờ thi đấu định dạng HH:MM>",
      "group": "<Tên bảng hoặc vòng đấu, ví dụ: 'Group A', 'Group B', hoặc 'Round of 32', 'Matchweek 1', 'Round of 16'>",
      "venue": "<Tên sân vận động và thành phố>"
    }
  ]
}

Chú ý: Chỉ trả về chuỗi JSON thô, không chứa markdown, không có chữ thừa. Hãy giữ nguyên các tên quốc gia/đội bóng chuẩn tiếng Anh.`;

    try {
      if (!db) {
        db = await getDB();
      }
      const dbPrompt = await db.get("SELECT prompt_content FROM system_prompts WHERE prompt_key = 'sync_fixtures_template'");
      if (dbPrompt && dbPrompt.prompt_content) {
        aiPrompt = dbPrompt.prompt_content
          .replace(/\{\{tournament\}\}/g, tournament)
          .replace(/\{\{season\}\}/g, season);
      } else {
        aiPrompt = fallbackPrompt;
      }
    } catch (dbPromptError) {
      console.warn('⚠️ Lỗi khi đọc prompt sync_fixtures_template từ DB, sử dụng fallback:', dbPromptError.message);
      aiPrompt = fallbackPrompt;
    }

    let searchContext = '';
    const searchQuery = `${tournament} ${season} official match schedule dates venues matches`;
    try {
      const searchResults = await searchInternet(searchQuery);
      console.log(`   - 🔍 [RAG SEARCH RESULTS] Đã tìm thấy ${searchResults?.length || 0} kết quả lịch thi đấu cho "${searchQuery}":`);
      if (searchResults && searchResults.length > 0) {
        searchContext = `
--- THÔNG TIN LỊCH THI ĐẤU TRA CỨU TỪ INTERNET (THỰC TẾ) ---
Dưới đây là các kết quả tìm kiếm thực tế về lịch thi đấu từ internet:
${searchResults.slice(0, 6).map((s, idx) => `[${idx + 1}] ${s}`).join('\n')}
`;
      } else {
        console.log(`     ⚠️ Cảnh báo: Không tìm thấy lịch thi đấu chính thức nào trực tuyến.`);
      }
    } catch (searchErr) {
      console.warn('⚠️ Lỗi khi tra cứu internet cho đồng bộ lịch đấu:', searchErr.message);
    }

    const finalPrompt = aiPrompt + '\n' + searchContext;

    let callResult = null;
    let lastError = null;

    for (const modelInfo of combinedModels) {
      const { name: modelName, provider } = modelInfo;
      const startTime = Date.now();
      try {
        console.log(`\n🤖 [AI REQUEST - SYNC FIXTURES] Gọi AI đồng bộ lịch thi đấu`);
        console.log(`   - Model: ${modelName} (${provider})`);
        
        let responseText = '';
        if (provider === 'gemini' && geminiKeys.length > 0) {
          const result = await callGeminiModel(modelName, geminiKeys, finalPrompt);
          responseText = result.response.text;
          callResult = { text: responseText, modelUsed: modelName, provider };
        } else if (provider === 'openrouter' && openrouterKeys.length > 0) {
          const result = await callOpenRouterModel(modelName, openrouterKeys, finalPrompt);
          responseText = result.response.text;
          callResult = { text: responseText, modelUsed: modelName, provider };
        }
        
        if (callResult) {
          const duration = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`🟢 [AI RESPONSE - SYNC FIXTURES] Thành công!`);
          console.log(`   - Model: ${modelName} (${provider}) trong ${duration}s`);
          break;
        }
      } catch (err) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.warn(`🔴 [AI ERROR - SYNC FIXTURES] Thất bại với model ${modelName} (${provider}) sau ${duration}s:`, err.message);
        lastError = err;
      }
    }

    if (!callResult) {
      throw lastError || new Error('Không có API Key hoặc Model nào hoạt động thành công.');
    }

    const text = callResult.text;
    let syncData;

    try {
      syncData = JSON.parse(cleanJsonText(text));
    } catch (parseError) {
      console.error('Lỗi parse JSON lịch thi đấu đồng bộ:', text);
      return NextResponse.json(
        { error: 'Dữ liệu lịch thi đấu trả về từ AI không đúng định dạng JSON.', raw: text },
        { status: 500 }
      );
    }

    const aiFixtures = syncData.fixtures || [];
    if (aiFixtures.length === 0) {
      return NextResponse.json({
        success: false,
        newFixtures: [],
        message: 'AI không trả về trận đấu mới nào từ Google Search.'
      });
    }

    // Gán giải đấu, mùa giải động cho dữ liệu trả về từ AI
    const processedFixtures = aiFixtures.map(f => ({
      ...f,
      tournament,
      season
    }));

    // Lọc ra danh sách các trận đấu thực sự mới chưa tồn tại trong fixtures.json
    const newFixtures = processedFixtures.filter((newF) => {
      return !currentData.fixtures.some(
        (f) =>
          f.id === newF.id ||
          (f.homeTeam === newF.homeTeam && f.awayTeam === newF.awayTeam && f.date === newF.date)
      );
    });

    return NextResponse.json({
      success: true,
      isMock: false,
      newFixtures,
      modelUsed: callResult.modelUsed,
      message: `Quét thành công! Tìm thấy ${newFixtures.length} trận đấu mới.`
    });

  } catch (error) {
    console.error('Lỗi khi đồng bộ lịch thi đấu:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi đồng bộ lịch thi đấu', details: error.message },
      { status: 500 }
    );
  }
}
