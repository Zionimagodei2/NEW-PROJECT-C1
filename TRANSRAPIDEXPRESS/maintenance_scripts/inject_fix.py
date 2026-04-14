"""Inject site-fix.js into all HTML pages."""
import os
import glob

ROOT = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"
SCRIPT_TAG = '<script src="js/site-fix.js" defer></script>'
SCRIPT_TAG_SUB = '<script src="../js/site-fix.js" defer></script>'

count = 0

# Root-level HTML files
for f in glob.glob(os.path.join(ROOT, "*.html")):
    if "titan_source.html" in f or "source_pretty.html" in f:
        continue
    with open(f, "r", encoding="utf-8") as fh:
        content = fh.read()
    if "site-fix.js" in content:
        print(f"  SKIP (already has): {os.path.basename(f)}")
        continue
    # Insert before </body>
    if "</body>" in content:
        content = content.replace("</body>", f"{SCRIPT_TAG}\n</body>")
    elif "</html>" in content:
        content = content.replace("</html>", f"{SCRIPT_TAG}\n</html>")
    else:
        content += f"\n{SCRIPT_TAG}\n"
    with open(f, "w", encoding="utf-8") as fh:
        fh.write(content)
    count += 1
    print(f"  FIXED: {os.path.basename(f)}")

# Services subdirectory
services_dir = os.path.join(ROOT, "services")
if os.path.isdir(services_dir):
    for f in glob.glob(os.path.join(services_dir, "*.html")):
        with open(f, "r", encoding="utf-8") as fh:
            content = fh.read()
        if "site-fix.js" in content:
            print(f"  SKIP (already has): services/{os.path.basename(f)}")
            continue
        if "</body>" in content:
            content = content.replace("</body>", f"{SCRIPT_TAG_SUB}\n</body>")
        elif "</html>" in content:
            content = content.replace("</html>", f"{SCRIPT_TAG_SUB}\n</html>")
        else:
            content += f"\n{SCRIPT_TAG_SUB}\n"
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(content)
        count += 1
        print(f"  FIXED: services/{os.path.basename(f)}")

print(f"\nDone! Injected site-fix.js into {count} files.")
