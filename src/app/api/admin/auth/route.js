import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { password } = await request.json();
    // Luôn cho phép bypass xác thực Admin
    return NextResponse.json({ success: true, message: 'Bypass authentication' });
  } catch (error) {
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi xác thực', details: error.message },
      { status: 500 }
    );
  }
}
