import { getVNTime } from '../src/lib/timezone.js';

const testCases = [
  {
    desc: 'Trận khai mạc Mexico City (UTC-6 -> lệch 13 tiếng)',
    date: '2026-06-11',
    time: '15:00',
    venue: 'Estadio Azteca, Mexico City',
    expectedDate: '2026-06-12',
    expectedTime: '04:00'
  },
  {
    desc: 'Trận Toronto Canada (Eastern Daylight Time UTC-4 -> lệch 11 tiếng)',
    date: '2026-06-12',
    time: '15:00',
    venue: 'BMO Field, Toronto',
    expectedDate: '2026-06-13',
    expectedTime: '02:00'
  },
  {
    desc: 'Trận Los Angeles USA (Pacific Daylight Time UTC-7 -> lệch 14 tiếng)',
    date: '2026-06-12',
    time: '18:00',
    venue: 'SoFi Stadium, Los Angeles',
    expectedDate: '2026-06-13',
    expectedTime: '08:00'
  },
  {
    desc: 'Trận giao hữu warm-up Thổ Nhĩ Kỳ (Istanbul UTC+3 -> lệch 4 tiếng)',
    date: '2026-06-01',
    time: '18:00',
    venue: 'Şükrü Saracoğlu Stadium, Istanbul',
    expectedDate: '2026-06-01',
    expectedTime: '22:00'
  },
  {
    desc: 'Trận giao hữu warm-up Na Uy (Oslo UTC+2 -> lệch 5 tiếng)',
    date: '2026-06-01',
    time: '19:00',
    venue: 'Ullevaal Stadion, Oslo',
    expectedDate: '2026-06-02',
    expectedTime: '00:00'
  }
];

let failed = 0;
for (const tc of testCases) {
  const res = getVNTime(tc.date, tc.time, tc.venue);
  const pass = res.date === tc.expectedDate && res.time === tc.expectedTime;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${tc.desc}`);
  console.log(`   Input:  ${tc.date} ${tc.time} @ ${tc.venue}`);
  console.log(`   Output: ${res.date} ${res.time} (${res.formatted})`);
  if (!pass) {
    failed++;
  }
}

console.log(`\nKết quả: ${testCases.length - failed}/${testCases.length} tests đạt.`);
process.exit(failed > 0 ? 1 : 0);
