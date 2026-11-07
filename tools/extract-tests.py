#!/usr/bin/env python3
"""Переносит тесты со старых страниц в банк вопросов data/tests/*.json.

Запуск из корня репозитория:
    python3 tools/extract-tests.py liver kidney-ums brain-guess ...
Страницы читаются из папки SRC_DIR (копия репозитория «Тесты»), а если она не задана —
из git, из коммита до переноса (SRC_COMMIT).

id вопросов постоянные: вопрос с тем же текстом сохраняет id из прежнего data/tests/<имя>.json,
новые вопросы получают следующие свободные номера. Поэтому вставка вопроса в середину теста
не сдвигает id остальных — история ошибок, повторение и статистика не перепутаются.

Поддерживаются три вида старых страниц:
  cfg   — тест с объектом CFG и массивом Q (JSON);
  quiz  — тест с TITLE/SALT/LIMIT и массивом Q (JS), часть вопросов с эхограммами;
  guess — игра «Угадай снимок» (TITLE/LIMIT/IMG, эхограмма в каждом вопросе).
"""
import html, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_COMMIT = os.environ.get('SRC_COMMIT', '5c9265c')   # копия «Тестов» до переноса
SRC_DIR = os.environ.get('SRC_DIR')


def old_page(name):
    if SRC_DIR:
        with open(os.path.join(SRC_DIR, name + '.html'), encoding='utf-8') as f:
            return f.read()
    return subprocess.check_output(['git', 'show', f'{SRC_COMMIT}:{name}.html'], cwd=ROOT).decode('utf-8')


def kind(s):
    """Вид страницы теста или None, если это не тест."""
    if 'const CFG=' in s and re.search(r'const Q\s*=\s*\[', s):
        return 'cfg'
    if 'id="tiles"' in s and re.search(r'const Q\s*=\s*\[', s):
        return 'guess'
    if re.search(r'const SALT="', s) and re.search(r'const Q\s*=\s*\[', s) and re.search(r'const LIMIT=\d+\*60\*1000', s):
        return 'quiz'
    return None


def text(fragment):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', fragment))).strip()


def find(pattern, s, default=''):
    m = re.search(pattern, s, re.S)
    return text(m.group(1)) if m else default


def closing(s, i):
    """Позиция скобки, закрывающей s[i] == '[', с учётом строк и комментариев JS."""
    depth, k, n = 0, i, len(s)
    while k < n:
        c = s[k]
        if c in '"\'`':
            q = c; k += 1
            while k < n and s[k] != q:
                k += 2 if s[k] == '\\' else 1
        elif c == '/' and s[k + 1:k + 2] == '/':
            k = s.find('\n', k); k = n if k < 0 else k
        elif c == '/' and s[k + 1:k + 2] == '*':
            k = s.find('*/', k + 2) + 1
        elif c in '[{(':
            depth += 1
        elif c in ']})':
            depth -= 1
            if depth == 0:
                return k
        k += 1
    raise ValueError('не найден конец массива вопросов')


def js_array(s, start):
    """Вычисляет JS-массив вопросов через node (в старых страницах это не всегда строгий JSON)."""
    i = s.index('[', re.search(start, s).start())
    j = closing(s, i) + 1
    src = 'process.stdout.write(JSON.stringify(' + s[i:j] + '))'
    return json.loads(subprocess.check_output(['node', '-e', src]).decode('utf-8'))


def norm(t):
    return re.sub(r'\s+', ' ', str(t or '')).strip().lower()


def with_ids(name, qs, img_dir=None):
    prev_path = os.path.join(ROOT, 'data', 'tests', name + '.json')
    prev = []
    if os.path.isfile(prev_path):
        with open(prev_path, encoding='utf-8') as f:
            prev = json.load(f).get('questions', [])
    by_text = {}
    for q in prev:
        by_text.setdefault(norm(q.get('q')), []).append(q['id'])
    nums = [int(m.group(1)) for q in prev for m in [re.search(r'-(\d+)$', q['id'])] if m]
    nxt = max(nums, default=0) + 1
    # 1) тот же текст вопроса → тот же id
    found = []
    taken = set()
    for q in qs:
        ids = [i for i in by_text.get(norm(q.get('q')), []) if i not in taken]
        found.append(ids[0] if ids else None)
        if ids: taken.add(ids[0])
    # 2) текст исправили, а варианты ответа те же → тот же id
    by_opts = {}
    for q in prev:
        if q['id'] not in taken:
            by_opts.setdefault(tuple(norm(o) for o in q.get('o', [])), []).append(q['id'])
    for k, q in enumerate(qs):
        if found[k] is None:
            ids = [i for i in by_opts.get(tuple(norm(o) for o in q.get('o', [])), []) if i not in taken]
            if ids:
                found[k] = ids[0]; taken.add(ids[0])
    out = []
    for k, q in enumerate(qs):
        qid = found[k]
        if qid is None:                       # новый вопрос — следующий свободный номер
            qid = f'{name}-{nxt:03d}'; nxt += 1
        item = {'id': qid}
        item.update(q)
        if img_dir and item.get('img'):
            item['img'] = img_dir + item['img']
        out.append(item)
    return out


def about_of(sub):
    # Первая часть описания — о чём тест; фразы про режим и таймер движок пишет сам.
    return sub.split(' После ответа')[0].strip()


def extract(name, s=None):
    s = s if s is not None else old_page(name)
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
