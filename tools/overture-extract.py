"""Вибирає заклади Overture Maps (places) для списку міст і пише їх у NDJSON.
Вхід: cities.json — [{"id": 1, "lat": 49.8, "lon": 24.0, "box": [west, south, east, north]}, ...]
Вихід: по рядку на об'єкт: {"id","name","tp","conf","st","lat","lon","web"}  (tp = taxonomy.primary, st = operating_status)
Використання: python tools/overture-extract.py cities.json out.ndjson [мінімальна_достовірність]"""
import json, sys, urllib.request
import duckdb

cities = json.load(open(sys.argv[1], encoding='utf-8'))
out_path = sys.argv[2]
min_conf = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5

cat = json.load(urllib.request.urlopen('https://stac.overturemaps.org/catalog.json', timeout=60))
release = cat.get('latest')
if not release:
    raise SystemExit('не вдалося визначити останній реліз Overture')
print('реліз Overture:', release, flush=True)
path = f"s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*"

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
names = {c[0] for c in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{path}', hive_partitioning=1)").fetchall()}
status_col = 'operating_status' if 'operating_status' in names else 'NULL'
web_col = 'websites[1]' if 'websites' in names else 'NULL'

# одним запитом — кілька міст (OR прямокутників): групи Parquet відсікаються за статистикою bbox
cond = ' OR '.join(f"(bbox.xmin BETWEEN {b[0]} AND {b[2]} AND bbox.ymin BETWEEN {b[1]} AND {b[3]})" for b in (c['box'] for c in cities))
sql = f"""SELECT id, names.primary AS name, taxonomy.primary AS tp, confidence AS conf, {status_col} AS st,
       bbox.ymin AS lat, bbox.xmin AS lon, {web_col} AS web
FROM read_parquet('{path}', hive_partitioning=1)
WHERE confidence >= {min_conf} AND ({cond})"""
rows = con.execute(sql).fetchall()
with open(out_path, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps({'id': r[0], 'name': r[1], 'tp': r[2], 'conf': r[3], 'st': r[4], 'lat': r[5], 'lon': r[6], 'web': r[7]}, ensure_ascii=False) + '\n')
print(f'записано {len(rows)} об\'єктів для {len(cities)} міст', flush=True)
