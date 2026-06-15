import { getDB } from '../src/lib/db.js';

console.log('🧪 Bắt đầu kiểm thử Lịch sử Chat và Phân trang (Infinite Scroll)...');

async function runTest() {
  try {
    const db = await getDB();
    const mockUserId = 9999;
    
    // 1. Dọn dẹp dữ liệu mock cũ nếu có
    await db.run('DELETE FROM assistant_chats WHERE user_id = ?', [mockUserId]);
    
    // 2. Chèn 35 tin nhắn mock để test phân trang limit = 30
    console.log('- Đang chèn 35 tin nhắn mock vào database...');
    for (let i = 1; i <= 35; i++) {
      const sender = i % 2 === 0 ? 'ai' : 'user';
      const message = `Tin nhắn số ${i}`;
      await db.run(
        'INSERT INTO assistant_chats (user_id, sender, message, model_used) VALUES (?, ?, ?, ?)',
        [mockUserId, sender, message, 'gemini-2.5-flash']
      );
    }
    
    // 3. Giả lập gọi API lấy lịch sử trang đầu (limit = 30)
    console.log('- Đang kiểm tra trang đầu (30 tin gần nhất)...');
    const limit = 30;
    
    // Thực hiện query giống hệt API: ORDER BY id DESC LIMIT 31
    const rows = await db.all(
      `SELECT id, sender, message FROM assistant_chats WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      [mockUserId, limit + 1]
    );
    
    const hasMore = rows.length > limit;
    const page1Rows = hasMore ? rows.slice(0, limit) : rows;
    
    console.log(`  + Số lượng tin nhắn lấy được: ${page1Rows.length} (Mong đợi: 30)`);
    console.log(`  + Flag hasMore: ${hasMore} (Mong đợi: true)`);
    
    if (page1Rows.length !== 30 || !hasMore) {
      throw new Error('Kết quả trang đầu không đúng!');
    }
    
    // Tin nhắn cũ nhất trên UI (là tin nhắn có id bé nhất trong trang 1)
    // Lưu ý: rows sắp xếp theo id giảm dần, nên tin nhắn cũ nhất trong 30 tin này nằm ở cuối mảng result
    const oldestMsgIdOnClient = page1Rows[page1Rows.length - 1].id;
    console.log(`  + ID tin nhắn cũ nhất trang 1: ${oldestMsgIdOnClient}`);
    
    // 4. Giả lập cuộn lên trên đỉnh để load trang 2
    console.log('- Đang kiểm tra trang hai (các tin nhắn trước đó)...');
    const page2Rows = await db.all(
      `SELECT id, sender, message FROM assistant_chats WHERE user_id = ? AND id < ? ORDER BY id DESC LIMIT ?`,
      [mockUserId, oldestMsgIdOnClient, limit + 1]
    );
    
    const hasMorePage2 = page2Rows.length > limit;
    const finalPage2Rows = hasMorePage2 ? page2Rows.slice(0, limit) : page2Rows;
    
    console.log(`  + Số lượng tin nhắn lấy thêm: ${finalPage2Rows.length} (Mong đợi: 5)`);
    console.log(`  + Flag hasMore ở trang 2: ${hasMorePage2} (Mong đợi: false)`);
    
    if (finalPage2Rows.length !== 5 || hasMorePage2) {
      throw new Error('Kết quả phân trang trang hai không đúng!');
    }
    
    // 5. Dọn dẹp dữ liệu mock
    await db.run('DELETE FROM assistant_chats WHERE user_id = ?', [mockUserId]);
    console.log('- Đã dọn dẹp dữ liệu mock.');
    
    console.log('🎉 TẤT CẢ KIỂM THỬ PHÂN TRANG LỊCH SỬ CHAT ĐỀU ĐÃ ĐẠT!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Kiểm thử Phân trang Lịch sử Chat thất bại:', err);
    process.exit(1);
  }
}

runTest();
