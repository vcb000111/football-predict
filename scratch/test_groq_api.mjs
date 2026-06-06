import { callGroqModel } from '../src/lib/groq.js';

async function runTest() {
  const fakeKey = 'gsk_fake_key_1234567890abcdefghijklmnopqrstuvwxyz';
  const model = 'llama-3.1-8b-instant';
  const prompt = 'Hello, reply with "pong" only if you receive this.';

  console.log(`📡 Sending test request to Groq API with fake key...`);
  console.log(`Model: ${model}`);
  
  try {
    const result = await callGroqModel(model, [fakeKey], prompt);
    console.log('🎉 Success! Result:', result);
  } catch (err) {
    console.log('❌ Caught Expected Error (Network & Request Logic is fine):');
    console.log(err.message);
  }
}

runTest();
