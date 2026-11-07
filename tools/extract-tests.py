#!/usr/bin/env python3
"""Переносит тесты со старых страниц в банк вопросов data/tests/*.json.

Запуск из корня репозитория:
    python3 tools/extract-tests.py liver kidney-ums brain-guess ...
Старые страницы читаются из git, из коммита до переноса (SRC_COMMIT),
поэтому скрипт можно повторить и после замены страниц переадресацией.

Поддерживаются три вида старых страниц:
  cfg   — тест с объектом CFG и массивом Q (JSON);
  quiz  — тест с TITLE/SALT/LIMIT и массивом Q (JS), часть вопросов с эхограммами;
  guess — игра «Угадай снимок» (TITLE/LIMIT/IMG, эхограмма в каждом вопросе).
"""
import html, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_COMMIT = os.environ.get('SRC_COMMIT', '5c9265c')   # копия «Тестов» до переноса


def old_page(name):
    return subprocess.check_output(['git', 'show', f'{SRC_COMMIT}:{name}.html'], cwd=ROOT).decode('utf-8')


def text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', fragment))).strip()


def find(pattern, s, default=''):
    m = re.search(pattern, s, re.S)
    return text(m.group(1)) if m else default


def js_array(s, start):
    """Вычисляет JS-массив вопросов через node (в старых страницах это не всегда строгий JSON)."""
    i = s.index('[', re.search(start, s).start())
    j = s.index('\n];', i) + 2
    src = 'process.stdout.write(JSON.stringify(' + s[i:j] + '))'
    return json.loads(subprocess.check_output(['node', '-e', src]).decode('utf-8'))


def with_ids(name, qs, img_dir=None):
    out = []
    for n, q in enumerate(qs, 1):
        item = {'id': f'{name}-{n:03d}'}
        item.update(q)
        if img_dir and item.get('img'):
            item['img'] = img_dir + item['img']
        out.append(item)
    return out


def about_of(sub):
    # Первая часть описания — о чём тест; фразы про режим и таймер движок пишет сам.
    return sub.split(' После ответа')[0].strip()


def extract(name):
    s = old_page(name)
    head = {
        'eyebrow': find(r'<span class="eyebrow">(.*?)</span>', s),
        'h1': find(r'<h1>(.*?)</h1>', s),
        'pageTitle': find(r'<title>(.*?)</title>', s),
    }
    if 'const CFG=' in s:
        cfg = json.loads(re.search(r'const CFG=(\{.*?\});', s).group(1))
        return {'id': name, 'format': 'quiz', 'title': cfg['title'], 'minutes': cfg['minutes'], 'salt': cfg['salt'],
                **head, 'about': about_of(find(r'<header>.*?<p class="sub">(.*?)</p>', s)),
                'footer': find(r'<footer>(.*?)<details>', s),
                'questions': with_ids(name, js_array(s, r'const Q\s*=\s*\['))}
    if 'id="tiles"' in s:
        sec = int(re.search(r'const LIMIT=(\d+);', s).group(1))
        m = re.search(r'const IMG="([^"]+)"', s)
        img_dir = m.group(1) if m else None          # квизы на время — без эхограмм
        salt = re.search(r'for\(const ch of s\+"\|([^"]+)"\)', s).group(1)
        return {'id': name, 'format': 'guess', 'title': re.search(r'const TITLE="([^"]+)"', s).group(1),
                'seconds': sec, 'salt': salt, **head,
                'about': find(r'<section class="card" id="start">\s*<p class="muted">(.*?)</p>', s),
                'footer': find(r'<footer>(.*?)</footer>', s),
                'questions': with_ids(name, js_array(s, r'const Q\s*=\s*\['), img_dir)}
    # тест с TITLE/SALT/LIMIT
    minutes = int(re.search(r'const LIMIT=(\d+)\*60\*1000', s).group(1))
    # каталог картинок задан в коде страницы: "img/<папка>/"+x.img или "img/"+x.img
    m = re.search(r'src="(img/[^"]*)"\+x\.img', s)
    img_dir = m.group(1) if m else f'img/{name}/'
    return {'id': name, 'format': 'quiz', 'title': re.search(r'const TITLE="([^"]+)"', s).group(1), 'minutes': minutes,
            'salt': re.search(r'const SALT="([^"]+)"', s).group(1), **head,
            'about': about_of(find(r'<header>.*?<p class="sub">(.*?)</p>', s)),
            'footer': find(r'<footer>(.*?)<details>', s),
            'questions': with_ids(name, js_array(s, r'const Q\s*=\s*\['), img_dir)}


def main(names):
    os.makedirs(os.path.join(ROOT, 'data', 'tests'), exist_ok=True)
    for name in names:
        t = extract(name)
        with open(os.path.join(ROOT, 'data', 'tests', name + '.json'), 'w', encoding='utf-8') as f:
            json.dump(t, f, ensure_ascii=False, indent=1)
            f.write('\n')
        imgs = sum(1 for q in t['questions'] if q.get('img'))
        print(f'{name}: {t["format"]}, {len(t["questions"])} вопросов, с эхограммой {imgs}')


if __name__ == '__main__':
    main(sys.argv[1:])
