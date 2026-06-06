import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getDB } from '@/lib/db';
import { searchInternet } from '@/lib/search';

// Gọi model AI để trích xuất JSON
async function extractTeamStatsWithAI(teamName, currentData, model, apiKeys, searchContext) {
  const prompt = `Bạn là một chuyên gia phân tích dữ liệu bóng đá hàng đầu thế giới.
Nhiệm vụ của bạn là cập nhật các chỉ số thực lực cho đội tuyển quốc gia: **${teamName}**.

Dưới đây là thông tin tìm kiếm mới nhất từ Internet về đội tuyển này:
${searchContext}

Hãy phân tích thông tin trên và trả về kết quả dưới dạng một đối tượng JSON duy nhất có cấu trúc chính xác như sau:
{
  "fifa_rank": ${currentData.fifa_rank || 50}, // Số nguyên, thứ hạng FIFA hiện tại của đội. Nếu tìm thấy thông tin mới hơn trên internet thì cập nhật, nếu không dùng giá trị hiện tại.
  "elo_rating": ${currentData.elo_rating || 1600}, // Số nguyên, điểm ELO hiện tại của đội. Nếu tìm thấy thông tin mới hơn thì cập nhật, nếu không dùng giá trị hiện tại.
  "recent_form": "${currentData.recent_form || 'D,D,D,D,D'}", // Chuỗi dạng W,D,L thể hiện phong độ 5 trận gần nhất, ví dụ "W,D,W,L,W". Cần viết hoa.
  "avg_goals_scored": ${currentData.avg_goals_scored || 1.2}, // Số thực, số bàn thắng trung bình mỗi trận trong 10 trận gần nhất.
  "avg_goals_conceded": ${currentData.avg_goals_conceded || 1.2}, // Số thực, số bàn thua trung bình mỗi trận trong 10 trận gần nhất.
  "key_players": "${(currentData.key_players || 'Đang cập nhật').replace(/"/g, '\\"')}", // Danh sách cầu thủ ngôi sao nổi bật nhất, cách nhau bởi dấu phẩy.
  "tactical_analysis": "${(currentData.tactical_analysis || 'Đang cập nhật').replace(/"/g, '\\"')}" // Phân tích chiến thuật ngắn gọn (1-2 câu) về lối chơi và sơ đồ ưa thích hiện tại.
}

Chú ý quan trọng:
1. TRẢ VỀ DUY NHẤT MỘT KHỐI JSON HỢP LỆ. KHÔNG thêm bất kỳ giải thích, tiêu đề, mở bài, kết bài hay mã Markdown nào khác ngoài khối JSON.
2. Dữ liệu trích xuất phải chính xác từ ngữ cảnh tìm kiếm.
3. Không trả về giá trị null hay undefined. Sử dụng giá trị mặc định được cung cấp ở trên nếu không tìm thấy dữ liệu mới hơn.
4. Đảm bảo recent_form có định dạng đúng chuẩn các ký tự W, D, L cách nhau bằng dấu phẩy (ví dụ: W,D,W,L,W).`;

  let lastError = null;
  for (let keyIdx = 0; keyIdx < apiKeys.length; keyIdx++) {
    const currentKey = apiKeys[keyIdx];
    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          abortSignal: AbortSignal.timeout(25000), // Timeout sau 25 giây
        },
      });

      const text = response.text || '';
      // Tìm khối JSON trong text (phòng trường hợp AI trả về markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[0];
        const parsed = JSON.parse(jsonStr);
        
        // Validate và làm sạch dữ liệu trước khi trả về
        return {
          fifa_rank: parseInt(parsed.fifa_rank, 10) || currentData.fifa_rank || 50,
          elo_rating: parseInt(parsed.elo_rating, 10) || currentData.elo_rating || 1600,
          recent_form: typeof parsed.recent_form === 'string' && /^[WwDdLl](,[WwDdLl]){0,4}$/.test(parsed.recent_form) 
            ? parsed.recent_form.toUpperCase() 
            : currentData.recent_form || 'D,D,D,D,D',
          avg_goals_scored: parseFloat(parsed.avg_goals_scored) >= 0 ? parseFloat(parsed.avg_goals_scored) : currentData.avg_goals_scored || 1.2,
          avg_goals_conceded: parseFloat(parsed.avg_goals_conceded) >= 0 ? parseFloat(parsed.avg_goals_conceded) : currentData.avg_goals_conceded || 1.2,
          key_players: parsed.key_players ? parsed.key_players.trim() : currentData.key_players || 'Đang cập nhật',
          tactical_analysis: parsed.tactical_analysis ? parsed.tactical_analysis.trim() : currentData.tactical_analysis || 'Đang cập nhật'
        };
      }
      throw new Error("Không thể bóc tách cấu trúc JSON từ phản hồi của AI.");
    } catch (err) {
      console.warn(`⚠️ [AI Update Call] Model ${model} thất bại với Key #${keyIdx + 1}:`, err.message);
      lastError = err;
    }
  }
  
  throw lastError || new Error(`Tất cả keys đều thất bại cho model ${model}`);
}

