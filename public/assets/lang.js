// Мова сайту: вибір користувача (localStorage / ?lang=) > мова за країною (сервер) > мова браузера. Елементи з data-i18n перемикаються без перезавантаження.
(() => {
  // Українські тексти для службових ключів (решта українських рядків передається в t() як є)
  const UK_KEYS = { d_open: 'торкніться, щоб відкрити', f_none: 'Не знайшли: залишимо ваш варіант', p_fail: 'Не вдалося перевірити промокод.' };
  const EN = {
    title: 'Advent calendar for couples — a 24-day gift for two | ReeAdvent', desc: 'An online advent calendar for couples: 24 days of surprises. Questions for each other, a gift idea for her or for him, date ideas and activities in your city. Start any day.',
    nav_login: 'Sign in', hero_eyebrow: 'An advent calendar for two', hero_h1: '24 days <em>just</em> for you',
    hero_p: 'Every morning a new window: a question for each other, a gift idea, a romantic adventure and a shared activity in your city. Matched to your tastes, but what is waiting stays a surprise.',
    cta_order: 'Order a calendar', cta_how: 'How it works',
    how_eyebrow: 'How it works', how_h2: 'From order to your own book',
    s1h: 'You order', s1p: 'Enter both names and emails and your city. Pay, and within minutes both of you get an email.',
    s2h: 'You fill in questionnaires', s2p: 'Each separately: gift budget and how many gifts, tastes, how many days a week to go out, how spicy you like it. Not even your partner sees your answers.',
    s3h: 'You open it every morning', s3p: 'Every day at 07:00 a new window. First you answer a question for your partner (a photo or video works too), then you open an adventure, an activity and, on the days you chose, a gift.',
    in_eyebrow: 'What is inside', in_h2: 'Try opening one',
    c1h: 'Question of the day', c1p: '«Why do you love me?», «Our funniest memory?» Each of you answers in words, a photo or a short video, and you see each other’s answers.',
    c2h: 'Gift', c2p: 'An idea within your budget, with a link to where to find it. Every day, every other day or once a week: you decide how many gifts.',
    c3h: 'Adventure for two', c3p: 'From gentle candlelit evenings to bold games. You set the level: the one comfortable for both is used.',
    c4h: 'Shared activity', c4p: 'On going-out days: cafés, walks and workshops found in your city. On other evenings, something fun together at home.',
    pv_eyebrow: 'Privacy', pv_h2: 'Just the two of you',
    pv1: 'Access only for the two emails you enter. Sign in with a one-time code or link, or with Google. No passwords.', pv2: 'The gift «from you to them» is seen only by you. The surprise stays a surprise.',
    pv3: 'Windows open only on their day: you cannot peek ahead.', pv4: 'We do not sell or share your data.', pv5: 'Photos and videos in your answers are seen only by the two of you.', q6: 'We are busy. Is it too much every day?', a6: 'No. In the questionnaire each of you chooses how many gifts you want in the calendar (24, 12, 8, 4 or your own number) and how many days a week to go out. We take the average of your two answers, and on other days we suggest something simple and fun at home. Nothing is mandatory: do what brings you joy.', q7: 'How varied are the tasks?', a7: 'The library has over 300 questions, 300 gift ideas, 300 adventures and 300 activities, and it keeps growing. You rate every item with stars: favourites show up more often in new calendars, and if you order again, nothing you already had will repeat.',
    or_eyebrow: 'Order', or_h2: 'Give yourselves a little magic',
    price_sub: 'per calendar for two · 24 windows', fx_uah: 'The price is shown in euros. You pay in UAH at the Monobank rate: {uah}. If your card is in another currency, your bank converts the amount at its own rate.', e_country: 'Please choose a country from the list.', e_blocked: 'Sorry, we cannot accept orders from this country.', e_occupied: 'Sorry, we do not serve temporarily occupied territories of Ukraine.', e_region_ua: 'Please choose a region from the list.',
    f_nameA: 'Your name', f_nameB: 'Partner’s name', f_emailA: 'Your email', f_emailB: 'Partner’s email', f_country: 'Country', f_region: 'Region or state', f_city: 'City', f_city_ph: 'Paris',
    f_city_hint: 'Places and activities are searched in this city. You can type any city.', f_type: 'Start typing…', f_region_state: 'Region or state', f_none: 'No matches: your text will be used', ft_fx: 'Exchange rates (for information): <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a>', f_start: 'Start date', f_start_hint: 'The first window opens on this day at 07:00 your time, then 24 days in a row. Any day from tomorrow, for example 1 December.',
    f_promo: 'Promo code (if you have one)', f_promo_ph: 'WELCOME', f_apply: 'Apply', f_age: 'We are both at least 18 years old.',
    f_terms: 'I agree to the <a href="/legal/offer.en.html" target="_blank">public offer</a> and the <a href="/legal/privacy.en.html" target="_blank">privacy policy</a>.',
    f_pay: 'Go to payment', f_free: 'Get it for free', f_note: 'You can pay in advance: the calendar opens on the date you choose.', choose: 'Choose…',
    q_eyebrow: 'Questions', q_h2: 'Answers',
    q1: 'When does the calendar start?', a1: 'You choose the start date when you order: the first window opens that day at 07:00 your local time, then every day for 24 days. If the chosen date has passed by the time you pay, the calendar starts the next day.',
    q2: 'What if we are not in Ukraine?', a2: 'The service works anywhere. Choose your country and city: place and activity searches use your city, and your calendar follows your time zone. Gifts link to a general online search. Outside Ukraine the price is in euros; you pay in hryvnia at the Monobank rate, and your bank converts it to your card currency.',
    q3: 'What about the intimate tasks?', a3: 'They are soft, romantic and playful. Three levels: «Romance», «Play» and «Bold night». The lower level of the two of you is used, so nobody is pushed. For adults only.',
    q4: 'Can I get a refund?', a4: 'Yes, see the public offer. In short: a full refund before the first window opens, by contacting support.',
    q5: 'Does my partner see my answers?', a5: 'No. The questionnaires are seen only by the system that builds the calendar. The gift you give is seen only by you. Answers to the «question of the day» are shown to your partner on purpose.',
    ig_eyebrow: 'On Instagram', ig_h2: 'Inspiration for the two of you', ig_follow: 'Follow us on Instagram', th_follow: 'We are on Threads', q10: 'What to give your girlfriend or wife for New Year and Christmas?', a10: 'Give not one thing but 24 days of attention. The advent calendar for two gives a daily gift idea for her within your budget and her tastes (with online shops and a place in your city), a question for each other, a romantic adventure and a date idea. A gift that lasts all of December.',
    q11: 'And what to give your boyfriend or husband?', a11: 'The same calendar works both ways: each of you fills in a questionnaire separately, so he gets gift ideas for her and she gets ideas for him. Gifts are matched to the gender, tastes and budget of the one receiving them.',
    q12: 'Is it a good anniversary or Valentine’s Day gift?', a12: 'Yes. You choose the start date yourself, so the calendar can begin not only on December 1 but before an anniversary, Valentine’s Day or just because — 24 days of surprises for a couple, any time.',
    q13: 'What date ideas are in the calendar?', a13: 'Romantic evenings at home, walks, cafés, ice rinks, Christmas markets, concerts, museums, workshops — with venue ratings and events in your city. You decide how many evenings a week to go out.', sy1: 'A digital calendar&nbsp;—', sy1e: 'real emotions', sy2: 'Less scrolling&nbsp;—', sy2e: 'more us', sy3: 'When were you last truly', sy3e: 'alone, just the two of you?',
    sy4a: 'Have you chosen a gift', sy4ae: 'for her yet?', sy4b: 'Have you chosen a gift', sy4be: 'for him yet?', sy5: 'What will make', sy5e: 'this winter unforgettable?', sy5s: '24 evenings you will remember for years', ha_n1: 'Window 8 is open ✦', ha_n2: 'Good morning! Your surprise window is waiting', ha_c1: '💬 Question', ha_c2: '🎁 Gift', ha_c3: '❤ Adventure', ha_c4: '★ Activity',
    fm_eyebrow: 'Watch', fm_h2: 'One day <em>in 27 seconds</em>', fm_p: 'He and She open window eight: a morning notification, a question for each other, a Christmas market in their city, a gift and a quiet evening on the sofa.', fm_snd: '🔊 With sound',
    dc1: 'Window 8 is open ✦', dc2: 'What about me still surprises you?', dc2a: 'Her: How you make me coffee every morning ☕', dc3s: 'A gift for her', dc3: 'An idea within your budget', dc3t: '2–3 online shops and in your city', dc4s: 'Activity in the city', dc4: 'Christmas market', dc4t: 'on the map', dc5s: 'Window 8 of 24', dc5: 'Finish the day ✓',
    cta_how2: 'What a day looks like', tr1: 'windows', tr2: 'surprises in each', tr3: 'ideas of every kind', tr4: 'any city, any start date',
    ph_win: 'Window 7', ph_q: 'Question of the day', ph_qt: 'Which day of ours would you live again?', ph_qn: 'Andrew:', ph_qa: 'That evening in Lviv when it suddenly started snowing ❄',
    ph_g: 'A gift for her', ph_gt: 'A blanket with sleeves and cocoa with marshmallows', ph_gs: 'up to €20 · 3 shops · in your city', ph_a: 'Adventure for two', ph_at: 'Movie night in a blanket fort', ph_c: 'Shared activity', ph_ct: 'Open-air ice rink', ph_cs: 'new place',
    s4h: 'You keep the memories', s4p: 'After window 24: a finale and your PDF book with every question, both answers, photos and gifts.',
    dy_eyebrow: 'One day', dy_h2: 'A day with ReeAdvent',
    t1h: 'The window opens', t1p: 'A new window is waiting at 07:00 your time. Forgot to look? We will send a reminder email.',
    t2t: 'Morning', t2h: 'Question of the day', t2p: 'You answer first: in words, a photo or a short video. Only then do you see your partner’s answer and the rest of the window.',
    t3t: 'Daytime', t3h: 'A gift', t3p: 'On the days you chose: an idea that fits your budget and the tastes of the one you give it to, with 2–3 online shops and a place in your city. Only you can see it.',
    t4t: 'Evening', t4h: 'Adventure and activity', t4p: 'On going-out days: the top-rated places, new spots and events from your city’s listings. On other evenings, something fun together at home.',
    t5t: 'Before bed', t5h: 'You finish the day', t5p: 'Mark what you did and give it stars. Your favourites will show up more often in new calendars.',
    du_eyebrow: 'Him and Her', du_h2: 'Each of you opens a window for the other', du_p: 'One calendar for two, but each of you has your own side. He sees the gift for her, she sees the one for him. You ask each other the question of the day, while the adventure and activity are shared.',
    du_her: 'For her', du_herp: 'His gifts are matched to her tastes', du_him: 'For him', du_himp: 'And hers to his',
    pz_eyebrow: 'Personal', pz_h2: 'Matched to the two of you', pz_p: 'After payment each of you fills in a short questionnaire separately. Your partner does not see your answers.',
    pz1: 'Gift budget', pz2: 'How many gifts: 24, 12, 8 or 4', pz3: 'Tastes and hobbies', pz4: 'How many evenings a week to go out', pz5: 'Romance, Play or Bold night', pz6: 'Your city',
    pr1h: 'No repeats', pr1p: 'Similar activities never come back to back, and themes alternate. No two picnics in a row.',
    pr2h: 'The right places', pr2p: 'A museum means your city’s museums; a walk in the woods means a forest or park, not the main square.',
    pr3h: 'Learns from ratings', pr3p: 'Couples’ stars lift the best ideas higher. Order again and nothing you already had will repeat.',
    bk_eyebrow: 'After day 24', bk_h2: 'Your story, in a book', bk_y: 'Advent 2026', bk_n: 'M&amp;M',
    bk_p: 'The last window ends with a festive animation, and then you save a PDF book with your names on the cover.',
    bk1: '24 pages: every question and both answers', bk2: 'Photos from your answers', bk3: 'Both partners’ gifts, the adventures and activities you did', bk4: 'Made on your device: nothing is sent to a server',
    q8: 'Do we need to install an app?', a8: 'No. The calendar works in the browser on your phone and computer. If you like, add it to your home screen and it will open like an app.',
    q9: 'What is left after 24 days?', a9: 'A festive finale and a PDF book “Advent [year] [your names]”: every question, both answers, photos, gifts and what you did together.',
    scta_sub: 'for a calendar for two', scta_btn: 'Order now!',
    ft_offer: 'Public offer', ft_privacy: 'Privacy policy', ft_support: 'Support',
    e_names: 'Please enter both names.', e_email: 'Please check the email addresses.', e_same: 'The emails must be different: one for each of you.', e_city: 'Please enter a city.', e_region: 'Please choose a region.', e_consent: 'Please confirm your age and accept the terms.', e_many: 'Too many attempts. Try again in an hour.',
    e_date: 'Choose a start date: from tomorrow and not later than in 90 days.', e_captcha: 'We could not confirm you are not a bot. Please try again.', e_bot: 'Please confirm that you are not a bot (the widget above).', e_gen: 'Could not create the order. Please try again.',
    p_not_found: 'There is no such promo code.', p_inactive: 'This promo code is no longer valid.', p_not_started: 'This promo code is not active yet.', p_expired: 'This promo code has expired.', p_exhausted: 'This promo code has been used the maximum number of times.',
    p_applied: 'Promo code applied: you save {x}.', p_many: 'Too many attempts. Try again in a few minutes.', p_fail: 'Could not check the promo code.',
    d_gift: 'Gift', d_adv: 'Adventure for two', d_act: 'Shared activity', d_open: 'tap to open'
  };
  const DEMO = {
    uk: [['Питання дня', 'Питання дня · від нього для неї', 'За що ти мене любиш?', '<span class="ans"><b>Вона відповіла:</b> «За те, що поруч із тобою тихо й тепло, навіть коли за вікном завірюха.»</span><span class="ans"><b>Він відповів:</b> «За твій сміх, який чути з іншої кімнати.»</span>', 'приклад відповідей для двох'], ['Подарунок', 'Подарунок для неї', 'Набір для чаювання з медом', 'Він обирає ситечко, баночку меду й пару пакетиків чаю: готовий затишний вечір.', '≈ 200 ₴'], ['Пригода для двох', 'Пригода для нього і для неї', 'Вечір при свічках', 'Тільки світло свічок і ніяких телефонів — на три години.', 'Романтика'], ['Спільна активність', 'Спільна активність для двох', 'Нова кав’ярня', 'Оберіть ту, де ще не були, і замовте щось незвичне.', 'до ~300 ₴']],
    en: [['Question of the day', 'Question of the day · from him to her', 'Why do you love me?', '<span class="ans"><b>She answered:</b> “Because it is quiet and warm next to you, even when there is a blizzard outside.”</span><span class="ans"><b>He answered:</b> “For your laugh that I can hear from another room.”</span>', 'an example of answers for two'], ['Gift', 'Gift for her', 'Tea set with honey', 'He picks a strainer, a jar of honey and a few tea bags: a cosy evening in a box.', '≈ $5'], ['Adventure for two', 'Adventure for him and her', 'An evening by candlelight', 'Only candlelight and no phones, for three hours.', 'Romance'], ['Shared activity', 'Shared activity for two', 'A new café', 'Choose one you have not been to and order something unusual.', 'up to ~$8']]
  };
  const stored = () => { try { const s = localStorage.getItem('lang'); return s === 'uk' || s === 'en' ? s : null; } catch { return null; } };
  const q = new URLSearchParams(location.search).get('lang');
  let lang = q === 'uk' || q === 'en' ? q : (stored() || (/^uk/i.test(navigator.language || '') ? 'uk' : 'en'));
  let explicit = !!(q === 'uk' || q === 'en' || stored());
  const save = l => { try { localStorage.setItem('lang', l); } catch {} };
  if (q === 'uk' || q === 'en') save(q);
  const orig = new WeakMap();
  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { if (!orig.has(el)) orig.set(el, el.innerHTML); el.innerHTML = lang === 'en' && EN[el.dataset.i18n] != null ? EN[el.dataset.i18n] : orig.get(el); });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { if (!el.dataset.ukPh) el.dataset.ukPh = el.placeholder; el.placeholder = lang === 'en' && EN[el.dataset.i18nPh] != null ? EN[el.dataset.i18nPh] : el.dataset.ukPh; });
    document.querySelectorAll('.langsw button').forEach(b => b.classList.toggle('on', b.dataset.lang === lang));
    document.querySelectorAll('a[data-legal]').forEach(a => { a.href = '/legal/' + a.dataset.legal + (lang === 'en' ? '.en' : '') + '.html'; });
    const t = document.querySelector('meta[name=description]'); if (t) { if (!t.dataset.uk) t.dataset.uk = t.content; t.content = lang === 'en' ? EN.desc : t.dataset.uk; }
    if (!document.documentElement.dataset.ukTitle) document.documentElement.dataset.ukTitle = document.title;
    if (document.documentElement.dataset.keepTitle == null) document.title = lang === 'en' ? EN.title : document.documentElement.dataset.ukTitle;
    window.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
  }
  window.LANG = {
    get: () => lang, EN, DEMO, t: (k, v = {}) => { let s = lang === 'en' ? (EN[k] ?? k) : (UK_KEYS[k] ?? k); for (const [a, b] of Object.entries(v)) s = s.replace('{' + a + '}', b); return s; },
    set(l) { lang = l; explicit = true; save(l); apply(); },
    suggest(l) { if (!explicit && l && l !== lang) { lang = l; apply(); } }, apply
  };
  document.addEventListener('click', e => { const b = e.target.closest('.langsw button'); if (b) window.LANG.set(b.dataset.lang); });
  document.addEventListener('DOMContentLoaded', apply);
})();
