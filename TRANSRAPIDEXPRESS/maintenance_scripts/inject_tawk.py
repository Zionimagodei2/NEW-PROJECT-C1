import os, glob

root = r"c:\Users\E.A.J.E (ZION)\Documents\TRANSRAPIDEXPRESS\www.transrapidexpress.com"

html_files = []
for p in glob.glob(os.path.join(root, "*.html")):
    html_files.append(p)
for p in glob.glob(os.path.join(root, "services", "*.html")):
    html_files.append(p)

tawk_script = """
<!--Start of Tawk.to Script-->
<script type="text/javascript">
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/69de45743d91a21c36a8ba42/1jm63uk6v';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
</script>
<!--End of Tawk.to Script-->
</body>
"""

count = 0
for f in html_files:
    if "titan_source.html" in f or "source_pretty.html" in f:
        continue
    try:
        with open(f, "r", encoding="utf-8") as file:
            content = file.read()
            
        if "embed.tawk.to/69de45743d91a21c36a8ba42/1jm63uk6v" not in content:
            # Replace the first or last </body> tag
            if "</body>" in content:
                # Replace the LAST occurrence of </body>
                parts = content.rsplit("</body>", 1)
                content = parts[0] + tawk_script + parts[1]
                
                with open(f, "w", encoding="utf-8") as out:
                    out.write(content)
                count += 1
    except Exception as e:
        print(f"Error {f}: {e}")

print(f"Injected Tawk.to snippet into {count} HTML files.")
