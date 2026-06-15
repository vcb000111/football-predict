import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/HomePageClient.js');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- LINE 690 IN HomePageClient.js ---');
console.log(lines[689]); // index 689 là dòng 690

console.log('--- LINE 705 IN HomePageClient.js ---');
console.log(lines[704]); // index 704 là dòng 705
