import { searchInternet } from '../src/lib/search.js';

async function test() {
  console.log('🏁 Bắt đầu test searchInternet...');
  const results = await searchInternet('Turkey vs North Macedonia score goals match result');
  console.log('\n🏁 Kết quả cuối cùng nhận được:', results ? `${results.length} kết quả` : 'Không có kết quả');
}

test();
