import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const response = NextResponse.json({ success: true, message: 'Đã đăng xuất thành công.' });
    
    // Xoá cookie bằng cách đặt Max-Age=0
    response.headers.append(
      'Set-Cookie',
      'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    );

    return response;
  } catch (err) {
    console.error('Lỗi API logout:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống.' },
      { status: 500 }
    );
  }
}
