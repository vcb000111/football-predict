import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { password } = await request.json();
    const expectedPassword = process.env.ADMIN_PASSWORD || 'TonyMinh123@';

    if (password === expectedPassword) {
      return NextResponse.json({ success: true, message: 'Xác thực thành công.' });
    }

    return NextResponse.json(
      { error: 'Mật khẩu quản trị không chính xác.' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xác thực', details: error.message },
      { status: 500 }
    );
  }
}
