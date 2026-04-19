import os
import re
from bs4 import BeautifulSoup

root = r'C:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com'
html_files = []
for dp, dn, filenames in os.walk(root):
    for f in filenames:
        if f.endswith('.html'):
            html_files.append(os.path.join(dp, f))

print(f"Decoupling {len(html_files)} files from Next.js hydration...")

for file_path in html_files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        soup = BeautifulSoup(content, 'html.parser')

        # 1. Remove all Next.js specific script tags
        # These are usually like <script src="_next/static/chunks/..." defer=""></script>
        scripts_to_remove = soup.find_all('script', src=re.compile(r'_next/static|/_next/static'))
        for s in scripts_to_remove:
            s.decompose()

        # 2. Remove preloads for scripts
        preloads_to_remove = soup.find_all('link', rel='preload', as_='script', href=re.compile(r'_next/static|/_next/static'))
        for p in preloads_to_remove:
            p.decompose()

        # 3. Remove inline scripts that might be part of Next.js hydration (like JSON data)
        # Often looks like <script id="__NEXT_DATA__" type="application/json">...</script>
        next_data = soup.find('script', id='__NEXT_DATA__')
        if next_data:
            next_data.decompose()

        # 4. Ensure site-fix.js and track-sync.js are correctly placed at the bottom of the body
        # If they aren't there, add them.
        body = soup.find('body')
        if body:
            # Check if they exist
            has_site_fix = soup.find('script', src=re.compile(r'js/site-fix\.js'))
            has_track_sync = soup.find('script', src=re.compile(r'js/track-sync\.js'))

            if not has_track_sync:
                 # Only add it if it's likely needed (or just add it globally for safety)
                 new_script = soup.new_tag('script', src='js/track-sync.js', defer='')
                 body.append(new_script)
            
            if not has_site_fix:
                 new_script = soup.new_tag('script', src='js/site-fix.js', defer='')
                 body.append(new_script)

        # 5. Clean up any residual empty script tags or excessive whitespace (optional)
        
        # Write back the cleaned HTML
        # Using prettify can sometimes break inline styles in scraped sites, so we'll just use string conversion
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(str(soup))
            
        print(f"  [CLEANED] {os.path.basename(file_path)}")

    except Exception as e:
        print(f"  [ERROR] {file_path}: {e}")

print("\nDecoupling complete. The site is now independent of Next.js hydration.")
