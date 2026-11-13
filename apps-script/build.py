#!/usr/bin/env python3
"""Builds apps-script/Index.html: the dashboard as one self-contained page for Apps Script.

Run from the repo root:  python3 apps-script/build.py
Inlines style.css, dashboard.css and dashboard.js, and points images/links at the live site.
"""
import re, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://jdbwoodworks.com/'

html = (root / 'dashboard.html').read_text()
css = (root / 'style.css').read_text() + '\n' + (root / 'dashboard.css').read_text()
js = (root / 'dashboard.js').read_text()

css = css.replace('url("images/', 'url("' + SITE + 'images/')
assert 'url("images/' not in css

# external stylesheets that are local files get inlined
html = html.replace('<link rel="stylesheet" href="style.css">\n', '')
html = html.replace('<link rel="stylesheet" href="dashboard.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="dashboard.js"></script>', '<script>\n' + js.replace('</script>', '<\\/script>') + '\n</script>')

# assets and links must be absolute (the page is served from Google, not from the site)
html = html.replace('href="images/', 'href="' + SITE + 'images/').replace('src="images/', 'src="' + SITE + 'images/')
html = html.replace('<a class="brand" href="index.html">', '<a class="brand" href="' + SITE + '" target="_blank" rel="noopener">')
html = html.replace('<a href="store.html">', '<a href="' + SITE + 'store.html" target="_blank" rel="noopener">')

# no leftovers that would 404 inside the Google iframe
left = re.findall(r'(?:href|src)="(?!https?:|#|data:)[^"]+"', html)
assert not left, left
assert 'dashboard.js' not in html.replace('dashboard.js (', '')

(root / 'apps-script' / 'Index.html').write_text(html)
print('wrote apps-script/Index.html', len(html), 'bytes')
