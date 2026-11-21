// Збирає географічні дані для форми замовлення з пакета country-state-city (MIT):
//   public/geo/index.json   — {CC: {n: назва, c: валюта}} (валюта країни)
//   public/geo/{CC}.json    — {r: [[код, назва, назва_uk?]], c: [[назва, код_регіону, lat, lon, назва_uk?]]}
//   src/geo_currency.js     — {CC: валюта} для сервера
// Запуск: node tools/build-geo.mjs <каталог з розпакованим пакетом country-state-city/lib/assets> (див. tools/README.md)
import fs from 'node:fs'; import path from 'node:path';
const src = process.argv[2]; if (!src) { console.error('usage: node tools/build-geo.mjs <assets dir>'); process.exit(1); }
const read = f => JSON.parse(fs.readFileSync(path.join(src, f), 'utf8'));
const countries = read('country.json'), states = read('state.json'), cities = read('city.json');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'public', 'geo'); fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

// Українські назви областей (код регіону -> назва; значення також використовується сервером: 'Закарпатська' вмикає закарпатські ідеї)
const UA_REGIONS = { '05': 'Вінницька', '07': 'Волинська', '09': 'Луганська', '12': 'Дніпропетровська', '14': 'Донецька', '18': 'Житомирська', '21': 'Закарпатська', '23': 'Запорізька', '26': 'Івано-Франківська', '30': 'м. Київ', '32': 'Київська', '35': 'Кіровоградська', '43': 'Автономна Республіка Крим', '46': 'Львівська', '48': 'Миколаївська', '51': 'Одеська', '53': 'Полтавська', '56': 'Рівненська', '59': 'Сумська', '61': 'Тернопільська', '63': 'Харківська', '65': 'Херсонська', '68': 'Хмельницька', '71': 'Черкаська', '74': 'Чернігівська', '77': 'Чернівецька' };
// Українські назви міст (кілька англійських написань -> українська)
const UA_CITIES = { Uzhgorod: 'Ужгород', Uzhhorod: 'Ужгород', Mukacheve: 'Мукачево', Mukachevo: 'Мукачево', Berehove: 'Берегове', Khust: 'Хуст', Tyachiv: 'Тячів', Vynohradiv: 'Виноградів', Irshava: 'Іршава', Svalyava: 'Свалява', Rakhiv: 'Рахів', Chop: 'Чоп', Perechyn: 'Перечин', Velykyi_Bychkiv: 'Великий Бичків', Lviv: 'Львів', Drohobych: 'Дрогобич', Stryi: 'Стрий', Chervonohrad: 'Червоноград', Sambir: 'Самбір', Truskavets: 'Трускавець', Boryslav: 'Борислав', Kolomyia: 'Коломия', 'Ivano-Frankivsk': 'Івано-Франківськ', Kalush: 'Калуш', Yaremche: 'Яремче', Bukovel: 'Буковель', Ternopil: 'Тернопіль', Chortkiv: 'Чортків', Kremenets: 'Кременець', Rivne: 'Рівне', Dubno: 'Дубно', Lutsk: 'Луцьк', Kovel: 'Ковель', Chernivtsi: 'Чернівці', Kamianets: 'Кам’янець-Подільський', 'Kamianets-Podilskyi': 'Кам’янець-Подільський', Khmelnytskyi: 'Хмельницький', Vinnytsia: 'Вінниця', Zhytomyr: 'Житомир', Kyiv: 'Київ', Kiev: 'Київ', Bila_Tserkva: 'Біла Церква', 'Bila Tserkva': 'Біла Церква', Brovary: 'Бровари', Irpin: 'Ірпінь', Bucha: 'Буча', Boryspil: 'Бориспіль', Fastiv: 'Фастів', Cherkasy: 'Черкаси', Uman: 'Умань', Chernihiv: 'Чернігів', Nizhyn: 'Ніжин', Sumy: 'Суми', Konotop: 'Конотоп', Poltava: 'Полтава', Kremenchuk: 'Кременчук', Myrhorod: 'Миргород', Kharkiv: 'Харків', Kropyvnytskyi: 'Кропивницький', Kirovohrad: 'Кропивницький', Dnipro: 'Дніпро', Dnipropetrovsk: 'Дніпро', 'Kryvyi Rih': 'Кривий Ріг', Kamianske: 'Кам’янське', Nikopol: 'Нікополь', Pavlohrad: 'Павлоград', Zaporizhzhia: 'Запоріжжя', Zaporizhia: 'Запоріжжя', Melitopol: 'Мелітополь', Berdiansk: 'Бердянськ', Mykolaiv: 'Миколаїв', Nikolaev: 'Миколаїв', Odesa: 'Одеса', Odessa: 'Одеса', Izmail: 'Ізмаїл', 'Bilhorod-Dnistrovskyi': 'Білгород-Дністровський', Chornomorsk: 'Чорноморськ', Kherson: 'Херсон', Kramatorsk: 'Краматорськ', Sloviansk: 'Слов’янськ', Mariupol: 'Маріуполь', Donetsk: 'Донецьк', Bakhmut: 'Бахмут', Luhansk: 'Луганськ', Sievierodonetsk: 'Сєвєродонецьк', Simferopol: 'Сімферополь', Sevastopol: 'Севастополь', Yalta: 'Ялта', Kerch: 'Керч', Pryluky: 'Прилуки', Shostka: 'Шостка', Romny: 'Ромни', Lubny: 'Лубни', Mohyliv: 'Могилів-Подільський', 'Mohyliv-Podilskyi': 'Могилів-Подільський', Kozyatyn: 'Козятин', Zhmerynka: 'Жмеринка', Starokostiantyniv: 'Старокостянтинів', Slavuta: 'Славута', Shepetivka: 'Шепетівка', Novovolynsk: 'Нововолинськ', Kamin_Kashyrskyi: 'Камінь-Каширський', Zolochiv: 'Золочів', Brody: 'Броди', Chervonohrad_: 'Червоноград', Kalynivka: 'Калинівка', Obukhiv: 'Обухів', Vyshhorod: 'Вишгород', Slavutych: 'Славутич', Pripyat: 'Прип’ять', Enerhodar: 'Енергодар' };
const NOISE = /\b(Raion|Rayon|Raj[oó]n|District|Municipality|Governorate|Subdistrict)\b|Mis[’'‘`]?(ka|krada|ska)\b|Mis[’'‘`]?k\b|Selyshchna|Silrada|Hromada/i;

const names = {}; const ccy = {};
for (const c of countries) { names[c.isoCode] = { n: c.name, c: c.currency || null }; ccy[c.isoCode] = c.currency || null; }
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(names));
fs.writeFileSync(path.join(root, 'src', 'geo_currency.js'), '// Згенеровано tools/build-geo.mjs: валюта за країною (ISO 3166-1 alpha-2 -> ISO 4217)\nexport const COUNTRY_CCY = ' + JSON.stringify(ccy) + ';\n');

const stByC = {}; for (const s of states) (stByC[s.countryCode] ||= []).push(s);
const ciByC = {}; for (const c of cities) (ciByC[c[1]] ||= []).push(c);
let files = 0, total = 0, bytes = 0;
for (const cc of Object.keys(names)) {
  const sts = (stByC[cc] || []).map(s => ({ code: s.isoCode, name: s.name })), cts = ciByC[cc] || [];
  if (!sts.length && !cts.length) continue;
  const isUA = cc === 'UA';
  const regions = sts.map(s => { const name = s.name.replace(/\s+(oblast|Oblast)$/i, '').replace(/ska$|ska\b/, 'ska'); return isUA ? [s.code, UA_REGIONS[s.code] ? s.name : s.name, UA_REGIONS[s.code] || null] : [s.code, s.name]; }).sort((a, b) => a[1].localeCompare(b[1]));
  const seen = new Set(), list = [];
  for (const c of cts) {
    const name = c[0].trim(); if (!name || NOISE.test(name) || /\d/.test(name)) continue;
    const key = name.toLowerCase() + '|' + c[2]; if (seen.has(key)) continue; seen.add(key);
    const row = [name, c[2] || '', Math.round(parseFloat(c[3]) * 100) / 100, Math.round(parseFloat(c[4]) * 100) / 100];
    if (isUA) { const u = UA_CITIES[name] || UA_CITIES[name.replace(/ /g, '_')]; if (u) row.push(u); }
    list.push(row);
  }
  list.sort((a, b) => a[0].localeCompare(b[0]));
  const json = JSON.stringify({ r: regions, c: list }); fs.writeFileSync(path.join(out, cc + '.json'), json); files++; total += list.length; bytes += json.length;
}
console.log(`files: ${files}, cities: ${total}, bytes: ${(bytes / 1e6).toFixed(2)} MB`);
