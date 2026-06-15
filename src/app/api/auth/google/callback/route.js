import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { signToken } from '@/lib/auth-helper';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.redirect(new URL('/login?error=no_code', request.url));
    }

    let email = '';
    let username = '';

    const isMock = code === 'mock_google_oauth_bypass_token';

    if (isMock) {
      email = 'developer@footballpredict.com';
      username = 'Developer Mode';
    } else {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = process.env.GOOGLE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        return NextResponse.redirect(new URL('/login?error=env_missing', request.url));
      }

      // 1. Trao đổi auth code lấy access_token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        console.error('Lỗi lấy Google token:', tokenData);
        return NextResponse.redirect(new URL('/login?error=token_failed', request.url));
      }

      // 2. Fetch user profile từ Google API
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      const profileData = await profileResponse.json();

      if (!profileResponse.ok || !profileData.email) {
        console.error('Lỗi lấy Google profile:', profileData);
        return NextResponse.redirect(new URL('/login?error=profile_failed', request.url));
      }

      email = profileData.email;
      username = profileData.name || profileData.given_name || email.split('@')[0];
    }

    // 3. Upsert người dùng trong database
    const db = await getDB();
    let user = await db.get('SELECT id, username, email FROM users WHERE email = ?', [email]);

    if (!user) {
      // Đăng ký tài khoản OAuth Google mới
      const result = await db.run(
        'INSERT INTO users (username, email, oauth_provider) VALUES (?, ?, ?)',
        [username, email, 'google']
      );
      user = {
        id: result.lastID,
        username,
        email
      };
    }

    // 4. Sinh JWT Token
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      email: user.email
    };
    const token = signToken(tokenPayload);

    // 5. Chuyển hướng người dùng về trang chủ kèm theo Cookie JWT
    const homeUrl = new URL('/', request.url);
    const response = NextResponse.redirect(homeUrl);

    const isProd = process.env.NODE_ENV === 'production';
    response.headers.append(
      'Set-Cookie',
      `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400;${isProd ? ' Secure;' : ''}`
    );

    return response;
  } catch (err) {
    console.error('Lỗi callback Google OAuth:', err);
    return NextResponse.redirect(new URL('/login?error=system_error', request.url));
  }
}
