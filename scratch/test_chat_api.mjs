async function testApi() {
  console.log('🚀 Gửi request kiểm thử tích hợp tới API Chatbox...');
  try {
    const res = await fetch('http://localhost:3000/api/chat/assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Đức đá trận tiếp theo khi nào?' }
        ],
        pageContext: {
          url: 'http://localhost:3000/',
          title: 'World Cup 2026 AI Predictor',
          content: 'Trang chủ lịch thi đấu'
        }
      })
    });

    if (!res.ok) {
      console.error('❌ API trả về lỗi:', res.status, await res.text());
      return;
    }

    console.log('📥 Nhận stream phản hồi:');
    
    // Đọc stream từ body
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let finished = false;

    while (!finished) {
      const { value, done } = await reader.read();
      finished = done;
      if (value) {
        const chunk = decoder.decode(value);
        console.log(chunk);
      }
    }

    console.log('🎉 Kiểm thử API stream hoàn tất thành công!');
  } catch (err) {
    console.error('❌ Lỗi kết nối API:', err.message);
  }
}

testApi();
