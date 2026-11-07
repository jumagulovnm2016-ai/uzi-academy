#!/usr/bin/env python3
"""Собирает sw.js: список страниц и картинок для офлайн-режима.

Запускать после добавления новых тестов или картинок:
    python3 build-sw.py
Каждый запуск меняет версию кэша, поэтому телефоны курсантов подтянут обновление.
Картинки из img/<имя-страницы>/ скачиваются в фоне при открытии этой страницы.
"""
import json, os, time

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

pages = sorted(f for f in os.listdir('.') if f.endswith('.html'))
for sub in sorted(os.listdir('.')):
    if os.path.isdir(sub) and not sub.startswith('.') and os.path.isfile(os.path.join(sub, 'index.html')):
        pages.append(sub + '/')
precache = ['./'] + ['./' + p for p in pages] + ['./offline.js', './manifest.webmanifest',
            './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png']
# Каталог для сборного экзамена: разделы и тесты в том же порядке, что на главной странице
import re
catalog, section = [], None
for m in re.finditer(r'<h2>(.*?)</h2>|href="(?:quiz|guess)\.html\?t=([a-z0-9-]+)"', open('index.html', encoding='utf-8').read()):
    if m.group(1):
        section = {'section': m.group(1), 'tests': []}; catalog.append(section)
    elif section is not None and os.path.isfile('data/tests/%s.json' % m.group(2)):
        t = json.load(open('data/tests/%s.json' % m.group(2), encoding='utf-8'))
        section['tests'].append({'id': t['id'], 'title': t['title'], 'format': t['format'], 'n': len(t['questions']),
                                 'img': sum(1 for q in t['questions'] if q.get('img'))})
catalog = [c for c in catalog if c['tests']]
with open('data/catalog.json', 'w', encoding='utf-8') as f:
    json.dump(catalog, f, ensure_ascii=False, indent=1)
precache += ['./data/catalog.json']

# Единый движок тестов и банк вопросов
precache += ['./engine/' + f for f in sorted(os.listdir('engine'))] if os.path.isdir('engine') else []
precache += ['./data/tests/' + f for f in sorted(os.listdir('data/tests')) if f.endswith('.json')] if os.path.isdir('data/tests') else []

img_map = {}
if os.path.isdir('img'):
    for folder in sorted(os.listdir('img')):
        path = os.path.join('img', folder)
        if os.path.isdir(path):
            img_map[folder] = ['./img/%s/%s' % (folder, f) for f in sorted(os.listdir(path)) if not f.startswith('.')]

tpl = open('sw.template.js', encoding='utf-8').read()
out = (tpl.replace('__VERSION__', time.strftime('%Y%m%d-%H%M%S'))
          .replace('__PRECACHE__', json.dumps(precache, ensure_ascii=False, indent=1))
          .replace('__IMGMAP__', json.dumps(img_map, ensure_ascii=False, indent=1)))
open('sw.js', 'w', encoding='utf-8').write(out)
print('sw.js: %d страниц, %d папок с картинками (%d файлов)' % (len(pages), len(img_map), sum(map(len, img_map.values()))))
