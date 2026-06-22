const fs = require('fs');
const path = require('path');

const files = [
  'api/index.js',
  'components/staff/StaffChecklistPanel.jsx',
  'components/staff/staffConstants.js',
  'pages/create-order.jsx',
  'pages/inventory.jsx'
];

const basePath = 'C:/Users/anhdu/OneDrive/Desktop/code/appscript/spa-manager-base/src/client';

files.forEach(file => {
  const fullPath = path.join(basePath, file);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  
  if (content.includes('.toISOString()')) {
    let importPath = '';
    if (file.startsWith('api/') || file.startsWith('pages/')) {
      importPath = '../utils/dateFormatter';
    } else if (file.startsWith('components/staff/')) {
      importPath = '../../utils/dateFormatter';
    }
    
    // Add import if not present
    if (!content.includes('toLocalDateTimeString')) {
      // Find the last import statement
      const importRegex = /^import\s+.*?;?\s*$/gm;
      let lastImportIndex = 0;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        lastImportIndex = match.index + match[0].length;
      }
      
      const importStmt = `\nimport { toLocalDateTimeString } from "${importPath}";`;
      if (lastImportIndex > 0) {
        content = content.slice(0, lastImportIndex) + importStmt + content.slice(lastImportIndex);
      } else {
        content = importStmt.trim() + '\n\n' + content;
      }
    }
    
    // Replace .toISOString()
    // We loop to handle nested cases
    let changed = true;
    while (changed) {
      changed = false;
      content = content.replace(/(new Date\([^)]*(?:\([^)]*\)[^)]*)*\)|[a-zA-Z0-9_]+)\.toISOString\(\)/g, (match, p1) => {
        changed = true;
        return `toLocalDateTimeString(${p1})`;
      });
    }
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Updated ' + file);
  }
});
