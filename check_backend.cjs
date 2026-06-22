const fs = require('fs');
const path = require('path');

const gasContent = fs.readFileSync('src/client/api/adapters/gasAdapter.js', 'utf8');
const callMatches = [...gasContent.matchAll(/call\([\"']([a-zA-Z0-9_]+)[\"']/g)].map(m => m[1]);

// read all js files in src/core
const coreDir = 'src/core';
const files = fs.readdirSync(coreDir).filter(f => f.endsWith('.js'));
const functionNames = new Set();

for (const file of files) {
  const content = fs.readFileSync(path.join(coreDir, file), 'utf8');
  const matches = [...content.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\(/g)].map(m => m[1]);
  matches.forEach(m => functionNames.add(m));
  
  const varMatches = [...content.matchAll(/(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>)/g)].map(m => m[1]);
  varMatches.forEach(m => functionNames.add(m));
}

// Add gasAdapter local functions
const gasLocalMatches = [...gasContent.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\(/g)].map(m => m[1]);
gasLocalMatches.forEach(m => functionNames.add(m));

const missing = [...new Set(callMatches)].filter(name => !functionNames.has(name) && !functionNames.has(name + '_'));
console.log('Functions called via call() but possibly missing in backend:');
console.log(missing);
