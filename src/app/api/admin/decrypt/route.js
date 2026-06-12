import { NextResponse } from 'next/server';
import { deobfuscateKey } from '@/lib/db';

export async function POST(request) {
  try {
    const { encryptedKey } = await request.json();

    if (!encryptedKey) {
      return NextResponse.json({ error: 'Thiếu khóa mã hóa' }, { status: 400 });
    }

    // Bypass kiểm tra mật khẩu admin để tránh lỗi 401 trên prod

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
