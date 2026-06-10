import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { password } = await request.json();
    const adminPassword = process.env.PASSWORD_ADMIN;
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

    // Nếu không ở production hoặc không cấu hình PASSWORD_ADMIN, tự động coi là hợp lệ
    if (!isProduction || !adminPassword) {
      return NextResponse.json({ success: true, message: 'Bypass authentication' });
    }

    if (password === adminPassword) {
      return NextResponse.json({ success: true, message: 'Xác thực thành công' });
    } else {
      return NextResponse.json(
        { error: 'Mật khẩu quản trị không chính xác' },
        { status: 401 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xác thực', details: error.message },
      { status: 500 }
    );
  }
}
