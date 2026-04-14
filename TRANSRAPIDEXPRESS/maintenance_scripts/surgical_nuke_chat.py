import os, glob
from bs4 import BeautifulSoup

# Define the root directory
root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"
# Correctly find all HTML files
files = glob.glob(os.path.join(root, "**", "*.html"), recursive=True)

count = 0
for f in files:
    # Skip any scraper source files
    if any(skip in f for skip in ["titan_source.html", "source_pretty.html"]):
        continue
        
    try:
        with open(f, "r", encoding="utf-8") as file:
            content = file.read()
            
        soup = BeautifulSoup(content, 'html.parser')
        changed = False

        # Target 1: Forms that look like the old chat widget
        # Specifically those with the "Type a message..." placeholder
        for form in soup.find_all('form'):
            inputs = form.find_all('input', placeholder="Type a message...")
            if inputs:
                # We found the chat form. Now find its parent container that is fixed.
                # Usually it's in a div with "fixed bottom-"
                current = form
                target_container = None
                
                # Walk up to find the container we should remove
                depth = 0
                while current.parent and current.parent.name != 'body' and depth < 10:
                    cls = current.parent.get('class', [])
                    if isinstance(cls, list) and any('fixed' in c for c in cls):
                        target_container = current.parent
                        break
                    current = current.parent
                    depth += 1
                
                if target_container:
                    target_container.decompose()
                    changed = True
                    print(f"Removed fixed container from {f}")
                else:
                    # If we couldn't find a fixed container, just remove the form itself
                    form.decompose()
                    changed = True
                    print(f"Removed rogue form from {f}")

        # Target 2: Any div that contains the "Powered by" text
        for p in soup.find_all(['p', 'div', 'span']):
            if "Powered by Transrapidexpress Support" in p.get_text():
                # Remove this element and maybe its parents if they are empty
                p.decompose()
                changed = True
                print(f"Removed 'Powered by' text from {f}")

        if changed:
            with open(f, "w", encoding="utf-8") as out:
                out.write(str(soup))
            count += 1
            
    except Exception as e:
        print(f"Error processing {f}: {e}")

print(f"\nSuccessfully cleaned up {count} HTML files in the final sweep.")
