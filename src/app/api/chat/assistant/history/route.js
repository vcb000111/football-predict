import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyToken } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // 1. Lấy thông tin user từ cookie JWT để bảo mật
    const cookiesHeader = request.headers.get('cookie') || '';
    const tokenCookie = cookiesHeader
      .split(';')
      .find(c => c.trim().startsWith('auth_token='));

    if (!tokenCookie) {
      return NextResponse.json({ success: true, messages: [], hasMore: false });
    }

    const token = tokenCookie.split('=')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json({ success: true, messages: [], hasMore: false });
    }

    const userId = decoded.userId;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '30', 10);
    const beforeId = searchParams.get('beforeId');
    const sessionId = searchParams.get('sessionId') || 'default_session';

    const db = await getDB();
    
    // Xây dựng câu truy vấn: Lấy limit + 1 bản ghi để check hasMore và lọc theo session_id
    let query = 'SELECT id, sender, message, model_used, image_url, created_at FROM assistant_chats WHERE user_id = ?';
    const params = [userId];

    if (sessionId === 'default_session') {
      query += ' AND (session_id = ? OR session_id IS NULL)';
      params.push('default_session');
    } else {
      query += ' AND session_id = ?';
      params.push(sessionId);
    }

    if (beforeId) {
      query += ' AND id < ?';
      params.push(parseInt(beforeId, 10));
    }

    query += ` ORDER BY id DESC LIMIT ${limit + 1}`;

    const rows = await db.all(query, params);
    
    const hasMore = rows.length > limit;
    const resultRows = hasMore ? rows.slice(0, limit) : rows;

    // Định dạng lại các cột sang camelCase và parse JSON cho image_url
    const formattedMessages = resultRows.map(row => {
      let imageUrls = [];
      if (row.image_url) {
        try {
          imageUrls = JSON.parse(row.image_url);
        } catch (e) {
          imageUrls = [row.image_url]; // Fallback nếu lưu text đơn
        }
      }
      return {
        id: row.id,
        role: row.sender === 'user' ? 'user' : 'assistant',
        content: row.message,
        modelUsed: row.model_used,
        imageUrls: imageUrls,
        createdAt: row.created_at
      };
    });

    // Đảo ngược mảng để trả về thứ tự thời gian tăng dần (cũ -> mới) cho client render
    formattedMessages.reverse();

    return NextResponse.json({
      success: true,
      messages: formattedMessages,
      hasMore
    });

  } catch (err) {
    console.error('[ASSISTANT HISTORY ERROR] Lỗi lấy lịch sử chat:', err);
    return NextResponse.json(
      { error: 'Không thể tải lịch sử trò chuyện.' },
      { status: 500 }
    );
  }
}
