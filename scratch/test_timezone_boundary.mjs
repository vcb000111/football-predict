import { getMatchTime } from '../src/lib/results-updater.js';
import fs from 'fs';
import path from 'path';

const fixturesData = JSON.parse(fs.readFileSync(path.resolve('./src/data/fixtures.json'), 'utf8'));

const m1 = fixturesData.fixtures.find(f => f.id === 'm1');
const m13 = fixturesData.fixtures.find(f => f.id === 'm13');

console.log('Testing getMatchTime...');

const m1Time = getMatchTime(m1);
const m13Time = getMatchTime(m13);

console.log(`M1 (Mexico vs South Africa, 2026-06-11 15:00 at Mexico City):`);
console.log(`- Match Time UTC:`, m1Time.toISOString());

console.log(`M13 (Saudi Arabia vs Uruguay, 2026-06-15 18:00 at Miami):`);
console.log(`- Match Time UTC:`, m13Time.toISOString());

const currentTime = new Date(); // 2026-06-13
console.log(`Current Server Time UTC:`, currentTime.toISOString());

const diffM1 = currentTime.getTime() - m1Time.getTime();
console.log(`M1 Diff (hours):`, (diffM1 / (1000 * 60 * 60)).toFixed(2));
console.log(`M1 should be allowed (> 150 mins):`, diffM1 >= 150 * 60 * 1000);

const diffM13 = currentTime.getTime() - m13Time.getTime();
console.log(`M13 Diff (hours):`, (diffM13 / (1000 * 60 * 60)).toFixed(2));
console.log(`M13 should be blocked (< 150 mins):`, diffM13 < 150 * 60 * 1000);

if (diffM1 >= 150 * 60 * 1000 && diffM13 < 150 * 60 * 1000) {
  console.log('\n[PASS] Boundary checks look correct!');
  process.exit(0);
} else {
  console.log('\n[FAIL] Boundary checks incorrect.');
  process.exit(1);
}
