import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyPassword, signToken } from '@/lib/auth-helper';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp email và mật khẩu.' },
        { status: 400 }
      );
    }

    const db = await getDB();
    const user = await db.get(
      'SELECT id, username, email, password_hash, oauth_provider FROM users WHERE email = ?',
      [email]
    );

    if (!user || user.oauth_provider !== 'local') {
      return NextResponse.json(
        { success: false, error: 'Tài khoản không tồn tại hoặc sai mật khẩu.' },
        { status: 401 }
      );
    }

    const isMatch = verifyPassword(password, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Tài khoản không tồn tại hoặc sai mật khẩu.' },
        { status: 401 }
      );
    }

    // Tạo token JWT
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email
    };
    const token = signToken(tokenPayload);

    // Thiết lập cookie HttpOnly an toàn
    const response = NextResponse.json({
      success: true,
      user: {
        userId: user.id,
        username: user.username,
        email: user.email
      }
    });

    const isProd = process.env.NODE_ENV === 'production';
    response.headers.append(
      'Set-Cookie',
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400;${isProd ? ' Secure;' : ''}`
    );

    return response;
  } catch (err) {
    console.error('Lỗi API login:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống.' },
      { status: 500 }
    );
  }
}
