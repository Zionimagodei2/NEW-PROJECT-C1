import os

def cache_bust():
    root_dir = 'www.transrapidexpress.com'
    old_script = 'js/track-sync.js'
    new_script = 'js/track-sync-v3.js'
    
    count = 0
    for root, dirs, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.html'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                
                if old_script in content:
                    new_content = content.replace(old_script, new_script)
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Busted: {path}")
                    count += 1
    
    print(f"Total files updated: {count}")

if __name__ == "__main__":
    cache_bust()
