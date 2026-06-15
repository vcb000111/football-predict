import { getDB } from './db.js';

// Hàm phân tích URL và trả về nội dung text tương ứng
export async function readLinkContent(urlString) {
  if (!urlString) return null;
  
  try {
    const url = new URL(urlString);
    const pathname = url.pathname;
    
    // Kiểm tra xem có phải link trận đấu nội bộ không (dạng /match/[id])
    const matchRoute = pathname.match(/\/match\/([a-zA-Z0-9_-]+)/);
    if (matchRoute) {
      const matchId = matchRoute[1];
      console.log(`[LINK READER] Phát hiện link trận đấu nội bộ. ID: ${matchId}`);
      return await getInternalMatchContext(matchId);
    }

    // Nếu là các URL nội bộ khác
    const isInternal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.includes('footballpredict') || url.hostname.includes('football-predict');
    if (isInternal) {
      if (pathname === '/' || pathname === '/index') {
        return 'Đây là trang chủ của hệ thống WC2026 Predict, hiển thị danh sách tất cả các trận đấu và lịch thi đấu World Cup 2026.';
      }
      if (pathname === '/custom') {
        return 'Đây là trang Giả lập cặp đấu, cho phép người dùng tự chọn 2 đội bất kỳ để AI phân tích và dự đoán tỉ số cùng các thông số kèo.';
      }
      if (pathname === '/admin') {
        return 'Đây là trang Cấu hình AI, dành cho quản trị viên cấu hình model và API key.';
      }
      if (pathname === '/stats') {
        return 'Đây là trang Thống kê phân tích giải đấu World Cup 2026.';
      }
    }

    // Nếu là URL bên ngoài, thực hiện cào nội dung
    console.log(`[LINK READER] Đang tải nội dung từ URL ngoài: ${urlString}`);
    return await extractWebpageText(urlString);
  } catch (err) {
    // Nếu parse URL thất bại, có thể là link tương đối (ví dụ /match/123)
    if (urlString.startsWith('/')) {
      const matchRoute = urlString.match(/\/match\/([a-zA-Z0-9_-]+)/);
      if (matchRoute) {
        const matchId = matchRoute[1];
        console.log(`[LINK READER] Phát hiện link tương đối trận đấu. ID: ${matchId}`);
        return await getInternalMatchContext(matchId);
      }
    }
    console.error('[LINK READER ERROR] URL không hợp lệ:', urlString);
    return `Đường dẫn không hợp lệ hoặc không thể phân tích: ${urlString}`;
  }
}

