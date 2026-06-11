import { getDB } from './db';

// Bộ lọc kiểm tra domain uy tín và loại bỏ rác/mạng xã hội
function isReputableDomain(url) {
  if (!url) return false;
  const urlLower = url.toLowerCase();
  
  // Danh sách các domain rác, forum, mạng xã hội cần loại bỏ hoàn toàn
  const blacklistedDomains = [
    'reddit.com', 'facebook.com', 'twitter.com', 'x.com', 'quora.com', 
    'pinterest.com', 'youtube.com', 'tiktok.com', 'instagram.com',
    'forum', 'shopee', 'lazada', 'tiki', 'aliexpress', 'amazon'
  ];
  
  for (const domain of blacklistedDomains) {
    if (urlLower.includes(domain)) {
      return false;
    }
  }
  return true;
}

// Hàm helper để gọi Tavily API
async function searchTavily(query, apiKey) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      api_key: apiKey.trim(),
      query: query,
      search_depth: 'basic',
      include_answer: false,
      max_results: 8 // Tăng số lượng kết quả thô để lọc
    })
  });
  if (!response.ok) {
    throw new Error(`Tavily HTTP error ${response.status}`);
  }
  const data = await response.json();
  if (data.results && data.results.length > 0) {
    return data.results
      .filter(r => isReputableDomain(r.url))
      .slice(0, 5) // Giữ tối đa 5 kết quả sạch
      .map(r => r.content);
  }
  return [];
}

// Hàm helper để gọi Brave Search API
async function searchBrave(query, apiKey) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
  const response = await fetch(url, {
    headers: {
      'X-Subscription-Token': apiKey.trim(),
      'Accept': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Brave Search HTTP error ${response.status}`);
  }
  const data = await response.json();
  if (data.web && data.web.results && data.web.results.length > 0) {
    return data.web.results
      .filter(r => isReputableDomain(r.url))
      .slice(0, 5)
      .map(r => r.description || r.title);
  }
  return [];
}

// Hàm helper để gọi Serper API (Google Search)
async function searchSerper(query, apiKey) {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey.trim(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query, num: 8 })
  });
  if (!response.ok) {
    throw new Error(`Serper HTTP error ${response.status}`);
  }
  const data = await response.json();
  if (data.organic && data.organic.length > 0) {
    return data.organic
      .filter(r => isReputableDomain(r.link))
      .slice(0, 5)
      .map(r => r.snippet || r.title);
  }
  return [];
}

// Hàm fallback DuckDuckGo Scraper cũ
async function searchDuckDuckGoFallback(query) {
  try {
    console.log(`   - 🔍 [SEARCH] Sử dụng DuckDuckGo Scraper để tìm kiếm: "${query}"`);
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`DuckDuckGo HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const snippets = [];
    const regex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = regex.exec(html)) !== null && snippets.length < 5) {
      const cleanSnippet = match[1]
        .replace(/<[^>]*>/g, '') // Xóa thẻ HTML
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanSnippet) {
        snippets.push(cleanSnippet);
      }
    }
    return snippets;
  } catch (error) {
    console.error('   - ❌ [SEARCH ERROR] Lỗi khi tìm kiếm trên DuckDuckGo:', error.message);
    return [];
  }
}

const searchCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // Cache 30 phút

async function performSearch(query) {
  try {
    const db = await getDB();
    
    // Lấy danh sách providers được bật, sắp xếp theo priority
    const providers = await db.all(
      `SELECT * FROM search_providers WHERE status = 1 ORDER BY priority ASC`
    );
    
    for (const provider of providers) {
      // Lấy tất cả keys được bật của provider này
      const keys = await db.all(
        `SELECT * FROM search_api_keys WHERE provider_name = ? AND status = 1 ORDER BY id ASC`,
        [provider.provider_name]
      );
      
      if (keys.length === 0) {
        console.log(`   - ⚠️ [SEARCH] Không có API Key nào được kích hoạt cho provider "${provider.provider_name}". Bỏ qua.`);
        continue;
      }
      
      // Chạy xoay vòng và thử lại (key rotation & retry failover)
      for (const key of keys) {
        try {
          console.log(`   - 🔍 [SEARCH] Sử dụng ${provider.provider_name.toUpperCase()} API (Key ID: ${key.id}) cho: "${query}"`);
          let results = [];
          
          if (provider.provider_name === 'tavily') {
            results = await searchTavily(query, key.key_value);
          } else if (provider.provider_name === 'brave') {
            results = await searchBrave(query, key.key_value);
          } else if (provider.provider_name === 'serper') {
            results = await searchSerper(query, key.key_value);
          }
          
          if (results && results.length > 0) {
            console.log(`   - ✅ [SEARCH] Tìm kiếm thành công qua ${provider.provider_name.toUpperCase()}. Lấy được ${results.length} kết quả.`);
            return results;
          }
        } catch (keyError) {
          console.warn(`   - ⚠️ [SEARCH] Lỗi khi dùng key ID: ${key.id} của provider "${provider.provider_name}": ${keyError.message}. Thử key tiếp theo...`);
        }
      }
      
      console.warn(`   - ⚠️ [SEARCH] Tất cả API keys của provider "${provider.provider_name}" đều thất bại. Chuyển sang provider tiếp theo...`);
    }
  } catch (dbError) {
    console.error('   - ❌ [SEARCH ERROR] Lỗi truy vấn database cấu hình search:', dbError.message);
  }
  
  // Fallback cuối cùng nếu toàn bộ API bị lỗi hoặc không có cấu hình hoạt động
  console.log('   - ⚠️ [SEARCH] Fallback: Sử dụng công cụ cào DuckDuckGo Scraper làm dự phòng cuối cùng.');
  return await searchDuckDuckGoFallback(query);
}

export async function searchInternet(query) {
  const cacheKey = query.trim();
  if (searchCache.has(cacheKey)) {
    const cached = searchCache.get(cacheKey);
    const age = Date.now() - cached.timestamp;
    if (age < CACHE_TTL) {
      console.log(`   - ⚡ [SEARCH CACHE HIT] Sử dụng kết quả tìm kiếm đã lưu cho: "${cacheKey}" (tuổi: ${(age/1000).toFixed(1)}s)`);
      return cached.data;
    } else {
      searchCache.delete(cacheKey);
    }
  }

  const data = await performSearch(query);
  
  // Chỉ cache nếu lấy được dữ liệu hợp lệ
  if (data && data.length > 0) {
    searchCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }
  
  return data;
}

