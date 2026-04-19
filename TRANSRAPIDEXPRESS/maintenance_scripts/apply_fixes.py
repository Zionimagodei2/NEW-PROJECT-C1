import os
import glob

root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"

count = 0

html_files = glob.glob(os.path.join(root, "*.html"))
services_files = glob.glob(os.path.join(root, "services", "*.html"))

for filepath in html_files + services_files:
    if "titan_source.html" in filepath or "source_pretty.html" in filepath:
        continue
        
    js_path = "js/site-fix.js"
    # If the file is in a subdirectory (like services/), we need to adjust the path to the JS folder
    rel_path = os.path.relpath(filepath, root)
    if os.path.dirname(rel_path) != "":
        js_path = "../js/site-fix.js"
        
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            
        if "site-fix.js" not in content and "</body>" in content:
            content = content.replace("</body>", f'<script src="{js_path}" defer></script>\n</body>')
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(content)
            count += 1
            print(f"Fixed {rel_path}")
    except Exception as e:
        print(f"Error on {rel_path}: {e}")

print(f"\nSuccessfully injected site-fix.js into {count} HTML files.")