// Hàm lấy dữ liệu chi tiết của trận đấu từ SQLite DB
async function getInternalMatchContext(matchId) {
  try {
    const db = await getDB();
    
    // Lấy thông tin fixture
    const fixture = await db.get('SELECT * FROM fixtures WHERE id = ?', [matchId]);
    if (!fixture) {
      return `Không tìm thấy thông tin trận đấu trong cơ sở dữ liệu với ID: ${matchId}`;
    }

    // Lấy dự đoán
    const prediction = await db.get('SELECT * FROM predictions WHERE match_id = ?', [matchId]);

    let context = `### THÔNG TIN TRẬN ĐẤU (DỮ LIỆU HỆ THỐNG)\n`;
    context += `- **Cặp đấu:** ${fixture.home_team} vs ${fixture.away_team}\n`;
    context += `- **Giải đấu:** ${fixture.tournament || 'World Cup 2026'} (Mùa giải: ${fixture.season || '2026'})\n`;
    context += `- **Thời gian:** ${fixture.match_time || ''} ngày ${fixture.match_date || ''}\n`;
    context += `- **Địa điểm:** ${fixture.venue || 'Chưa xác định'}\n`;
    
    if (fixture.actual_home_score !== null && fixture.actual_away_score !== null) {
      context += `- **Kết quả thực tế:** ${fixture.home_team} ${fixture.actual_home_score} - ${fixture.actual_away_score} ${fixture.away_team}`;
      if (fixture.actual_first_half_home_score !== null && fixture.actual_first_half_away_score !== null) {
        context += ` (Hiệp 1: ${fixture.actual_first_half_home_score}-${fixture.actual_first_half_away_score})`;
      }
      context += `\n`;
    } else {
      context += `- **Trạng thái:** Chưa diễn ra hoặc chưa có tỉ số cập nhật.\n`;
    }

    if (prediction) {
      context += `\n### DỰ ĐOÁN TỪ AI\n`;
      context += `- **Dự đoán tỉ số:** ${fixture.home_team} ${prediction.predicted_home_score} - ${prediction.predicted_away_score} ${fixture.away_team}\n`;
      context += `- **Xác suất thắng:** ${fixture.home_team} (${prediction.win_prob_home}%), Hòa (${prediction.win_prob_draw}%), ${fixture.away_team} (${prediction.win_prob_away}%)\n`;
      context += `- **Khuyến nghị 1X2:** ${prediction.recommendation_1x2 || 'Không có'}\n`;
      context += `- **Khuyến nghị Tài/Xỉu:** ${prediction.recommendation_ou || 'Không có'} (Line: ${prediction.ou_line || 2.5})\n`;
      context += `- **Khuyến nghị Chấp (Handicap):** ${prediction.recommendation_handicap || 'Không có'} (Line: ${prediction.handicap_line || 0.0})\n`;
      
      if (prediction.bet_evaluation_details) {
        try {
          const evalObj = JSON.parse(prediction.bet_evaluation_details);
          let evalText = `- **Đánh giá chuyên sâu từ hệ thống:**\n`;
          if (evalObj.oneXTwo) evalText += `  + Kèo 1X2: ${evalObj.oneXTwo.outcome === 'correct' ? 'Đúng' : evalObj.oneXTwo.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.oneXTwo.reason})\n`;
          if (evalObj.overUnder) evalText += `  + Kèo Tài Xỉu: ${evalObj.overUnder.outcome === 'correct' ? 'Đúng' : evalObj.overUnder.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.overUnder.reason})\n`;
          if (evalObj.handicap) evalText += `  + Kèo Chấp: ${evalObj.handicap.outcome === 'correct' ? 'Đúng' : evalObj.handicap.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.handicap.reason})\n`;
          if (evalObj.btts) evalText += `  + Kèo Hai đội ghi bàn: ${evalObj.btts.outcome === 'correct' ? 'Đúng' : evalObj.btts.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.btts.reason})\n`;
          if (evalObj.corners) evalText += `  + Kèo Phạt góc: ${evalObj.corners.outcome === 'correct' ? 'Đúng' : evalObj.corners.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.corners.reason})\n`;
          if (evalObj.cards) evalText += `  + Kèo Thẻ phạt: ${evalObj.cards.outcome === 'correct' ? 'Đúng' : evalObj.cards.outcome === 'incorrect' ? 'Sai' : 'Hòa'} (Lý do: ${evalObj.cards.reason})\n`;
          if (evalObj.summary) evalText += `  + Tóm tắt đánh giá: ${evalObj.summary}\n`;
          context += evalText;
        } catch (e) {
          context += `- **Đánh giá chuyên sâu:** ${prediction.bet_evaluation_details}\n`;
        }
      }
    } else {
      context += `\n- **Trạng thái dự đoán:** Trận đấu này chưa được hệ thống phân tích và dự đoán.\n`;
    }

    return context;
  } catch (err) {
    console.error('[LINK READER ERROR] Lỗi truy vấn dữ liệu trận đấu:', err);
    return `Lỗi truy vấn dữ liệu nội bộ cho trận đấu ID: ${matchId}. Chi tiết: ${err.message}`;
  }
}

// Hàm tải và cào nội dung text từ trang web ngoài
async function extractWebpageText(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      next: { revalidate: 1800 } // cache trong 30 phút
    });
    
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    
    const html = await res.text();
    
    // Loại bỏ các thẻ không chứa text bài viết
    let cleanHtml = html
      .replace(/<head>[\s\S]*?<\/head>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '');
      
    // Trích xuất text từ các thẻ nội dung
    const paragraphs = [];
    const regex = /<(p|h1|h2|h3|h4|li)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = regex.exec(cleanHtml)) !== null) {
      const clean = match[2]
        .replace(/<[^>]*>/g, '') // xóa thẻ lồng ghép
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Bỏ các đoạn text ngắn rác hoặc menu
      if (clean && clean.length > 15) {
        paragraphs.push(clean);
      }
    }
    
    if (paragraphs.length === 0) {
      const cleanText = html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return cleanText.slice(0, 2500);
    }
    
    // Trả về văn bản kết hợp từ các paragraph, giới hạn độ dài context
    return paragraphs.slice(0, 80).join('\n\n').slice(0, 4000);
  } catch (err) {
    console.error(`[LINK READER ERROR] Không thể scrap URL ${url}:`, err.message);
    return `Không thể đọc nội dung trực tiếp từ URL này. (Lỗi: ${err.message})`;
  }
}
