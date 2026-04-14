import os, glob

root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"
script_tag_root = '<script src="js/site-fix.js" defer></script>'
script_tag_sub = '<script src="../js/site-fix.js" defer></script>'

html_files = []
for p in glob.glob(os.path.join(root, "*.html")):
    html_files.append((p, script_tag_root))
for p in glob.glob(os.path.join(root, "services", "*.html")):
    html_files.append((p, script_tag_sub))

count = 0
for f, tag in html_files:
    if "titan_source.html" in f or "source_pretty.html" in f:
        continue
    try:
        with open(f, "r", encoding="utf-8") as file:
            content = file.read()
        if "site-fix.js" not in content and "</body>" in content:
            content = content.replace("</body>", f"{tag}\n</body>")
            with open(f, "w", encoding="utf-8") as file:
                file.write(content)
            print(f"Fixed {os.path.basename(f)}")
            count += 1
    except Exception as e:
        print(f"Error {f}: {e}")

print(f"Fixed {count} files total.")
