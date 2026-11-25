/* 3 · Story 7.4 "Borrowed from <name>" tag on the 5.13 shop card. Then item 4 (Training, defined in main2). */
const CARDS = [
  { item: 'shotgun', kind: 'weapon', name: 'Shotgun', rarity: 'common', price: 150, stat: 'Dmg 8 × 6 · close' },
  { item: 'body_armor_2', kind: 'gear', name: 'Body armor II', rarity: 'rare', price: 260, stat: '+40 max HP' },
  { item: 'smg', kind: 'weapon', name: 'SMG', rarity: 'common', price: 120, stat: 'Dmg 9 · 11 / s' },
  { item: 'grenade_launcher', kind: 'weapon', name: 'Grenade Launcher', rarity: 'epic', price: 330, stat: 'Blast 2.5 m', borrowed: 0 },
  { item: 'running_shoes', kind: 'gear', name: 'Running shoes', rarity: 'common', price: 90, stat: '+12 % speed' },
  { item: 'chainsaw', kind: 'weapon', name: 'Chainsaw', rarity: 'rare', price: 280, stat: 'Dmg 60 / s · reach 1.3 m', borrowed: 2 },
];
const BT_NAMES = ['Mo', 'Ana', 'Kit', 'Lu'];
function shopCard(c, i, bt) {
  const icon = c.kind === 'weapon' ? G7.weaponIconUrl(c.item) : G7.gearIconUrl(c.item);
  const b = c.borrowed != null ? c.borrowed : null;
  const who = b != null ? BT_NAMES[b] : '';
  const dot = b != null ? `<i class="bt-dot" style="background:${SLOT[b]}"></i>` : '';
  let tape = `<span class="shop-card__no">#${String(i + 1).padStart(2, '0')}</span><span class="shop-card__kind">${c.kind === 'weapon' ? 'WPN' : 'GEAR'}</span>`;
  let extra = '';
  if (b != null && bt === 'BT1') tape = `<span class="shop-card__no">#${String(i + 1).padStart(2, '0')}</span><span class="bt1">${dot}FROM ${who.toUpperCase()}</span>`;
  
  if (b != null && bt === 'BT3') extra = `<span class="bt3" style="--s:${SLOT[b]}"><span>${who}'s</span></span>`;
  const sel = i === 3 ? ' shop-card--selected' : '';
  const short = c.price > 340 ? ' shop-card--short' : '';
  return `<button type="button" class="shop-card shop-card--${c.rarity}${short}${sel}" aria-label="${c.name}${who ? ', borrowed from ' + who : ''}"><span class="shop-card__tape">${tape}</span>${extra}<span class="shop-card__art"><img class="shop-card__icon${c.kind === 'gear' ? ' shop-card__icon--gear' : ''}" src="${icon}" alt=""></span><span class="shop-card__name">${c.name}</span><span class="shop-card__price">${sel ? 'Buy for $' + c.price : '$' + c.price}</span>${b != null && bt === 'BT2' ? `<span class="bt2" aria-hidden="true">${dot}From ${who}</span>` : `<span class="shop-card__stat">${c.stat}</span>`}</button>`;
}
const BT_CSS = `
.bt-dot{display:inline-block;width:10px;height:10px;border-radius:50%;border:1.5px solid #fff;margin-right:4px;vertical-align:-1px;flex:none}
.bt1{display:inline-flex;align-items:center;font-weight:800;white-space:nowrap}
.shop-card--epic .bt1 .bt-dot{border-color:#fff3d6}
.bt2{display:flex;align-items:center;margin:1px -6px -5px;padding:1px 6px 2px;background:#17191c;color:#fff;font:700 14px/18px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bt3{position:absolute;right:2px;top:17px;z-index:2;display:flex;align-items:center;transform:rotate(8deg);transform-origin:100% 0}
.bt3::before{content:"";width:12px;height:2px;background:var(--s);margin-right:-1px}
.bt3 span{background:#fff8e6;color:#17191c;font:800 14px/18px system-ui;padding:0 6px 0 9px;clip-path:polygon(6px 0,100% 0,100% 100%,6px 100%,0 50%);box-shadow:0 1px 0 rgba(0,0,0,.4);border-left:3px solid var(--s)}
.shop__panel--cards{max-height:none}
`;
function shopHtml(bt) {
  return `<div class="shop"><div class="shop__panel shop__panel--cards"><div class="shop__head"><h2 class="shop__title">Shop</h2><span class="shop__wallet">$340</span><button type="button" class="btn btn--small shop__reroll">Reroll $20</button><button type="button" class="btn btn--secondary btn--small">Close</button></div><div class="shop__body"><div class="shop__cards" style="grid-template-columns:repeat(3,minmax(96px,1fr));grid-auto-rows:minmax(112px,1fr);gap:8px">${CARDS.map((c, i) => shopCard(c, i, bt)).join('')}</div><div class="shop__always"><p class="shop__message">${bt === 'BT2' ? 'Grenade Launcher: borrowed from Mo · Blast 2.5 m' : 'Tap a card, then tap again to buy'}</p><h3 class="shop__section">Consumables</h3><div class="shop__items"><button class="shop__item shop__item--gear shop__item--icon" type="button"><img class="shop__icon shop__icon--gear" src="${G7.consumableIconUrl('medkit')}" width="32" height="32" alt=""><span class="shop__text"><span class="shop__name">Medkit ×1</span><span class="shop__price">$60</span></span></button><button class="shop__item shop__item--gear shop__item--icon" type="button"><img class="shop__icon shop__icon--gear" src="${G7.consumableIconUrl('grenades')}" width="32" height="32" alt=""><span class="shop__text"><span class="shop__name">Grenades ×2</span><span class="shop__price">$80</span></span></button></div><p class="shop__hint">1 card of 6 can come from a teammate's unlocks you don't have yet.</p></div></div></div></div>`;
}
const BT_V = {
  BT1: { name: 'The tape says it', desc: 'The tape row reads "#04 ● FROM MO" (Mo\'s slot colour) instead of "WPN". Nothing else on the card moves; but the tape text is the existing 11 px, smaller than the 14 px rule.' },
  BT2: { name: 'A "From Mo" strip at the foot', rec: true, desc: 'The card\'s last line becomes a dark strip "● From Mo", 14 px, the dot in Mo\'s slot colour (people colours); the full "Borrowed from Mo" is in the selected-card message and the screen-reader label. The card keeps its size (on the 568 phone the stat line is already cut today); the stat shows when the card is selected.' },
  BT3: { name: 'A luggage tag', desc: 'A small paper tag "Mo\'s" hangs from the card\'s corner on a string in Mo\'s colour. The most "found object", but it covers part of the picture and shortens the words.' },
};
{
  const s = section('s-bt', '3 · "Borrowed from …" card tag', 'Story 7.4',
    'One card of six can come from a teammate\'s unlocks that you don\'t have. Example: you are Ana, the Grenade Launcher (selected, epic) is borrowed from Mo and the Chainsaw from Kit. The tag shows who it\'s from in that player\'s slot colour (colour rule: people). Everything else is today\'s 5.13 card.',
    '<b>Recommended: BT2.</b> Readable 14 px words on every phone, the slot dot ties it to the teammate, the card keeps its size, and it never covers the rarity tape or the picture. (Text kept short because a full "Borrowed from Mo" does not fit a 96 px card at 14 px.)');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(BT_V)) {
    const v = BT_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(phone({ w: 568, h: 320, label: code, html: shopHtml(code), css: BT_CSS, bg: cityBg(568, 320, { stage: 2 }) }));
    fr.appendChild(phone({ w: 800, h: 360, label: code, html: shopHtml(code), css: BT_CSS, bg: cityBg(800, 360, { stage: 2 }) }));
  }
  pickRow(s, 'Borrowed tag', Object.keys(BT_V));
}
renderTraining();
