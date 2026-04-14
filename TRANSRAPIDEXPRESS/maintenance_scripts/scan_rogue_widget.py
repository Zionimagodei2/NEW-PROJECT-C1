import os
from bs4 import BeautifulSoup

root = r'c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com'
html_files = []
for dp, dn, filenames in os.walk(root):
    for f in filenames:
        if f.endswith('.html'):
            html_files.append(os.path.join(dp, f))

print(f"Scanning {len(html_files)} files...")

for f in html_files:
    try:
        content = open(f, 'r', encoding='utf-8').read()
        
        # Check for the literal string reported by user or scripts
        found_powered = 'Powered by Transrapidexpress Support' in content
        found_send = 'Send Message' in content
        
        if found_powered or found_send:
            print(f"\nMatch in: {f}")
            soup = BeautifulSoup(content, 'html.parser')
            
            # Find the 'Powered by' text specifically
            powered_tags = soup.find_all(lambda t: t.text and 'Powered by Transrapidexpress Support' in t.text)
            for tag in powered_tags:
                if tag.name not in ['script', 'style']:
                    print(f"  [TEXT FOUND] <{tag.name}>: {tag.text[:100].strip()}")
                    # Parent analysis
                    parent = tag.parent
                    print(f"  [PARENT] <{parent.name}> class: {parent.get('class')}")

    except Exception as e:
        print(f"Error scanning {f}: {e}")
