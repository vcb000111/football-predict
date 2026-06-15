import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  // Nếu không có cấu hình Client ID, tạo URL callback mock để hỗ trợ dev bypass
  if (!clientId || !redirectUri) {
    console.warn('⚠️ Google OAuth env missing. Trả về callback mock cho môi trường Dev.');
    const mockUrl = `/api/auth/google/callback?code=mock_google_oauth_bypass_token`;
    return NextResponse.json({ success: true, url: mockUrl, isMock: true });
  }

  const state = Math.random().toString(36).substring(2, 15);
  
  // Xây dựng Google OAuth Auth URL
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&state=${state}`;

  return NextResponse.json({ success: true, url: googleAuthUrl, isMock: false });
}
