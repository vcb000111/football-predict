const http = require('http');

function postRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function test() {
  try {
    console.log('1. Gửi request cập nhật AI cho MU & Fulham...');
    const updateRes = await postRequest('http://localhost:3000/api/admin/teams/ai-update', {
      teamNames: ['Manchester United', 'Fulham']
    });
    console.log('Kết quả ai-update:', JSON.stringify(updateRes, null, 2));

    console.log('\n2. Gửi request dự báo Manchester United vs Fulham...');
    const predictRes = await postRequest('http://localhost:3000/api/predict', {
      homeTeam: 'Manchester United',
      awayTeam: 'Fulham',
      matchId: 'test-h2h-002',
      forceRefresh: true,
      fastMode: true,
      marketHandicap: -0.75
    });
    console.log('Kết quả predict:', JSON.stringify(predictRes, null, 2));
  } catch (err) {
    console.error('Lỗi kiểm thử:', err.message);
  }
}

test();
