"""Діагностика: чи придатні відкриті дані Overture Maps (places) для актуальності й популярності закладів.
Нічого не змінює: друкує схему даних, кількість об'єктів у прямокутнику міста й найбільш «впевнені» заклади.
Запуск: python tools/overture-probe.py [west south east north] [шматок_назви]
За замовчуванням — Ужгород і пошук «клепач»."""
import json, sys, urllib.request
import duckdb

bbox = [float(x) for x in sys.argv[1:5]] if len(sys.argv) >= 5 else [22.25, 48.59, 22.35, 48.66]
needle = (sys.argv[5] if len(sys.argv) > 5 else 'клепач').lower()

cat = json.load(urllib.request.urlopen('https://stac.overturemaps.org/catalog.json', timeout=60))
print('ключі каталогу:', list(cat.keys()))
release = cat.get('latest') or next((l['href'] for l in cat.get('links', []) if l.get('rel') == 'child'), None)
print('останній реліз:', release)
path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
cols = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}', hive_partitioning=1)").fetchall()
names = [c[0] for c in cols]
print('колонки:', ', '.join(f'{c[0]}:{c[1][:40]}' for c in cols))

pick = [c for c in ('operating_status', 'confidence', 'taxonomy', 'categories', 'websites', 'phones', 'brand', 'addresses', 'sources') if c in names]
w, s, e, n = bbox
sql = f"""SELECT id, names.primary AS name, {', '.join(pick)}, bbox.xmin AS lon, bbox.ymin AS lat
FROM read_parquet('{path}', hive_partitioning=1)
WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n}"""
rows = con.execute(sql).fetchall()
head = [d[0] for d in con.description]
print(f'\nоб\'єктів у прямокутнику {bbox}: {len(rows)}')
idx = {h: i for i, h in enumerate(head)}

def cell(r, k, cut=90):
    v = r[idx[k]] if k in idx else None
    return str(v)[:cut]

if 'operating_status' in idx:
    from collections import Counter
    print('operating_status:', dict(Counter(r[idx['operating_status']] for r in rows)))
if 'confidence' in idx:
    print('\nТоп-25 за confidence:')
    for r in sorted(rows, key=lambda r: -(r[idx['confidence']] or 0))[:25]:
        print(' ', cell(r, 'name', 40), '|', cell(r, 'confidence', 5), '|', cell(r, 'operating_status', 20) if 'operating_status' in idx else '', '|', cell(r, 'taxonomy' if 'taxonomy' in idx else 'categories', 70))
print(f'\nПошук «{needle}»:')
for r in rows:
    if needle in str(r[idx['name']] or '').lower():
        print(' ', {k: cell(r, k, 140) for k in head if k not in ('id',)})
