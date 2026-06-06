import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Thiếu tham số provider hoặc apiKey' },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();

    if (provider === 'gemini') {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          return NextResponse.json({ success: true, status: 'active', credit: null });
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP error ${res.status}`;
          return NextResponse.json({ 
            success: true, 
            status: 'inactive', 
            errorDetails: `Lỗi kết nối Gemini: ${errMsg}` 
          });
        }
      } catch (err) {
        return NextResponse.json({ 
          success: true, 
          status: 'inactive', 
          errorDetails: `Không thể kết nối đến Google API: ${err.message}` 
        });
      }
    }

    if (provider === 'groq') {
      try {
        const url = 'https://api.groq.com/openai/v1/models';
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${trimmedKey}`
          },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          return NextResponse.json({ success: true, status: 'active', credit: null });
        } else {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP error ${res.status}`;
          return NextResponse.json({ 
            success: true, 
            status: 'inactive', 
            errorDetails: `Lỗi kết nối Groq: ${errMsg}` 
          });
        }
      } catch (err) {
        return NextResponse.json({ 
          success: true, 
          status: 'inactive', 
          errorDetails: `Lỗi kết nối Groq API: ${err.message}` 
        });
      }
    }

    if (provider === 'tavily') {
      try {
        const res = await fetch('https://api.tavily.com/usage', {
          headers: {
            'Authorization': `Bearer ${trimmedKey}`
          },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          const data = await res.json();
          
          // Lấy thông tin từ block key trước, nếu limit bị null thì lấy từ account (gói dùng chung)
          const used = data.key?.limit !== null && data.key?.limit !== undefined
            ? (data.key.usage ?? 0)
            : (data.account?.plan_usage ?? data.key?.usage ?? 0);
            
          const limit = data.key?.limit !== null && data.key?.limit !== undefined
            ? data.key.limit
            : (data.account?.plan_limit ?? 0);

          return NextResponse.json({
            success: true,
            status: 'active',
            credit: {
              used,
              limit
            }
          });
        } else {
          return NextResponse.json({ 
            success: true, 
            status: 'inactive', 
            errorDetails: `Tavily báo lỗi. Vui lòng kiểm tra lại Key (HTTP ${res.status})` 
          });
        }
      } catch (err) {
        return NextResponse.json({ 
          success: true, 
          status: 'inactive', 
          errorDetails: `Lỗi kết nối Tavily: ${err.message}` 
        });
      }
    }

    if (provider === 'brave') {
      try {
        const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=ping&count=1', {
          headers: {
            'X-Subscription-Token': trimmedKey,
            'Accept': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          return NextResponse.json({ success: true, status: 'active', credit: null });
        } else {
          return NextResponse.json({ 
            success: true, 
            status: 'inactive', 
            errorDetails: `Brave Search báo lỗi (HTTP ${res.status}). Có thể key sai hoặc hết hạn mức.` 
          });
        }
      } catch (err) {
        return NextResponse.json({ 
          success: true, 
          status: 'inactive', 
          errorDetails: `Lỗi kết nối Brave Search: ${err.message}` 
        });
      }
    }

    if (provider === 'serper') {
      try {
        const res = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': trimmedKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: 'ping' }),
          signal: AbortSignal.timeout(10000)
        });
        if (res.ok) {
          return NextResponse.json({ success: true, status: 'active', credit: null });
        } else {
          return NextResponse.json({ 
            success: true, 
            status: 'inactive', 
            errorDetails: `Serper.dev báo lỗi (HTTP ${res.status}). Vui lòng kiểm tra lại key.` 
          });
        }
      } catch (err) {
        return NextResponse.json({ 
          success: true, 
          status: 'inactive', 
          errorDetails: `Lỗi kết nối Serper.dev: ${err.message}` 
        });
      }
    }

    return NextResponse.json(
      { error: `Không hỗ trợ provider: ${provider}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Lỗi khi kiểm tra API Key:', error);
    return NextResponse.json(
      { error: 'Lỗi hệ thống khi check key', details: error.message },
      { status: 500 }
    );
  }
}