export async function POST(request) {
  try {
    const { teamNames } = await request.json();

    if (!teamNames || (Array.isArray(teamNames) && teamNames.length === 0)) {
      return NextResponse.json(
        { error: 'Thiếu thông tin danh sách đội tuyển cần cập nhật' },
        { status: 400 }
      );
    }

    const db = await getDB();
    
    // Lấy API Keys và Model AI hoạt động từ SQLite
    let apiKeys = [];
    let activeModel = 'gemini-3.5-flash';

    try {
      const activeKeysRows = await db.all("SELECT key_value FROM api_keys WHERE status = 1");
      apiKeys = Array.from(new Set(activeKeysRows.map(row => row.key_value.trim())));
      const activeModelRow = await db.get("SELECT model_name FROM ai_models WHERE status = 1 ORDER BY priority ASC LIMIT 1");
      if (activeModelRow) activeModel = activeModelRow.model_name.trim();
    } catch (dbInitError) {
      console.error('Lỗi khi tải API keys/models từ SQLite:', dbInitError);
    }

    // Nếu không có API key trong DB, thử lấy từ biến môi trường
    if (apiKeys.length === 0) {
      if (process.env.GEMINI_API_KEY) {
        apiKeys.push(process.env.GEMINI_API_KEY.trim());
      }
      if (process.env.GEMINI_API_KEYS) {
        const splitKeys = process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
        apiKeys.push(...splitKeys);
      }
    }

    if (apiKeys.length === 0) {
      return NextResponse.json(
        { error: 'Chưa cấu hình API Key cho Google Gemini. Vui lòng cấu hình trong trang Admin.' },
        { status: 400 }
      );
    }

    // Xác định danh sách đội bóng thực tế cần cập nhật
    let targets = [];
    if (teamNames === 'all') {
      const allTeams = await db.all("SELECT team_name FROM teams");
      targets = allTeams.map(t => t.team_name);
    } else if (Array.isArray(teamNames)) {
      targets = teamNames;
    } else if (typeof teamNames === 'string') {
      targets = [teamNames];
    }

    const updatedTeams = [];
    const errors = [];

    // Duyệt qua từng đội tuyển để cập nhật bằng AI + Search
    for (const teamName of targets) {
      try {
        console.log(`⚡ [AI UPDATE TEAM] Đang bắt đầu cập nhật cho: ${teamName}`);
        
        // 1. Lấy dữ liệu hiện tại của đội tuyển trong DB
        let currentData = await db.get("SELECT * FROM teams WHERE team_name = ?", [teamName]);
        if (!currentData) {
          // Nếu đội tuyển chưa có trong DB, seed tạm thông tin trống để AI phân tích
          currentData = {
            team_name: teamName,
            fifa_rank: 50,
            elo_rating: 1600,
            recent_form: "D,D,D,D,D",
            avg_goals_scored: 1.2,
            avg_goals_conceded: 1.2,
            key_players: "Chưa có thông tin",
            tactical_analysis: "Đang cập nhật"
          };
          // Insert trước bản ghi rỗng
          await db.run(
            `INSERT INTO teams (team_name, fifa_rank, elo_rating, recent_form, avg_goals_scored, avg_goals_conceded, key_players, tactical_analysis)
             VALUES (?, 50, 1600, 'D,D,D,D,D', 1.2, 1.2, 'Chưa có thông tin', 'Đang cập nhật')`,
            [teamName]
          );
          const newRow = await db.get("SELECT * FROM teams WHERE team_name = ?", [teamName]);
          if (newRow) currentData = newRow;
        }

        // 2. Chạy tìm kiếm internet thu thập dữ liệu
        const searchQuery = `"${teamName}" national football team ELO rating FIFA ranking recent form tactical analysis 2026`;
        const searchResults = await searchInternet(searchQuery);
        const searchContext = searchResults.length > 0 
          ? searchResults.join('\n') 
          : "Không tìm thấy kết quả tìm kiếm trực tuyến.";

        // 3. Gọi Gemini phân tích
        const extracted = await extractTeamStatsWithAI(
          teamName, 
          currentData, 
          activeModel, 
          apiKeys, 
          searchContext
        );

        // 4. Lưu dữ liệu đã cập nhật vào SQLite
        await db.run(
          `UPDATE teams 
           SET fifa_rank = ?, 
               elo_rating = ?, 
               recent_form = ?, 
               avg_goals_scored = ?, 
               avg_goals_conceded = ?, 
               key_players = ?, 
               tactical_analysis = ?,
               last_updated = CURRENT_TIMESTAMP
           WHERE team_name = ?`,
          [
            extracted.fifa_rank,
            extracted.elo_rating,
            extracted.recent_form,
            extracted.avg_goals_scored,
            extracted.avg_goals_conceded,
            extracted.key_players,
            extracted.tactical_analysis,
            teamName
          ]
        );

        // Lấy lại bản ghi sau cập nhật
        const finalData = await db.get("SELECT * FROM teams WHERE team_name = ?", [teamName]);
        updatedTeams.push(finalData);
        console.log(`✅ [AI UPDATE TEAM] Đã cập nhật thành công cho: ${teamName}`);
      } catch (teamError) {
        console.error(`❌ [AI UPDATE TEAM ERROR] Lỗi khi cập nhật cho đội ${teamName}:`, teamError.message);
        errors.push({ team: teamName, error: teamError.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã hoàn thành tiến trình cập nhật chỉ số AI/Search cho ${targets.length} đội tuyển.`,
      updatedCount: updatedTeams.length,
      updatedTeams,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    console.error('Lỗi nghiêm trọng trong API ai-update:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi thực hiện cập nhật AI/Search', details: error.message },
      { status: 500 }
    );
  }
}
