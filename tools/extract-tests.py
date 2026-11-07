#!/usr/bin/env python3
"""Переносит тесты со старых страниц (шаблон с CFG и Q) в банк вопросов data/tests/*.json.

Запуск один раз, из корня репозитория:
    python3 tools/extract-tests.py liver kidney ...
Старые страницы читаются из git (коммит до переноса), поэтому скрипт можно
повторить и после того, как страницы заменены переадресацией.
"""
import html, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_COMMIT = os.environ.get('SRC_COMMIT', 'HEAD')


def old_page(name):
    return subprocess.check_output(['git', 'show', f'{SRC_COMMIT}:{name}.html'], cwd=ROOT).decode('utf-8')


def text(fragment):
    return html.unescape(re.sub(r'<[^>]+>', '', fragment)).strip()


def extract(name):
    s = old_page(name)
    cfg = json.loads(re.search(r'const CFG=(\{.*?\});', s).group(1))
    i = s.index('const Q=[') + len('const Q=')
    j = s.index('];\n', i) + 1
    qs = json.loads(s[i:j])
    head = {
        'eyebrow': text(re.search(r'<span class="eyebrow">(.*?)</span>', s, re.S).group(1)),
        'h1': text(re.search(r'<h1>(.*?)</h1>', s, re.S).group(1)),
        'sub': text(re.search(r'<header>.*?<p class="sub">(.*?)</p>', s, re.S).group(1)),
        'pageTitle': text(re.search(r'<title>(.*?)</title>', s, re.S).group(1)),
        'footer': text(re.search(r'<footer>(.*?)<details>', s, re.S).group(1)),
    }
    # Первая фраза описания — о чём тест; остальное (про режим и таймер) движок пишет сам.
    head['about'] = head.pop('sub').split(' После ответа')[0].strip()
    questions = []
    for n, q in enumerate(qs, 1):
        item = {'id': f'{name}-{n:03d}'}
        item.update(q)
        questions.append(item)
    return {
        'id': name,
        'title': cfg['title'],
        'minutes': cfg['minutes'],
        'salt': cfg['salt'],
        'file': cfg['file'],
        **head,
        'questions': questions,
    }


def main(names):
    os.makedirs(os.path.join(ROOT, 'data', 'tests'), exist_ok=True)
    for name in names:
        t = extract(name)
        path = os.path.join(ROOT, 'data', 'tests', name + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(t, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print(f'{name}: {len(t["questions"])} вопросов')


if __name__ == '__main__':
    main(sys.argv[1:])
