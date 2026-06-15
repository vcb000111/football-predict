import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDB } from '@/lib/db';
import { verifyToken } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';

// Lấy ID người dùng từ cookie JWT
function getUserIdFromRequest(request) {
  const cookiesHeader = request.headers.get('cookie') || '';
  const tokenCookie = cookiesHeader
    .split(';')
    .find(c => c.trim().startsWith('auth_token='));

  if (!tokenCookie) return null;

  try {
    const token = tokenCookie.split('=')[1];
    const decoded = verifyToken(token);
    return decoded?.userId || null;
  } catch (err) {
    return null;
  }
}

// GET: Lấy danh sách các session của user
export async function GET(request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Người dùng chưa đăng nhập.' },
        { status: 401 }
      );
    }

    const db = await getDB();
    const rows = await db.all(
      'SELECT id, user_id, title, created_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    // Map kết quả sang camelCase
    const sessions = rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      createdAt: row.created_at
    }));

    return NextResponse.json({
      success: true,
      sessions
    });

  } catch (err) {
    console.error('[API SESSIONS GET ERROR]', err);
    return NextResponse.json(
      { error: 'Không thể tải danh sách cuộc trò chuyện.' },
      { status: 500 }
    );
  }
}

// POST: Tạo session mới
export async function POST(request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Người dùng chưa đăng nhập.' },
        { status: 401 }
      );
    }

    const sessionId = crypto.randomUUID();
    const title = 'Đoạn chat mới';

    const db = await getDB();
    await db.run(
      'INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)',
      [sessionId, userId, title]
    );

    return NextResponse.json({
      success: true,
      session: {
        id: sessionId,
        userId,
        title,
        createdAt: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('[API SESSIONS POST ERROR]', err);
    return NextResponse.json(
      { error: 'Không thể tạo cuộc trò chuyện mới.' },
      { status: 500 }
    );
  }
}

// DELETE: Xóa session và các tin nhắn liên quan
export async function DELETE(request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Người dùng chưa đăng nhập.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Thiếu mã cuộc trò chuyện.' },
        { status: 400 }
      );
    }

    const db = await getDB();

    // Xác thực quyền sở hữu session
    const session = await db.get(
      'SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?',
      [sessionId, userId]
    );

    if (!session) {
      return NextResponse.json(
        { error: 'Không tìm thấy cuộc trò chuyện hoặc bạn không có quyền xóa.' },
        { status: 403 }
      );
    }

    // Xóa session và các tin nhắn thuộc session bằng transaction (batch)
    await db.batch([
      { sql: 'DELETE FROM assistant_chats WHERE user_id = ? AND session_id = ?', args: [userId, sessionId] },
      { sql: 'DELETE FROM chat_sessions WHERE id = ? AND user_id = ?', args: [sessionId, userId] }
    ]);

    return NextResponse.json({
      success: true,
      message: 'Đã xóa cuộc trò chuyện thành công.'
    });

  } catch (err) {
    console.error('[API SESSIONS DELETE ERROR]', err);
    return NextResponse.json(
      { error: 'Không thể xóa cuộc trò chuyện.' },
      { status: 500 }
    );
  }
}
