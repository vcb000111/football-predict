import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth-helper';
import { getDB } from '@/lib/db';

export async function GET(request) {
  try {
    const cookiesHeader = request.headers.get('cookie') || '';
    const tokenCookie = cookiesHeader
      .split(';')
      .find(c => c.trim().startsWith('auth_token='));

    if (!tokenCookie) {
      return NextResponse.json({ success: false, user: null });
    }

    const token = tokenCookie.split('=')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
      return NextResponse.json({ success: false, user: null });
    }

    const db = await getDB();
    const user = await db.get(
      'SELECT id, username, email, oauth_provider, created_at FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return NextResponse.json({ success: false, user: null });
    }

    return NextResponse.json({
      success: true,
      user: {
        userId: user.id,
        username: user.username,
        email: user.email,
        oauthProvider: user.oauth_provider,
        createdAt: user.created_at
      }
    });
  } catch (err) {
    console.error('Lỗi API get current user:', err);
    return NextResponse.json({ success: false, user: null });
  }
}

