import { NextResponse } from 'next/server';
import { deobfuscateKey } from '@/lib/db';

export async function POST(request) {
  try {
    const { encryptedKey } = await request.json();

    if (!encryptedKey) {
      return NextResponse.json({ error: 'Thiếu khóa mã hóa' }, { status: 400 });
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const adminPassword = process.env.PASSWORD_ADMIN;

    // Kiểm tra chéo mật khẩu trực tiếp trong handler để tăng cường bảo mật (Defense in Depth)
    if (isProduction && adminPassword) {
      const clientPassword = request.headers.get('x-admin-password');
      if (clientPassword !== adminPassword) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Mật khẩu xác thực không hợp lệ.' },
          { status: 401 }
        );
      }
    }

    // Tiến hành giải mã
    const decryptedKey = deobfuscateKey(encryptedKey);

    return NextResponse.json({ success: true, decryptedKey });
  } catch (error) {
    return NextResponse.json(
      { error: 'Giải mã thất bại', details: error.message },
      { status: 500 }
    );
  }
}
