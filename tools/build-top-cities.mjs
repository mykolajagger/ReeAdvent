// Формує src/top_cities.js: список найбільших міст світу з координатами (із public/geo, які збирає build-geo.mjs).
// Запуск: node tools/build-top-cities.mjs   (місто, якого немає в наборі, пропускається й виводиться у звіті)
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const LIST = `UA: Kyiv, Kharkiv, Odesa, Dnipro, Lviv, Zaporizhzhia, Kryvyi Rih, Mykolaiv, Vinnytsia, Kherson, Poltava, Chernihiv, Cherkasy, Sumy, Zhytomyr, Khmelnytskyi, Rivne, Ivano-Frankivsk, Ternopil, Lutsk, Chernivtsi, Uzhgorod, Mukacheve, Kropyvnytskyi
GB: London, Manchester, Birmingham, Glasgow, Edinburgh, Liverpool, Leeds, Bristol, Cardiff, Belfast
IE: Dublin, Cork
FR: Paris, Lyon, Marseille, Toulouse, Nice, Bordeaux, Strasbourg, Lille, Nantes
DE: Berlin, Hamburg, Munich, Cologne, Frankfurt am Main, Stuttgart, Düsseldorf, Dresden, Leipzig, Nuremberg
ES: Madrid, Barcelona, Valencia, Seville, Málaga, Bilbao, Zaragoza
PT: Lisbon, Porto
IT: Rome, Milan, Naples, Turin, Florence, Venice, Bologna, Verona, Palermo
NL: Amsterdam, Rotterdam, The Hague, Utrecht
BE: Brussels, Antwerp, Ghent
LU: Luxembourg
CH: Zürich, Geneva, Bern, Basel
AT: Vienna, Salzburg, Graz, Innsbruck
PL: Warsaw, Kraków, Łódź, Wrocław, Poznań, Gdańsk, Szczecin, Lublin, Rzeszów, Katowice
CZ: Prague, Brno
SK: Bratislava, Košice
HU: Budapest
RO: Bucharest, Cluj-Napoca, Timișoara, Iași, Brașov
BG: Sofia, Plovdiv, Varna
GR: Athens, Thessaloniki
HR: Zagreb, Split
RS: Belgrade, Novi Sad
SI: Ljubljana
BA: Sarajevo
AL: Tirana
MK: Skopje
ME: Podgorica
MD: Chișinău
LT: Vilnius, Kaunas
LV: Riga
EE: Tallinn, Tartu
FI: Helsinki, Tampere
SE: Stockholm, Gothenburg, Malmö
NO: Oslo, Bergen
DK: Copenhagen, Aarhus
IS: Reykjavik
CY: Nicosia
MT: Valletta
TR: Istanbul, Ankara, Izmir, Antalya
GE: Tbilisi, Batumi
AM: Yerevan
AZ: Baku
KZ: Almaty, Astana
UZ: Tashkent
US: New York City, Los Angeles, Chicago, Houston, Phoenix, Philadelphia, San Antonio, San Diego, Dallas, San Jose, Austin, Jacksonville, San Francisco, Seattle, Denver, Boston, Washington, Nashville, Las Vegas, Portland, Miami, Atlanta, Detroit, Minneapolis, Orlando, New Orleans, Charlotte, Baltimore, Columbus, Honolulu
CA: Toronto, Montréal, Vancouver, Calgary, Ottawa, Edmonton, Winnipeg, Québec
MX: Mexico City, Guadalajara, Monterrey, Cancún, Puebla
BR: São Paulo, Rio de Janeiro, Brasília, Salvador, Fortaleza, Belo Horizonte, Curitiba, Porto Alegre, Recife
AR: Buenos Aires, Córdoba, Rosario
CL: Santiago
PE: Lima
CO: Bogotá, Medellín, Cali
VE: Caracas
UY: Montevideo
EC: Quito
BO: La Paz
PY: Asunción
CR: San José
PA: Panama City
CU: Havana
DO: Santo Domingo
JP: Tokyo, Osaka, Kyoto, Yokohama, Nagoya, Sapporo, Fukuoka
KR: Seoul, Busan, Incheon
CN: Beijing, Shanghai, Guangzhou, Shenzhen, Chengdu, Wuhan, Xi'an, Hangzhou, Chongqing
HK: Hong Kong
TW: Taipei
SG: Singapore
MY: Kuala Lumpur
TH: Bangkok, Chiang Mai, Phuket
VN: Hanoi, Ho Chi Minh City, Da Nang
PH: Manila, Cebu City
ID: Jakarta, Surabaya, Denpasar
IN: Mumbai, Delhi, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, Ahmedabad, Jaipur
PK: Karachi, Lahore, Islamabad
BD: Dhaka
LK: Colombo
NP: Kathmandu
AE: Dubai, Abu Dhabi
SA: Riyadh, Jeddah
QA: Doha
KW: Kuwait City
IL: Tel Aviv, Jerusalem
JO: Amman
LB: Beirut
IR: Tehran
IQ: Baghdad
EG: Cairo, Alexandria
MA: Casablanca, Marrakesh, Rabat
DZ: Algiers
TN: Tunis
NG: Lagos, Abuja
GH: Accra
KE: Nairobi
ET: Addis Ababa
TZ: Dar es Salaam
ZA: Johannesburg, Cape Town, Durban, Pretoria
SN: Dakar
AU: Sydney, Melbourne, Brisbane, Perth, Adelaide, Canberra
NZ: Auckland, Wellington, Christchurch`;
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'‘`ʼ]/g, '').trim();
// Альтернативні написання в наборі country-state-city
const ALIAS = { 'Zaporizhzhia': 'Zaporizhia', 'Cologne': 'Köln', 'Nuremberg': 'Nürnberg', 'Ghent': 'Gent', 'Gothenburg': 'Göteborg', 'Aarhus': 'Århus', 'Mexico City': 'Ciudad de México', 'Panama City': 'Panamá' };
// Міста, яких немає в наборі: координати вручну [lat, lon]
const MANUAL = { 'CH:Geneva': ['Geneva', 46.2044, 6.1432], 'FI:Tampere': ['Tampere', 61.4978, 23.761], 'TR:Istanbul': ['Istanbul', 41.0082, 28.9784], 'KZ:Astana': ['Astana', 51.1694, 71.4491], 'PY:Asunción': ['Asunción', -25.2637, -57.5759], 'HK:Hong Kong': ['Hong Kong', 22.3193, 114.1694] };
const out = [], missing = [];
for (const line of LIST.split('\n')) {
  const [cc, rest] = line.split(': '); let geo; try { geo = JSON.parse(fs.readFileSync(path.join(root, 'public', 'geo', cc + '.json'), 'utf8')); } catch { geo = { c: [] }; }
  for (const name of rest.split(', ')) {
    const key = ALIAS[name] || name, hit = geo.c.find(c => norm(c[0]) === norm(key)) || geo.c.find(c => norm(c[0]).startsWith(norm(key)));
    if (!hit && MANUAL[cc + ':' + name]) { const m = MANUAL[cc + ':' + name]; out.push([cc, m[0], m[1], m[2]]); continue; }
    if (!hit) { missing.push(`${cc}:${name}`); continue; }
    out.push([cc, hit[0], hit[2], hit[3]]);
  }
}
fs.writeFileSync(path.join(root, 'src', 'top_cities.js'), '// Згенеровано tools/build-top-cities.mjs: [країна, місто, lat, lon] найбільших міст для попереднього наповнення бази закладів\nexport const TOP_CITIES = ' + JSON.stringify(out) + ';\n');
console.log('cities:', out.length, '| not found:', missing.length ? missing.join(', ') : 'none');
