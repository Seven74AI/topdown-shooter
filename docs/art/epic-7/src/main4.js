/* 5 · Story 7.6 account screens: start-screen row, Save / Log in / Forgot with the keyboard up, recovery code, log out. */
const KB_H = { 568: 150, 800: 170 };
const AC_CSS = `
.ac{position:fixed;inset:0;background:rgba(0,0,0,.9);color:#fff;font:500 15px/1.3 system-ui,sans-serif}
.ac-top{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;gap:6px;padding:4px calc(var(--sr) + 12px) 6px calc(var(--sl) + 12px);overflow:hidden}
.ac-h{display:flex;align-items:center;gap:8px}
.ac-h h1{margin:0;font-size:19px;flex:1}
.ac-rules{margin:0;font-size:14px;color:#9aa0a6}
.ac-link{min-height:44px;border:0;background:none;color:#8fc3ff;font:700 14px system-ui;text-decoration:underline;text-underline-offset:3px;padding:0 4px}
.ac-row{display:flex;gap:8px;align-items:flex-end}
.ac-row .k-field{flex:1;min-width:0}
.ac-dots{display:flex;gap:5px}.ac-dots i{width:8px;height:8px;border-radius:50%;background:#555}.ac-dots i.on{background:#fff}
.st{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;gap:8px;background:rgba(0,0,0,.88);color:#fff;font:500 16px/1.3 system-ui,sans-serif;padding:10px calc(var(--sr) + 16px) calc(var(--sb) + 10px) calc(var(--sl) + 16px);text-align:center}
.st h1{margin:0;font-size:28px;letter-spacing:.04em}
.st .menu__form{gap:8px}
.st-acc{display:flex;align-items:center;gap:4px;font-size:14px;color:#bbb}
.st-acc b{color:#fff}
.st-bar{position:absolute;top:4px;right:calc(var(--sr) + 8px);display:flex;align-items:center;gap:0;font-size:14px;color:#bbb}
.st-chip{position:absolute;top:6px;left:calc(var(--sl) + 8px);display:flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:0;border-radius:22px;background:#2a2d32;color:#fff;font:700 14px system-ui}
.st-chip i{width:8px;height:8px;border-radius:50%;background:#f5c542}
.st-low{display:flex;gap:8px}
.sheet{position:absolute;left:calc(var(--sl) + 8px);top:54px;width:250px;background:#1e2125;border-radius:12px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.6);text-align:left;display:flex;flex-direction:column;gap:6px;z-index:3}
.sheet p{margin:0;font-size:14px;color:#bbb}
.sheet .k-btn{width:100%}
.dlg{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.75);padding:0 calc(var(--sr) + 12px) var(--sb) calc(var(--sl) + 12px)}
.dlg-c{width:min(420px,100%);background:#1e2125;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;text-align:left;color:#fff;font:500 15px/1.35 system-ui}
.dlg-c h2{margin:0;font-size:20px}
.dlg-c p{margin:0}
.dlg-b{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.code{font:800 30px/1.1 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em;text-align:center;padding:6px 0;user-select:text}
.paper{background:radial-gradient(rgba(90,70,40,.1) 1px,transparent 1.4px) 0 0/9px 9px,#ece3c8;color:#17191c;border-radius:3px;clip-path:polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%);padding-top:0}
.paper .tapeh{margin:0 -16px 2px;padding:3px 16px;background:repeating-linear-gradient(-45deg,#2f2a22 0 8px,#3d372d 8px 11px);color:#ece3c8;font:800 13px/18px "Arial Narrow",system-ui;letter-spacing:.08em;text-transform:uppercase}
.paper .code{color:#17191c;border:2px dashed #8a7a52;border-radius:4px}
.paper .k-btn{background:#17191c;color:#ece3c8}.paper .k-btn--ghost{background:transparent;color:#17191c;box-shadow:inset 0 0 0 2px #17191c}
.tag{background:linear-gradient(160deg,#9aa1aa,#5b626b 60%,#7d848d);color:#15171a;border-radius:22px 22px 12px 12px;border:2px solid #2a2e33;position:relative}
.tag::before{content:"";position:absolute;left:50%;top:9px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#1e2125;box-shadow:inset 0 0 0 2px #3a3f46}
.tag h2{margin-top:14px;text-align:center}
.tag .code{color:#20242a;text-shadow:0 1px 0 rgba(255,255,255,.45),0 -1px 0 rgba(0,0,0,.35)}
.tag .k-btn--ghost{color:#15171a;box-shadow:inset 0 0 0 2px #15171a}
`;
function field(label, value, focus = false, type = 'text') {
  const v = type === 'pw' ? '•'.repeat(value.length) : value;
  return `<div class="k-field"><label>${label}</label><div class="k-in${focus ? ' focus' : ''}">${v}${focus ? '<span class="k-caret"></span>' : ''}</div></div>`;
}
const AC_V = {
  AC1: {
    name: 'Header button, form scrolls above the keyboard',
    desc: 'Forms are a full screen with the main button in the header (Back · title · Save), so it never hides under the keyboard; the field you type in scrolls to the top. Start screen: a thin "Guest · Save my progress · Log in" line at the top right.',
    start: (logged) => `<div class="st" style="padding-top:40px"><span class="st-bar">${logged ? 'Logged in as <b style="color:#fff;margin-left:4px">mo_42</b> ·<button class="ac-link">Log out</button>' : 'Guest ·<button class="ac-link">Save my progress</button><button class="ac-link">Log in</button>'}</span><h1>HORDES</h1>${startForms()}</div>`,
    save: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Save my progress</h1><button class="k-btn k-btn--go">Save</button></div>${field('Username (3–20 letters, numbers, _ - .)', 'mo_42', true)}${field('Password (8 or more)', '', false, 'pw')}</div>`,
    login: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Log in</h1><button class="k-btn">Log in</button></div><p class="k-err">Wrong username or password</p>${field('Password', 'hunter22', true, 'pw')}<button class="ac-link" style="align-self:flex-start">Forgot password?</button></div>`,
    forgot: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Forgot password</h1><button class="k-btn">Set password</button></div>${field('Recovery code (from your screenshot)', 'ABCD-EFGH-JK', true)}${field('New password', '', false, 'pw')}</div>`,
    code: () => `<div class="dlg"><div class="dlg-c"><h2>Your recovery code</h2><div class="code">ABCD-EFGH-JKMN</div><p>Screenshot this: it's the only way back in if you forget your password.</p><div class="dlg-b"><button class="k-btn k-btn--dark">Copy</button><button class="k-btn k-btn--go">I saved it</button></div></div></div>`,
    logout: () => `<div class="dlg"><div class="dlg-c"><h2>Log out?</h2><p>This phone will play as a new guest. Your account is safe.</p><div class="dlg-b"><button class="k-btn k-btn--dark">Cancel</button><button class="k-btn">Log out</button></div></div></div>`,
  },
  AC2: {
    name: 'Side by side: all fields in one line', rec: true,
    desc: 'The fields sit next to each other in one row with the button at its end, so the whole form fits in the strip above the keyboard with nothing hidden and no scrolling. Start screen: the account line sits under the name field, as the story says.',
    start: (logged) => `<div class="st"><h1>HORDES</h1>${startForms(logged ? `<p class="st-acc">Logged in as <b>mo_42</b> <button class="ac-link">Log out</button></p>` : `<p class="st-acc">Playing as a guest · <button class="ac-link">Save my progress</button><button class="ac-link">Log in</button></p>`)}</div>`,
    save: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Save my progress</h1></div><div class="ac-row">${field('Username', 'mo_42', true)}${field('Password', '', false, 'pw')}<button class="k-btn k-btn--go">Save</button></div><p class="ac-rules">3–20 letters, numbers, _ - . · password 8 or more · works on any phone</p></div>`,
    login: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Log in</h1><button class="ac-link">Forgot password?</button></div><div class="ac-row">${field('Username', 'mo_42')}${field('Password', 'hunter22', true, 'pw')}<button class="k-btn">Log in</button></div><p class="k-err">Wrong username or password</p></div>`,
    forgot: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Forgot password</h1></div><div class="ac-row">${field('Username', 'mo_42')}${field('Recovery code', 'ABCD-EFGH-JK', true)}</div><div class="ac-row">${field('New password', '', false, 'pw')}<button class="k-btn">Set password</button></div></div>`,
    code: () => `<div class="dlg"><div class="dlg-c paper"><div class="tapeh">Recovery code · keep it</div><div class="code">ABCD-EFGH-JKMN</div><p>Screenshot this: it's the only way back in if you forget your password.</p><div class="dlg-b"><button class="k-btn k-btn--ghost">Copy</button><button class="k-btn">I saved it</button></div></div></div>`,
    logout: () => `<div class="dlg"><div class="dlg-c"><h2>Log out?</h2><p>This phone will play as a new guest. Your account is safe.</p><div class="dlg-b"><button class="k-btn k-btn--dark">Cancel</button><button class="k-btn">Log out</button></div></div></div>`,
  },
  AC3: {
    name: 'One field at a time',
    desc: 'Each form is two or three short steps, one big field each, Next beside it (dots show the step). Very calm on a small phone, but one more tap per form. Start screen: a "Guest" chip at the top left opens an account sheet (shown in the logged-in frame).',
    start: (logged) => logged ? `<div class="st"><button class="st-chip">${SVG.user} mo_42</button><div class="sheet"><p>Logged in as <b style="color:#fff">mo_42</b>. Your progress is saved to your account.</p><button class="k-btn k-btn--dark">Log out</button></div><h1>HORDES</h1>${startForms()}</div>` : `<div class="st"><button class="st-chip"><i></i>${SVG.user} Guest</button><h1>HORDES</h1>${startForms()}</div>`,
    save: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Save my progress</h1><span class="ac-dots"><i class="on"></i><i></i></span></div><div class="ac-row">${field('Pick a username', 'mo_42', true)}<button class="k-btn k-btn--go">Next</button></div><p class="ac-rules">3–20 letters, numbers, _ - .</p></div>`,
    login: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Log in as mo_42</h1><span class="ac-dots"><i></i><i class="on"></i></span></div><div class="ac-row">${field('Password', 'hunter22', true, 'pw')}<button class="k-btn">Log in</button></div><button class="ac-link" style="align-self:flex-start">Forgot password?</button></div>`,
    forgot: () => `<div class="ac"><div class="ac-top"><div class="ac-h"><button class="k-btn k-btn--dark" aria-label="Back">${SVG.back}</button><h1>Forgot password</h1><span class="ac-dots"><i></i><i class="on"></i><i></i></span></div><div class="ac-row">${field('Your recovery code', 'ABCD-EFGH-JK', true)}<button class="k-btn">Next</button></div></div>`,
    code: () => `<div class="dlg"><div class="dlg-c tag"><h2>Your recovery code</h2><div class="code">ABCD-EFGH-JKMN</div><p>Screenshot this: it's the only way back in if you forget your password.</p><div class="dlg-b"><button class="k-btn k-btn--ghost">Copy</button><button class="k-btn k-btn--dark">I saved it</button></div></div></div>`,
    logout: () => `<div class="dlg"><div class="dlg-c tag"><h2>Log out?</h2><p>This phone will play as a new guest. Your account is safe.</p><div class="dlg-b"><button class="k-btn k-btn--ghost">Cancel</button><button class="k-btn k-btn--dark">Log out</button></div></div></div>`,
  },
};
function startForms(accLine = '') {
  return `<div class="menu__form"><label class="menu__label">Your name</label><input class="menu__input" value="Mo" readonly><button class="btn" type="button">Create game</button></div>${accLine}<div class="menu__form"><label class="menu__label">Or join with a code</label><input class="menu__input menu__input--code" placeholder="CODE" readonly><button class="btn" type="button">Join</button></div><div class="st-low"><button class="btn btn--secondary" type="button">Practice solo</button><button class="btn btn--secondary" type="button">Progress</button></div>`;
}
{
  const s = section('s-ac', '5 · Account screens', 'Story 7.6',
    'Start-screen account row (guest and logged in), the Save my progress / Log in / Forgot password forms <b>with the phone keyboard up</b> (it covers about half of a 568 × 320 screen, so the form has to live in the strip above it), the recovery-code card (shown once), and the log-out confirm. The same account row sits in the hub header (item 2) and the Results nudge is row 4 of the rewards panel (item 1).',
    '<b>Recommended: AC2.</b> On a landscape phone the keyboard leaves a short, wide strip: putting the fields side by side uses that shape, so every field and the button stay visible while typing, with no scrolling and no extra steps.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  const bgS = cityBg(568, 320, { stage: 1 }), bgL = cityBg(800, 360, { stage: 1 });
  for (const code of Object.keys(AC_V)) {
    const v = AC_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · start, guest`, html: v.start(false), css: AC_CSS, bg: bgS }));
    fr.appendChild(phone({ w: 800, h: 360, label: `${code} · start, guest`, html: v.start(false), css: AC_CSS, bg: bgL }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · start, logged in`, html: v.start(true), css: AC_CSS, bg: bgS }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · Save my progress`, html: v.save() + kb(KB_H[568]), css: AC_CSS }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · Log in (wrong password)`, html: v.login() + kb(KB_H[568]), css: AC_CSS }));
    fr.appendChild(phone({ w: 800, h: 360, label: `${code} · Forgot password`, html: v.forgot() + kb(KB_H[800]), css: AC_CSS }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · recovery code`, html: v.code(), css: AC_CSS, bg: bgS }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · log out`, html: v.logout(), css: AC_CSS, bg: bgS }));
  }
  pickRow(s, 'Account screens', Object.keys(AC_V));
}
