#!/usr/bin/env python3
"""Bundle the game into one self-contained HTML fragment (for publishing as an artifact)."""
import re, sys, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'index.html')).read()
css = re.search(r'<style>(.*?)</style>', src, re.S).group(1)
body = src[src.index('<body>') + 6: src.index('<script src=')]
scripts = re.findall(r'<script src="(js/[^"]+)"', src)
js = ''
for f in scripts:
    code = open(os.path.join(root, f)).read()
    if f.endswith('main.js'):
        code = re.sub(r"if \('serviceWorker' in navigator[^\n]*\n", '', code)       # no service workers inside an artifact
    assert '</script' not in code, f
    js += '/* ' + f + ' */\n' + code + '\n'
out = ('<title>Zomb Survive</title>\n<style>\n:root{color-scheme:dark}\n' + css + '\n</style>\n' + body + '<script>\n' + js + '</script>\n')
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'dist', 'zomb-survive.html')
open(dst, 'w').write(out)
print(dst, len(out) // 1024, 'KB')
