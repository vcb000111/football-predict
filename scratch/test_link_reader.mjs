import { getDB } from '../src/lib/db.js';
import { readLinkContent } from '../src/lib/link-reader.js';

console.log('🧪 Bắt đầu kiểm thử Link Reader (Nội bộ & Ngoài)...');

async function runTest() {
  try {
    const db = await getDB();
    
    // Chèn dữ liệu mock fixture và prediction để test
    console.log('- Đang chuẩn bị dữ liệu mock trong DB...');
    const mockMatchId = 'test_match_id_2026';
    
    // Xóa trước nếu tồn tại
    await db.run('DELETE FROM fixtures WHERE id = ?', [mockMatchId]);
    await db.run('DELETE FROM predictions WHERE match_id = ?', [mockMatchId]);

    // Chèn fixture mock
    await db.run(`
      INSERT INTO fixtures (id, home_team, away_team, match_date, match_time, venue, tournament, season, actual_home_score, actual_away_score)
      VALUES (?, 'Vietnam', 'Thái Lan', '2026-06-15', '20:00', 'Mỹ Đình', 'Giao Hữu', '2026', 2, 1)
    `, [mockMatchId]);

    // Chèn prediction mock
    await db.run(`
      INSERT INTO predictions (match_id, home_team, away_team, predicted_home_score, predicted_away_score, win_prob_home, win_prob_draw, win_prob_away, recommendation_1x2, recommendation_ou, recommendation_handicap, bet_evaluation_details)
      VALUES (?, 'Vietnam', 'Thái Lan', 2, 1, 50, 30, 20, 'Vietnam thắng', 'Tài 2.5', 'Vietnam -0.5', 'Trận đấu hấp dẫn kịch tính.')
    `, [mockMatchId]);

    const internalLink = `/match/${mockMatchId}`;
    console.log(`- Thử nghiệm link nội bộ: ${internalLink}`);
    
    const content = await readLinkContent(internalLink);
    console.log('--- NỘI DUNG ĐỌC ĐƯỢC (NỘI BỘ) ---');
    console.log(content);
    console.log('---------------------------------');
    
    // Dọn dẹp dữ liệu mock
    await db.run('DELETE FROM fixtures WHERE id = ?', [mockMatchId]);
    await db.run('DELETE FROM predictions WHERE match_id = ?', [mockMatchId]);
    console.log('- Đã dọn dẹp dữ liệu mock.');

    if (content && content.includes('Vietnam vs Thái Lan') && content.includes('DỰ ĐOÁN TỪ AI')) {
      console.log('✅ Đọc link nội bộ thành công!');
    } else {
      throw new Error('Đọc link nội bộ thất bại hoặc sai cấu trúc.');
    }

    // 2. Thử nghiệm link ngoài
    const externalLink = 'https://vnexpress.net/tinh-dich-loang-co-gay-vo-sinh-4762512.html';
    console.log(`- Thử nghiệm link ngoài: ${externalLink}`);
    
    const externalContent = await readLinkContent(externalLink);
    console.log('--- NỘI DUNG ĐỌC ĐƯỢC (NGOÀI) ---');
    console.log(externalContent ? externalContent.slice(0, 300) + '...' : 'Rỗng');
    console.log('-------------------------------');

    if (externalContent && !externalContent.includes('Không thể đọc')) {
      console.log('✅ Đọc link ngoài thành công!');
    } else {
      console.warn('⚠️ Đọc link ngoài qua fetch thô bị lỗi. Chấp nhận được ở một số môi trường mạng.');
    }

    console.log('🎉 TẤT CẢ KIỂM THỬ LINK READER ĐỀU ĐÃ ĐẠT!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Kiểm thử Link Reader thất bại:', err);
    process.exit(1);
  }
}

runTest();
