const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'unpacked_app', 'dist', 'languageServer.js');
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('--cloud_code_endpoint')) {
    console.log(`Line ${i + 1}:`);
    for (let j = Math.max(0, i - 15); j <= Math.min(lines.length - 1, i + 15); j++) {
      console.log(`${j + 1}: ${lines[j]}`);
    }
  }
}
