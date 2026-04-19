const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'www.transrapidexpress.com');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.html') && file !== 'titan_source.html' && file !== 'source_pretty.html') {
            try {
                let content = fs.readFileSync(fullPath, 'utf8');
                if (!content.includes('site-fix.js')) {
                    const isSubdir = dir !== root;
                    const scriptPath = isSubdir ? '../js/site-fix.js' : 'js/site-fix.js';
                    const tag = `<script src="${scriptPath}" defer></script>\n</body>`;
                    
                    if (content.includes('</body>')) {
                        content = content.replace('</body>', tag);
                        fs.writeFileSync(fullPath, content, 'utf8');
                        console.log(`Fixed: ${path.relative(root, fullPath)}`);
                    } else {
                        console.log(`Warning: </body> not found in ${path.relative(root, fullPath)}`);
                    }
                }
            } catch (e) {
                console.error(`Error processing ${file}: ${e.message}`);
            }
        }
    }
}

console.log("Starting injection...");
processDir(root);
console.log("Injection complete.");
