import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth-helper';

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

    return NextResponse.json({
      success: true,
      user: {
        userId: decoded.userId,
        username: decoded.username,
        email: decoded.email
      }
    });
  } catch (err) {
    console.error('Lỗi API get current user:', err);
    return NextResponse.json({ success: false, user: null });
  }
}
