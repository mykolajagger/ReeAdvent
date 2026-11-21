# tools

`build-geo.mjs` генерує `public/geo/*.json` (країни → області → міста) і `src/geo_currency.js` (валюта за країною)
з пакета `country-state-city` (MIT). Оновлення даних:

```bash
mkdir /tmp/geo && cd /tmp/geo && npm pack country-state-city && tar xzf country-state-city-*.tgz
node tools/build-geo.mjs /tmp/geo/package/lib/assets
```
Українські назви міст (≈90 найбільших) задані в самому скрипті (`UA_CITIES`). Решта міст показується англійською;
користувач завжди може ввести власну назву.
