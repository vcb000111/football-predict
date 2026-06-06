import { calculateMLBaseline } from '../src/lib/ml-baseline.js';

// Test case 1: Argentina (mạnh) vs Saudi Arabia (yếu)
const home1 = {
  team_name: 'Argentina',
  elo_rating: 2130,
  fifa_rank: 1,
  recent_form: 'W,W,W,W,D',
  avg_goals_scored: 2.1,
  avg_goals_conceded: 0.5
};

const away1 = {
  team_name: 'Saudi Arabia',
  elo_rating: 1600,
  fifa_rank: 53,
  recent_form: 'W,D,L,W,L',
  avg_goals_scored: 1.1,
  avg_goals_conceded: 1.0
};

console.log('--- TEST CASE 1: Argentina (Home) vs Saudi Arabia (Away) ---');
const result1 = calculateMLBaseline(home1, away1, false);
console.log(JSON.stringify(result1, null, 2));

// Test case 2: USA vs Germany (Đá ở USA, lợi thế sân nhà cho USA)
const home2 = {
  team_name: 'USA',
  elo_rating: 1810,
  fifa_rank: 11,
  recent_form: 'W,L,W,D,W',
  avg_goals_scored: 1.8,
  avg_goals_conceded: 1.0
};

const away2 = {
  team_name: 'Germany',
  elo_rating: 1890,
  fifa_rank: 16,
  recent_form: 'W,W,D,W,W',
  avg_goals_scored: 2.1,
  avg_goals_conceded: 1.1
};

console.log('\n--- TEST CASE 2: USA (Home, Adv) vs Germany (Away) ---');
const result2 = calculateMLBaseline(home2, away2, true);
console.log(JSON.stringify(result2, null, 2));
