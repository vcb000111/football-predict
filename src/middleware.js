import { NextResponse } from 'next/server';

export function middleware(request) {
  const url = new URL(request.url);
  // Cho phép bypass qua API xác thực
  if (url.pathname === '/api/admin/auth') {
    return NextResponse.next();
  }

  const clientPassword = request.headers.get('x-admin-password');
  const expectedPassword = process.env.ADMIN_PASSWORD || 'TonyMinh123@';

  if (!clientPassword || clientPassword !== expectedPassword) {
    return new NextResponse(
      JSON.stringify({ success: false, error: 'Mật khẩu quản trị không đúng hoặc hết hạn.' }),
      {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/admin/:path*',
};
