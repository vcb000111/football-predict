import pkg from '@next/env';
const { loadEnvConfig } = pkg;
loadEnvConfig(process.cwd());

import { 
  toolQueryFixtures, 
  toolQueryTeamDetails, 
  toolQueryAiAccuracyStats,
  toolQueryHotMatches
} from '../src/lib/chat-tools.js';

async function runTests() {
  console.log('🚀 Bắt đầu kiểm thử Chatbox Tools...\n');

  // 1. Test query_fixtures
  console.log('--- TEST 1: toolQueryFixtures ("Đức") ---');
  try {
    const res = await toolQueryFixtures({ searchTerm: 'Đức' });
    console.log('Kết quả:', JSON.stringify(res, null, 2));
    if (res.fixtures || res.result) {
      console.log('✅ PASS\n');
    } else {
      console.log('❌ FAIL\n');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message, '\n');
  }

  // 2. Test query_team_details
  console.log('--- TEST 2: toolQueryTeamDetails ("Mexico") ---');
  try {
    const res = await toolQueryTeamDetails({ searchTerm: 'Mexico' });
    console.log('Kết quả:', JSON.stringify(res, null, 2));
    if (res.team || res.result) {
      console.log('✅ PASS\n');
    } else {
      console.log('❌ FAIL\n');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message, '\n');
  }

  // 3. Test query_ai_accuracy_stats
  console.log('--- TEST 3: toolQueryAiAccuracyStats ---');
  try {
    const res = await toolQueryAiAccuracyStats();
    console.log('Kết quả:', JSON.stringify(res, null, 2));
    if (res.stats || res.result) {
      console.log('✅ PASS\n');
    } else {
      console.log('❌ FAIL\n');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message, '\n');
  }

  // 4. Test query_hot_matches
  console.log('--- TEST 4: toolQueryHotMatches ---');
  try {
    const res = await toolQueryHotMatches();
    console.log('Kết quả:', JSON.stringify(res, null, 2));
    if (res.hotMatches || res.result) {
      console.log('✅ PASS\n');
    } else {
      console.log('❌ FAIL\n');
    }
  } catch (err) {
    console.error('❌ Lỗi:', err.message, '\n');
  }

  console.log('🎉 Kiểm thử Chatbox Tools hoàn tất!');
}

runTests();
