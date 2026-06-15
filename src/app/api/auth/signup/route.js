import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { hashPassword } from '@/lib/auth-helper';

export async function POST(request) {
  try {
    const { username, email, password } = await request.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng điền đầy đủ thông tin.' },
        { status: 400 }
      );
    }

    const db = await getDB();
    
    // Kiểm tra email tồn tại
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email đã được đăng ký sử dụng.' },
        { status: 400 }
      );
    }

    // Băm mật khẩu và lưu người dùng
    const passwordHash = hashPassword(password);
    await db.run(
      'INSERT INTO users (username, email, password_hash, oauth_provider) VALUES (?, ?, ?, ?)',
      [username, email, passwordHash, 'local']
    );

    return NextResponse.json({ success: true, message: 'Đăng ký tài khoản thành công.' });
  } catch (err) {
    console.error('Lỗi API signup:', err);
    return NextResponse.json(
      { success: false, error: 'Đã xảy ra lỗi hệ thống.' },
      { status: 500 }
    );
  }
}
