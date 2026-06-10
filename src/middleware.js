import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Chỉ áp dụng cho các API quản trị bắt đầu bằng /api/admin
  if (pathname.startsWith('/api/admin')) {
    // Ngoại trừ API Route xác thực /api/admin/auth để cho phép Client gửi POST xác thực và nhận thông báo lỗi chi tiết
    if (pathname === '/api/admin/auth') {
      return NextResponse.next();
    }

    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const adminPassword = process.env.PASSWORD_ADMIN;

    // Chặn kiểm tra chỉ khi ở production và có cấu hình mật khẩu quản trị
    if (isProduction && adminPassword) {
      const clientPassword = request.headers.get('x-admin-password');
      
      if (clientPassword !== adminPassword) {
        return new NextResponse(
          JSON.stringify({ error: 'UNAUTHORIZED', requirePassword: true, message: 'Mật khẩu quản trị không đúng hoặc đã hết hạn.' }),
          { 
            status: 401, 
            headers: { 'content-type': 'application/json' } 
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/admin/:path*',
};
