import os, glob
from bs4 import BeautifulSoup

root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"
files = glob.glob(os.path.join(root, "**", "*.html"), recursive=True)

count = 0
for f in files:
    if "titan_source.html" in f or "source_pretty.html" in f:
        continue
    try:
        with open(f, "r", encoding="utf-8") as file:
            content = file.read()
            
        soup = BeautifulSoup(content, 'html.parser')
        changed = False

        # 1. Find the Chat Panel.
        # We know it contains "Powered by Transrapidexpress Support"
        targets = soup.find_all('p')
        for p in targets:
            if "Powered by Transrapidexpress Support" in p.text:
                # Find the top-level fixed component wrapping this
                panel = p
                # traverse up until we hit a div that has 'fixed' class and 'bottom-'
                while panel.parent and panel.parent.name != 'body':
                    cls = panel.parent.get('class', [])
                    if isinstance(cls, list) and any('fixed' in c for c in cls):
                        panel = panel.parent
                        break
                    else:
                        panel = panel.parent
                
                if panel:
                    panel.decompose()
                    changed = True

        # 2. Find the Toggle Button.
        # We know it has `<svg ... lucide-message-circle>` OR `aria-haspopup` for dialog
        # The whatsapp link is an <a> tag, not a <button>.
        # So we can look for any <button> that has a fixed position and bottom right classes.
        for btn in soup.find_all('button'):
            cls = btn.get('class', [])
            if isinstance(cls, list):
                is_fixed_bottom = any('fixed' in c for c in cls) and any('bottom-' in c for c in cls)
                if is_fixed_bottom:
                    btn.decompose()
                    changed = True
                    continue
            
            # check if it controls a dialog and contains a message icon
            svgs = btn.find_all('svg')
            for svg in svgs:
                svg_cls = svg.get('class', [])
                if isinstance(svg_cls, list) and 'lucide-message-circle' in svg_cls:
                    btn.decompose()
                    changed = True
                    break

        # 3. Double check for any other known old chat containers just in case.
        for div in soup.find_all('div'):
            cls = div.get('class', [])
            if isinstance(cls, list) and "w-90" in cls and "bottom-20" in cls and "fixed" in cls:
                div.decompose()
                changed = True

        if changed:
            with open(f, "w", encoding="utf-8") as out:
                # To avoid breaking JS with soup serialization formatting, just write string.
                out.write(str(soup))
            count += 1
            
    except Exception as e:
        print(f"Error {f}: {e}")

print(f"Successfully deleted the old hardcoded live chat widget from {count} HTML files.")
