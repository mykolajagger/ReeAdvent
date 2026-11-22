// Ілюстрація щасливої пари біля вікна: об'ємна (градієнти, м'яке світло, тіні, боке, зерно), а не плоскі силуети.
// coupleScene(cutoutUri) — якщо передано вирізане фото пари (PNG з прозорим тлом), малюється воно замість ілюстрації.
const STARS = Array.from({ length: 50 }, (_, i) => `<circle cx="${322 + (i * 97) % 436}" cy="${300 + (i * 61) % 600}" r="${1.6 + (i % 4) * .8}" fill="#fff0cf" opacity="${(.45 + (i % 5) * .1).toFixed(2)}"/>`).join('');
const LIGHTS = Array.from({ length: 15 }, (_, i) => { const x = i * 76 - 10, y = 160 + Math.sin(i * 0.9) * 24 + (i < 7 ? i * 6 : (14 - i) * 6); return `<circle cx="${x}" cy="${y}" r="26" fill="#ffd36a" opacity=".2" filter="url(#b6)"/><circle cx="${x}" cy="${y}" r="9" fill="#ffe08a"/>`; }).join('');
const BOKEH = [[96, 560, 54, .22], [180, 760, 34, .16], [980, 520, 62, .2], [920, 800, 40, .16], [1010, 980, 70, .14], [70, 1000, 60, .14], [240, 420, 28, .16], [850, 400, 30, .16]].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffcf73" opacity="${o}" filter="url(#b10)"/>`).join('');
const TREE = [[-20, -90], [30, -40], [-50, 20], [55, 70], [-10, 100], [75, 130], [-85, 130]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="#ffd36a" opacity=".28" filter="url(#b6)"/><circle cx="${x}" cy="${y}" r="6" fill="#ffe08a"/>`).join('');
// в'язка: вертикальні «коси» на светрі
const knit = (x0, x1, y0, y1, step, col) => Array.from({ length: Math.floor((x1 - x0) / step) }, (_, i) => `<path d="M${x0 + i * step} ${y0} q 7 ${(y1 - y0) / 4} 0 ${(y1 - y0) / 2} t 0 ${(y1 - y0) / 2}" fill="none" stroke="${col}" stroke-width="3" opacity=".5"/>`).join('');

export function coupleScene(cutoutUri = null) {
  const room = `<defs>
<linearGradient id="room" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1409"/><stop offset=".6" stop-color="#0e0c0a"/><stop offset="1" stop-color="#08090d"/></linearGradient>
<radialGradient id="win" cx="50%" cy="48%" r="62%"><stop offset="0" stop-color="#fff0c4"/><stop offset=".35" stop-color="#f0b45a"/><stop offset=".75" stop-color="#a86a2a"/><stop offset="1" stop-color="#4a2a10"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd993" stop-opacity=".75"/><stop offset="1" stop-color="#ffd993" stop-opacity="0"/></radialGradient>
<radialGradient id="skinW" cx="42%" cy="38%" r="75%"><stop offset="0" stop-color="#ffe0c4"/><stop offset=".55" stop-color="#f1bf9a"/><stop offset="1" stop-color="#c98c66"/></radialGradient>
<radialGradient id="skinM" cx="44%" cy="38%" r="78%"><stop offset="0" stop-color="#f6cfae"/><stop offset=".55" stop-color="#e3a97f"/><stop offset="1" stop-color="#b57850"/></radialGradient>
<linearGradient id="hairW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a0602f"/><stop offset=".5" stop-color="#6c3a1d"/><stop offset="1" stop-color="#3b1d0e"/></linearGradient>
<linearGradient id="hairM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a2f20"/><stop offset="1" stop-color="#150c08"/></linearGradient>
<linearGradient id="knitW" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3df"/><stop offset=".6" stop-color="#e6cda6"/><stop offset="1" stop-color="#b99a6f"/></linearGradient>
<linearGradient id="knitM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b6a56"/><stop offset=".55" stop-color="#244a3b"/><stop offset="1" stop-color="#10261f"/></linearGradient>
<radialGradient id="warm" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffb760" stop-opacity=".22"/><stop offset="1" stop-color="#ffb760" stop-opacity="0"/></radialGradient>
<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd993" stop-opacity=".95"/><stop offset="1" stop-color="#ffd993" stop-opacity="0"/></linearGradient>
<filter id="b6"><feGaussianBlur stdDeviation="6"/></filter><filter id="b10"><feGaussianBlur stdDeviation="10"/></filter><filter id="b3"><feGaussianBlur stdDeviation="3"/></filter><filter id="b16"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .9  0 0 0 0 .75  0 0 0 .55 0"/></filter>
<clipPath id="faceM"><ellipse cx="606" cy="738" rx="84" ry="100" transform="rotate(-9 606 738)"/></clipPath>
<clipPath id="arch"><path d="M300 940 V470 Q300 250 540 250 Q780 250 780 470 V940 Z"/></clipPath>
<mask id="botfade"><rect width="1080" height="1350" fill="#fff"/><rect y="1010" width="1080" height="340" fill="url(#mf)"/></mask><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs>`;
  const windowArt = `<rect width="1080" height="1350" fill="url(#room)"/>
<ellipse cx="540" cy="620" rx="560" ry="560" fill="url(#halo)" opacity=".55"/>
<path d="M300 940 V470 Q300 250 540 250 Q780 250 780 470 V940 Z" fill="url(#win)"/>
<g clip-path="url(#arch)">${STARS}<g transform="translate(540 700)"><path d="M0 -170 L-78 -44 H-38 L-104 66 H-50 L-132 176 H132 L50 66 H104 L38 -44 H78 Z" fill="#12362a"/><path d="M0 -170 L-78 -44 H-38 L-104 66 H-50 L-132 176 H0Z" fill="#0b241b" opacity=".6"/>${TREE}<path d="M0 -190 l9 20 l22 3 l-16 15 l5 22 l-20 -12 l-20 12 l5 -22 l-16 -15 l22 -3 Z" fill="#ffe08a"/><circle cx="0" cy="-168" r="36" fill="#ffe08a" opacity=".35" filter="url(#b6)"/></g></g>
<path d="M300 940 V470 Q300 250 540 250 Q780 250 780 470 V940 Z" fill="none" stroke="#2a1608" stroke-width="18"/><path d="M540 250 V940 M300 610 H780" stroke="#2a1608" stroke-width="10"/><path d="M296 940 H784" stroke="#3a2210" stroke-width="22"/>
<path d="M-20 140 Q270 260 540 180 T1100 150" fill="none" stroke="#3a2a14" stroke-width="3"/>${LIGHTS}${BOKEH}`;

  const figures = `
<g mask="url(#botfade)">
<g transform="translate(-30 0)"><path d="M372 740 C358 606 466 580 538 608 C614 636 614 730 602 800 C632 900 614 1030 572 1130 L394 1130 C352 1010 346 870 372 740 Z" fill="url(#hairW)"/></g>
<!-- чоловік: сидить правіше -->
<g transform="translate(40 10)">
<path d="M470 1240 C470 1040 520 940 612 906 C706 924 770 1010 776 1240 Z" fill="url(#knitM)"/>
<g clip-path="url(#arch)" opacity="0"></g>
<g opacity=".55">${knit(540, 740, 960, 1240, 26, '#0b1c16')}</g>
<path d="M566 836 L652 830 L660 906 C628 934 590 930 566 908 Z" fill="#a8704b"/>
<path d="M552 902 C586 940 654 944 684 898 C698 920 694 950 668 962 C624 978 580 974 554 954 C538 938 540 916 552 902 Z" fill="#2c5645" stroke="#10261f" stroke-width="3"/>
<path d="M566 920 q38 30 94 -2" fill="none" stroke="#10261f" stroke-width="3" opacity=".6"/>
<!-- вуха й обличчя чоловіка -->
<g transform="translate(0 26)"><ellipse cx="692" cy="746" rx="15" ry="26" fill="#cf9570"/><ellipse cx="520" cy="752" rx="15" ry="26" fill="#bf8662"/>
<ellipse cx="606" cy="738" rx="84" ry="100" transform="rotate(-9 606 738)" fill="url(#skinM)"/>
<g clip-path="url(#faceM)"><path d="M520 770 C540 880 660 900 700 770 C690 820 640 850 606 852 C570 850 530 820 520 770 Z" fill="#2a1a12" opacity=".34"/><ellipse cx="606" cy="838" rx="70" ry="26" fill="#2a1a12" opacity=".18" filter="url(#b6)"/></g>
<path d="M514 728 C506 640 584 606 650 622 C710 636 722 692 706 730 C694 690 656 676 610 684 C566 690 530 698 514 728 Z" fill="url(#hairM)"/>
<path d="M548 664 C590 640 650 646 684 672" fill="none" stroke="#7a5238" stroke-width="5" opacity=".6" stroke-linecap="round"/>
<g transform="rotate(-9 606 738)" fill="none" stroke-linecap="round">
 <path d="M562 712 Q580 702 598 710 M620 708 Q640 698 658 706" stroke="#241610" stroke-width="7"/>
 <path d="M564 746 Q580 730 596 746 M618 744 Q634 728 650 744" stroke="#2a1812" stroke-width="5"/>
 <path d="M608 764 Q600 780 614 784" stroke="#b27a55" stroke-width="3.4" opacity=".6"/>
 <path d="M572 796 Q606 830 642 796 Q606 812 572 796 Z" fill="#fff6ea" stroke="#8a3a34" stroke-width="3" stroke-linejoin="round"/>
 <path d="M562 790 q-6 8 2 16 M652 790 q6 8 -2 16" stroke="#b27a55" stroke-width="3" opacity=".6"/>
 <ellipse cx="560" cy="780" rx="20" ry="11" fill="#e87a6a" opacity=".3" stroke="none"/><ellipse cx="656" cy="778" rx="20" ry="11" fill="#e87a6a" opacity=".3" stroke="none"/></g></g>
</g>
<!-- жінка: сидить лівіше, поверх -->
<g transform="translate(-30 0)">

<path d="M330 1240 C326 1050 366 944 444 912 L548 912 C612 936 646 1030 646 1240 Z" fill="url(#knitW)"/>
<g opacity=".7">${knit(360, 620, 970, 1240, 26, '#b69a6e')}</g>
<path d="M440 846 L504 846 L510 916 C482 940 456 936 434 916 Z" fill="#d9a07a"/><path d="M440 846 L504 846 L506 880 C484 892 460 890 440 878 Z" fill="#a8704b" opacity=".45"/>
<path d="M404 910 C440 946 524 950 562 908 C590 934 594 966 566 982 C512 1008 440 1008 398 976 C380 954 386 928 404 910 Z" fill="#f4e4c8" stroke="#bfa27a" stroke-width="3"/>
<path d="M410 930 q60 36 146 -4 M406 952 q70 40 152 -4" fill="none" stroke="#bfa27a" stroke-width="3" opacity=".6"/>
<g transform="translate(0 24)"><ellipse cx="468" cy="760" rx="78" ry="96" transform="rotate(9 468 760)" fill="url(#skinW)"/>
<ellipse cx="468" cy="820" rx="52" ry="22" transform="rotate(9 468 760)" fill="#c98c66" opacity=".25" filter="url(#b6)"/>
<path d="M392 742 C392 662 450 636 504 650 C546 664 556 708 550 748 C524 704 470 692 424 718 C406 728 396 738 392 748 Z" fill="url(#hairW)"/>
<path d="M410 690 C440 660 500 656 536 680" fill="none" stroke="#c98a52" stroke-width="5" opacity=".6" stroke-linecap="round"/>
<g transform="rotate(9 468 760)" fill="none" stroke-linecap="round">
 <path d="M434 722 Q452 712 468 718 M486 718 Q502 710 518 720" stroke="#4a2a1a" stroke-width="4"/>
 <path d="M436 752 Q452 736 468 752 M486 752 Q502 736 518 752" stroke="#3a2018" stroke-width="5"/>
 <path d="M476 772 Q470 786 482 790" stroke="#c98c66" stroke-width="3.4" opacity=".6"/>
 <path d="M446 800 Q474 832 504 800 Q474 812 446 800 Z" fill="#fff8ee" stroke="#b3524c" stroke-width="3.4" stroke-linejoin="round"/>
 <ellipse cx="438" cy="786" rx="20" ry="11" fill="#ee7e70" opacity=".34" stroke="none"/><ellipse cx="520" cy="786" rx="20" ry="11" fill="#ee7e70" opacity=".34" stroke="none"/></g>
<circle cx="404" cy="800" r="6" fill="#ffe08a"/><circle cx="404" cy="800" r="12" fill="#ffd36a" opacity=".35" filter="url(#b3)"/></g></g>
<ellipse cx="540" cy="800" rx="330" ry="300" fill="url(#warm)"/>
</g>`;

  const cut = cutoutUri ? `<ellipse cx="540" cy="900" rx="470" ry="380" fill="url(#halo)" opacity=".55"/><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="mk"><rect width="1080" height="1350" fill="#000"/><rect x="0" y="330" width="1080" height="900" fill="url(#fade)"/></mask><filter id="rimf" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="14" flood-color="#ffc878" flood-opacity=".55"/></filter></defs><g mask="url(#mk)"><image href="${cutoutUri}" x="90" y="330" width="900" height="900" preserveAspectRatio="xMidYMax meet" filter="url(#rimf)"/></g>` : figures;
  const candle = `<g><rect x="858" y="1090" width="44" height="64" rx="6" fill="#4a3216"/><path d="M880 1080 q-13 -24 0 -44 q13 20 0 44" fill="#ffd36a"/><circle cx="880" cy="1068" r="60" fill="#ffd36a" opacity=".22" filter="url(#b10)"/></g>`;
  return `<svg width="1080" height="1350" viewBox="0 0 1080 1350" style="position:absolute;inset:0">${room}${windowArt}${cut}${cutoutUri ? '' : candle}
<rect width="1080" height="1350" filter="url(#grain)" opacity=".1" style="mix-blend-mode:overlay"/>
<rect width="1080" height="1350" fill="url(#vig)" /><defs><radialGradient id="vig" cx="50%" cy="48%" r="75%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs></svg>`;
}
