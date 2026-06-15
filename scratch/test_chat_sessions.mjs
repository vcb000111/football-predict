import pkg from '@next/env';
const { loadEnvConfig } = pkg;
import path from 'path';

// Load biến môi trường
loadEnvConfig(process.cwd());

// Import động module getDB để tránh lỗi phân giải path
const dbModulePath = path.resolve(process.cwd(), 'src/lib/db.js');
const { getDB } = await import(`file://${dbModulePath}`);

async function testSessions() {
  console.log('🤖 Bắt đầu chạy bộ kiểm thử tự động cho Multi-Session Chats...');
  const db = await getDB();
  
  const testUserId = 99999; // ID test
  const testSessionId = 'test-session-' + Math.random().toString(36).substring(2, 9);
  
  console.log(`1. Tạo session giả lập cho user ${testUserId} với ID: ${testSessionId}...`);
  await db.run(
    'INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)',
    [testSessionId, testUserId, 'Đoạn chat kiểm thử']
  );
  
  console.log('2. Lưu tin nhắn User giả lập kèm session_id...');
  await db.run(
    'INSERT INTO assistant_chats (user_id, sender, message, model_used, session_id) VALUES (?, ?, ?, ?, ?)',
    [testUserId, 'user', 'Xin chào AI, đây là tin nhắn kiểm thử!', 'gemini-2.5-flash', testSessionId]
  );

  console.log('3. Lưu tin nhắn AI giả lập kèm session_id...');
  await db.run(
    'INSERT INTO assistant_chats (user_id, sender, message, model_used, session_id) VALUES (?, ?, ?, ?, ?)',
    [testUserId, 'ai', 'Chào bạn! Tôi là AI, tôi nhận được tin nhắn kiểm thử của bạn.', 'gemini-2.5-flash', testSessionId]
  );

  console.log('4. Truy vấn danh sách session của user...');
  const sessions = await db.all(
    'SELECT id, title FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
    [testUserId]
  );
  console.log('=> Danh sách sessions tìm thấy:', sessions);
  if (sessions.length > 0 && sessions[0].id === testSessionId) {
    console.log('✅ Tạo và lấy session thành công!');
  } else {
    throw new Error('❌ Không tìm thấy session đã tạo.');
  }

  console.log('5. Truy vấn lịch sử tin nhắn theo session...');
  const messages = await db.all(
    'SELECT sender, message, session_id FROM assistant_chats WHERE user_id = ? AND session_id = ?',
    [testUserId, testSessionId]
  );
  console.log('=> Các tin nhắn tìm thấy trong session:', messages);
  if (messages.length === 2) {
    console.log('✅ Lưu và lấy tin nhắn theo session_id thành công!');
  } else {
    throw new Error(`❌ Số lượng tin nhắn không khớp (kỳ vọng 2, tìm thấy ${messages.length}).`);
  }

  console.log('6. Dọn dẹp dữ liệu kiểm thử...');
  await db.run('DELETE FROM assistant_chats WHERE user_id = ? AND session_id = ?', [testUserId, testSessionId]);
  await db.run('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', [testSessionId, testUserId]);
  console.log('✅ Đã dọn dẹp sạch sẽ dữ liệu test.');

  console.log('\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ ĐÃ VƯỢT QUA THÀNH CÔNG!');
}

testSessions().catch(err => {
  console.error('❌ Kiểm thử thất bại:', err);
  process.exit(1);
});
