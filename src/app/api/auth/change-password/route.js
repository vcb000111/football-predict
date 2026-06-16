import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { verifyToken, verifyPassword, hashPassword } from '@/lib/auth-helper';

export async function POST(request) {
  try {
    const cookiesHeader = request.headers.get('cookie') || '';
    const tokenCookie = cookiesHeader
      .split(';')
      .find(c => c.trim().startsWith('auth_token='));

    if (!tokenCookie) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng đăng nhập để thực hiện.' },
        { status: 401 }
      );
    }

    const token = tokenCookie.split('=')[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.userId) {
      return NextResponse.json(
        { success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword } = await request.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới.' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' },
        { status: 400 }
      );
    }

    const db = await getDB();
    const user = await db.get(
      'SELECT id, password_hash, oauth_provider FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy thông tin tài khoản.' },
        { status: 404 }
      );
    }

    if (user.oauth_provider !== 'local') {
      return NextResponse.json(
        { success: false, error: 'Tài khoản liên kết bên thứ ba (Google) không thể đổi mật khẩu.' },
        { status: 400 }
      );
    }

    const isMatch = verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: 'Mật khẩu hiện tại không chính xác.' },
        { status: 400 }
      );
    }

    const newHash = hashPassword(newPassword);
    await db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newHash, decoded.userId]
    );

    return NextResponse.json({
      success: true,
      message: 'Thay đổi mật khẩu thành công.'
    });
  } catch (err) {
    console.error('Lỗi API change-password:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống.' },
      { status: 500 }
    );
  }
}
