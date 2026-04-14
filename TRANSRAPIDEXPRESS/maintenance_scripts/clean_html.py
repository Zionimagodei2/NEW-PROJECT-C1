import os, glob, re

root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"

html_files = []
for p in glob.glob(os.path.join(root, "*.html")):
    html_files.append(p)
for p in glob.glob(os.path.join(root, "services", "*.html")):
    html_files.append(p)

count = 0
for f in html_files:
    if "titan_source.html" in f or "source_pretty.html" in f:
        continue
    try:
        with open(f, "r", encoding="utf-8") as file:
            content = file.read()
            
        # 1. Remove Next.js script chunks (this is what is breaking the site by freezing the DOM)
        content = re.sub(r'<script\b[^>]*_next/static/chunks/[^>]*>.*?</script>', '', content, flags=re.DOTALL)
        
        # 2. Remove Next.js inline scripts (self.__next_f)
        content = re.sub(r'<script>\(self\.__next_f.*?</script>', '', content, flags=re.DOTALL)
        content = re.sub(r'<script>self\.__next_f.*?</script>', '', content, flags=re.DOTALL)

        # 3. Also fix the preloader explicitly by adding an inline script to destroy it immediately
        # We will inject a small inline script just before the preloader HTML or at the end of head
        if "hide-preloader-inline" not in content:
            inline_fix = """<script id="hide-preloader-inline">
              window.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('.fixed.inset-0.z-\\\\[200\\\\]').forEach(el => el.remove());
              });
              setTimeout(()=>{ document.querySelectorAll('.fixed.inset-0.z-\\\\[200\\\\]').forEach(el => el.remove()); }, 500);
            </script></head>"""
            content = content.replace("</head>", inline_fix)

        with open(f, "w", encoding="utf-8") as file:
            file.write(content)
        count += 1
    except Exception as e:
        print(f"Error {f}: {e}")

print(f"Cleaned {count} HTML files. Removed broken Next.js React hydration.")
