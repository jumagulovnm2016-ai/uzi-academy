#!/usr/bin/env python3
"""Переносит изменения из «Тестов» (jumagulovnm2016-ai/test) в «Академию УЗИ».

    python3 tools/sync-from-tests.py /путь/к/копии/test

Что делает:
  • каждая страница-тест (обычный тест, тест с эхограммами, «Угадай снимок», квиз на время)
    переводится в банк вопросов data/tests/<имя>.json, а сама страница становится
    переадресацией на движок Академии. Исправления в вопросах переносятся, id вопросов
    сохраняются (см. tools/extract-tests.py);
  • новые тесты добавляются на главную Академии в тот же раздел, что и в «Тестах»;
  • остальные страницы и папки (руководства, нормативы, картинки, анкета…) копируются как есть,
    с переименованием ключей хранилища (префикс acad-), чтобы Академия и «Тесты» на одном домене
    не мешали друг другу;
  • собственные файлы Академии (главная, движок, кабинеты, офлайн-кэш, иконки) не трогаются.
После переноса нужно пересобрать офлайн-кэш: python3 build-sw.py (в автоматическом переносе — само).
"""
import filecmp, html, importlib.util, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Файлы и папки Академии, которые перенос не перезаписывает
OWN_FILES = {'index.html', 'quiz.html', 'guess.html', 'account.html', 'teacher.html', 'plan.html', 'exam-builder.html',
             'manifest.webmanifest', 'sw.js', 'sw.template.js', 'build-sw.py', 'offline.js', 'README.md', 'CNAME', '.nojekyll'}
OWN_DIRS = {'engine', 'data', 'supabase', 'tools', 'icons', '.github', '.git'}
MIRROR_DIRS = {'img', 'guides'}      # зеркально: удалённое в «Тестах» удаляется и здесь

spec = importlib.util.spec_from_file_location('extract_tests', os.path.join(ROOT, 'tools', 'extract-tests.py'))
ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)


def acad_keys(s):
    """Те же замены ключей localStorage, что при создании Академии."""
    s = s.replace('const k="', 'const k="acad-').replace('const k="acad-acad-', 'const k="acad-')
    s = s.replace('const k=CFG.salt+"-attempts"', 'const k="acad-"+CFG.salt+"-attempts"')
    s = s.replace('SENT_KEY="anketa', 'SENT_KEY="acad-anketa').replace('acad-acad-anketa', 'acad-anketa')
    s = re.sub(r"'(?<!acad-)norm-organ'", "'acad-norm-organ'", s)
    return s


def stub(name, page):
    return (f'<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><title>Переход к тесту…</title>\n'
            f'<meta http-equiv="refresh" content="0;url={page}.html?t={name}">\n'
            f'<script>location.replace("{page}.html?t={name}");</script></head>\n'
            f'<body><p>Тест переехал: <a href="{page}.html?t={name}">открыть тест</a>.</p></body></html>\n')


def write_if_changed(path, text, log, what):
    old = open(path, encoding='utf-8').read() if os.path.isfile(path) else None
    if old != text:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        log.append(what + (' (новый)' if old is None else ''))
        return True
    return False


def copy_tree(src, dst, mirror, log, transform_html=False):
    changed = 0
    for d, dirs, files in os.walk(src):
        rel = os.path.relpath(d, src)
        for f in files:
            s, t = os.path.join(d, f), os.path.join(dst, rel, f)
            if f.endswith('.html') and transform_html:
                if write_if_changed(t, acad_keys(open(s, encoding='utf-8').read()), [], ''):
                    changed += 1
            elif not os.path.isfile(t) or not filecmp.cmp(s, t, shallow=False):
                os.makedirs(os.path.dirname(t), exist_ok=True); shutil.copy2(s, t); changed += 1
    if mirror and os.path.isdir(dst):
        for d, dirs, files in os.walk(dst):
            rel = os.path.relpath(d, dst)
            for f in files:
                if not os.path.exists(os.path.join(src, rel, f)):
                    os.remove(os.path.join(d, f)); changed += 1
    if changed:
        log.append(f'{os.path.relpath(dst, ROOT)}/: файлов изменено {changed}')


