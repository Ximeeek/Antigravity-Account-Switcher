const fs = require('fs');

const targetPath = 'C:\\Users\\jakub\\AppData\\Local\\Programs\\Antigravity\\resources\\bin\\language_server.exe';
const buffer = fs.readFileSync(targetPath);
const str = buffer.toString('ascii');

const matches = new Set();
const regex = /[a-zA-Z0-9_\-\.\/]{4,}(uuid|github\.com\/google\/uuid|google\/uuid)[a-zA-Z0-9_\-\.\/]*/gi;
let match;
while ((match = regex.exec(str)) !== null) {
  matches.add(match[0]);
}

console.log('UUID references:');
console.log(Array.from(matches).slice(0, 50));
