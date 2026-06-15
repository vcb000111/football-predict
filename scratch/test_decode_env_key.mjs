import { deobfuscateKey } from '../src/lib/db.js';

const key1 = "AQ.Ab8RN6JO44f0-RDgPU6cIAjg-GvrlbxamzMN31XSW_wsaMcneg";
const key2 = "AQ.Ab8RN6IXTMwxzqRTX0rmDGvGvfdHWu05V-YqsE3QbQTWtX6qxg";

console.log("deobfuscateKey(key1):", deobfuscateKey(key1));
console.log("deobfuscateKey(key2):", deobfuscateKey(key2));

// Thử giải mã thủ công bằng base64/base64url
function tryBase64(str) {
  try {
    const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    console.log("Base64 decoded:", decoded);
  } catch (e) {
    console.log("Base64 error:", e.message);
  }
}

console.log("Try Base64 key1:");
tryBase64(key1);