# ---------- главная: добавить ссылки на новые тесты в нужный раздел ----------
def sections(index_html):
    """[(название раздела, позиция конца его списка)] по разметке главной."""
    out = []
    for m in re.finditer(r'<h2>(.*?)</h2>\s*<div class="list">', index_html, re.S):
        end = index_html.index('</div>', m.end())
        out.append((html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip(), m.end(), end))
    return out


def merge_index(src_index, engines, log):
    path = os.path.join(ROOT, 'index.html')
    mine = open(path, encoding='utf-8').read()
    added = 0
    for sec_name, start, end in sections(src_index):
        block = src_index[start:end]
        for a in re.finditer(r'<a class="t" href="([a-z0-9-]+)\.html"[^>]*>.*?</a>', block, re.S):
            name = a.group(1)
            if name not in engines:
                continue                          # не тест — ссылка и так ведёт на скопированную страницу
            page = engines[name]
            if f'href="{page}.html?t={name}"' in mine or f'href="{name}.html"' in mine:
                continue
            link = a.group(0).replace(f'href="{name}.html"', f'href="{page}.html?t={name}"')
            secs = {n: (s, e) for n, s, e in sections(mine)}
            if sec_name in secs:
                pos = secs[sec_name][1]
                mine = mine[:pos].rstrip(' ') + ' ' + link + '\n' + mine[pos:]
            else:                                 # нового раздела ещё нет — перед «Для преподавателя»
                anchor = next((x for x in (mine.find('<h2>Обратная связь</h2>'), mine.find('<h2>Для преподавателя</h2>'), mine.find('<footer>')) if x >= 0), len(mine))
                mine = mine[:anchor] + f'<h2>{html.escape(sec_name)}</h2>\n<div class="list">\n {link}\n</div>\n' + mine[anchor:]
            added += 1
            mb = re.search(r'<b>(.*?)</b>', a.group(0), re.S)
            log.append(f'главная: добавлен «{html.unescape(re.sub(r"<[^>]+>", "", mb.group(1))).strip() if mb else name}» в раздел «{sec_name}»')
    if added:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(mine)


def main(src):
    ex.SRC_DIR = src
    log, engines, failed = [], {}, []
    for f in sorted(os.listdir(src)):
        p = os.path.join(src, f)
        if os.path.isdir(p):
            if f in OWN_DIRS or f.startswith('.'):
                continue
            copy_tree(p, os.path.join(ROOT, f), f in MIRROR_DIRS, log, transform_html=True)
            continue
        if f in OWN_FILES or f.startswith('.'):
            continue
        if not f.endswith('.html'):
            if f.endswith(('.py', '.js', '.json', '.md', '.txt', '.yml', '.yaml')):
                continue                          # служебные файлы «Тестов» Академии не нужны
            t = os.path.join(ROOT, f)
            if not os.path.isfile(t) or not filecmp.cmp(p, t, shallow=False):
                shutil.copy2(p, t); log.append(f)
            continue
        name, s = f[:-5], open(p, encoding='utf-8').read()
        k = ex.kind(s)
        if not k:
            write_if_changed(os.path.join(ROOT, f), acad_keys(s), log, f)
            continue
        try:
            t = ex.extract(name, s)
        except Exception as e:                    # страница не разобралась — оставляем прежнюю версию
            failed.append(f'{f}: {e}')
            continue
        page = 'guess' if t['format'] == 'guess' else 'quiz'
        engines[name] = page
        body = json.dumps(t, ensure_ascii=False, indent=1) + '\n'
        write_if_changed(os.path.join(ROOT, 'data', 'tests', name + '.json'), body, log, f'тест {name}: {len(t["questions"])} вопр.')
        write_if_changed(os.path.join(ROOT, f), stub(name, page), log, f'{f} → {page}.html?t={name}')
    merge_index(open(os.path.join(src, 'index.html'), encoding='utf-8').read(), engines, log)
    print('\n'.join(log) if log else 'Изменений нет.')
    if failed:
        print('НЕ ПЕРЕНЕСЕНО (страница не разобрана, оставлена прежняя версия):\n  ' + '\n  '.join(failed))
    return 0


if __name__ == '__main__':
    if len(sys.argv) != 2 or not os.path.isdir(sys.argv[1]):
        sys.exit(__doc__)
    sys.exit(main(os.path.abspath(sys.argv[1])))
