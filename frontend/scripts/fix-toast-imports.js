// scripts/fix-toast-imports.js
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '../src');
const OLD_IMPORT = /import\s*{\s*useToast\s*}\s*from\s*["']\.\/use-toast["']/g;
const NEW_IMPORT = 'import { useSafeToast } from "@/lib/toast"';

function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Substituir import
  if (OLD_IMPORT.test(content)) {
    const newContent = content.replace(OLD_IMPORT, NEW_IMPORT);
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✅ Fixed: ${filePath}`);
    return true;
  }
  return false;
}

function walkDir(dir) {
  let files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      fixFile(filePath);
    }
  }
}

console.log("🔧 Fixing toast imports...");
walkDir(SRC_DIR);
console.log("✅ Done!");