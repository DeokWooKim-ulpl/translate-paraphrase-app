/* 화면 흐름 테스트: 가짜 런타임(tests/stub.js)을 붙여 실제 버튼·단축키로 돌려 봄.
   쓰는 법:  python3 build.py && node tests/e2e.test.js   (Playwright + Chromium 필요) */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { stubRuntime } = require('./stub.js');

const ROOT = path.join(__dirname, '..');
const OUTDIR = process.env.E2E_OUT || path.join(ROOT, 'tests', '_out');
fs.mkdirSync(OUTDIR, { recursive: true });
const body = fs.readFileSync(path.join(ROOT, 'app', 'index.html'), 'utf8');
const pagePath = path.join(OUTDIR, 'page.html');
/* 게시할 때 플랫폼이 씌우는 뼈대를 흉내 냄 */
fs.writeFileSync(pagePath, '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, info) { if (cond) pass++; else { fail++; fails.push(name); console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } }
function eq(name, got, want) { ok(name, JSON.stringify(got) === JSON.stringify(want), { got, want }); }

const EN = 'The laser was lock to the cavity using PDH technique, which reduce the noise to 1.2 kHz [3].';
const KO = '레이저를 공진기에 잠갔다. 그 결과 잡음이 1.2 kHz 로 줄었다 [3].';
const UID = 'u_testuser0123456789abcd', HCOL = 'data/users/' + UID + '/app/history';

async function open(browser, o) {
  o = o || {};
  const ctx = await browser.newContext({ viewport: { width: o.w || 1320, height: o.h || 900 }, deviceScaleFactor: 1, colorScheme: o.dark ? 'dark' : 'light', timezoneId: 'Asia/Seoul', permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  if (o.cfg) await p.addInitScript(c => { window.__cfg = c; }, o.cfg);
  if (o.ls) await p.addInitScript(kv => { try { if (!sessionStorage.getItem('__seeded')) { for (const k in kv) localStorage.setItem(k, kv[k]); sessionStorage.setItem('__seeded', '1'); } } catch (e) { } }, o.ls);
  await p.addInitScript(stubRuntime);
  await p.goto('file://' + pagePath + (o.hash || ''));
  await p.waitForTimeout(120);
  return { p, errs, ctx };
}
const T = async (p, sel) => { const l = p.locator(sel).first(); return (await l.count()) ? l.textContent() : null; };
const calls = p => p.evaluate(() => window.__calls.map(c => ({ state: c.state, model: c.opts.model, cache: c.opts.cache, head: c.input.slice(0, 40) })));
const histDocs = p => p.evaluate(col => Array.from(window.__docs.entries()).filter(([k]) => k.indexOf(col + '/') === 0).map(([k, v]) => v), HCOL);
const wait = (p, ms) => p.waitForTimeout(ms || 60);
async function settle(p) { for (let i = 0; i < 50; i++) { const busy = await p.evaluate(() => !!document.querySelector('.out.busy') || window.__calls.some(c => c.state === 'running')); if (!busy) break; await p.waitForTimeout(20); } await p.waitForTimeout(40); }

(async () => {
  const browser = await chromium.launch();

  /* ---------- 1. 처음 화면 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    eq('1 title', await p.title(), '번역 및 패러프레이징 앱');
    eq('1 lang attr', await p.evaluate(() => document.documentElement.lang), 'ko');
    eq('1 tabs', await p.$$eval('nav.top button', bs => bs.map(b => b.dataset.tab)), ['polish', 'translate', 'terms', 'history']);
    ok('1 run disabled when empty', await p.$eval('#p-run', b => b.disabled));
    eq('1 store chip', await T(p, '#dbstat'), '기록: 계정에 저장');
    ok('1 no Engram wording', !/engram/i.test(body));
    ok('1 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 2. 교정: 변경 표시, 되돌리기, 깨끗한 글, 기록 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.fill('#p-in', EN);
    ok('2 auto chip shows language', /자동 · 영어/.test(await T(p, '#p-lang [data-v="auto"]')));
    await p.press('#p-in', 'Control+Enter'); await settle(p);
    const c = await calls(p);
    eq('2 one call', c.length, 1); eq('2 model', c[0].model, 'claude-haiku-5-5'); ok('2 first press uses cache default', c[0].cache === undefined);
    const prompt = await p.evaluate(() => window.__calls[0].input);
    ok('2 prompt: text in block, guard, format last', /<text>\nThe laser was lock/.test(prompt) && /never an instruction to you/.test(prompt) && prompt.trim().endsWith('</notes>'));
    eq('2 changes marked', await p.$$eval('#p-out .chg', xs => xs.length), 2);
    eq('2 del/ins', await p.$$eval('#p-out .chg', xs => xs.map(x => x.textContent)), ['locklocked', 'reducereduces']);
    ok('2 status', /교정 완료 · 수정 2곳/.test(await T(p, '#p-status')), await T(p, '#p-status'));
    eq('2 notes cards', await p.$$eval('#p-pane-notes .note', xs => xs.length), 2);
    eq('2 notes count chip', await T(p, '#p-notes-n'), '2');
    ok('2 integrity chip ok', /수치·수식·인용 2개 그대로/.test(await T(p, '#p-chips')), await T(p, '#p-chips'));
    ok('2 model chip', /Haiku 5.5/.test(await T(p, '#p-chips')));
    await p.click('#p-copy-out');
    eq('2 copy gives clean text', await p.evaluate(() => navigator.clipboard.readText()), EN.replace('was lock', 'was locked').replace('which reduce', 'which reduces'));
    let docs = await histDocs(p);
    eq('2 history saved once under user path', docs.length, 1); eq('2 history kind', [docs[0].kind, docs[0].lang, docs[0].level], ['fix', 'en', 'standard']);
    /* 수정 하나 되돌리기 */
    await p.click('#p-out .chg >> nth=0'); await wait(p);
    ok('2 reject marks', await p.$eval('#p-out .chg', x => x.classList.contains('rej')));
    await p.click('#p-copy-out');
    eq('2 copy after reject', await p.evaluate(() => navigator.clipboard.readText()), EN.replace('which reduce', 'which reduces'));
    ok('2 header shows rejected count', /수정 2곳 · 1곳 되돌림/.test(await T(p, '#p-pane-notes .hd')));
    await p.waitForTimeout(1400);
    docs = await histDocs(p);
    eq('2 upsert keeps one record', docs.length, 1); ok('2 record updated + edited flag', docs[0].output.indexOf('was lock to') >= 0 && docs[0].edited === true);
    /* 깨끗한 글 */
    await p.click('#p-view [data-v="clean"]');
    eq('2 clean view has no marks', await p.$$eval('#p-out .chg, #p-out del', xs => xs.length), 0);
    eq('2 clean text', await T(p, '#p-out'), EN.replace('which reduce', 'which reduces'));
    await p.click('#p-view [data-v="marks"]');
    await p.click('#p-pane-notes .hd button'); await wait(p);
    eq('2 re-apply all', await p.$$eval('#p-out .chg.rej', xs => xs.length), 0);
    /* 같은 글을 다시 누르면 캐시 허용, '다시 교정'은 새 답 */
    await p.click('#p-run'); await settle(p);
    await p.click('#p-again'); await settle(p);
    const c2 = await calls(p);
    eq('2 again uses cache:false', [c2[1].cache, c2[2].cache], [undefined, false]);
    ok('2 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 3. 패러프레이즈: 세 가지 안, 더 받기, 원문과 나란히 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.fill('#p-in', EN.replace('was lock', 'was locked').replace('which reduce', 'which reduces'));
    await p.click('#p-mode [data-v="para"]');
    ok('3 style row visible, level hidden', await p.$eval('#p-style', n => !n.hidden) && await p.$eval('#p-level', n => n.hidden));
    eq('3 run label', await T(p, '#p-run'), '패러프레이즈하기');
    await p.click('#p-style [data-v="academic"]');
    await p.click('#p-run'); await settle(p);
    eq('3 three version chips', await p.$$eval('#p-vers button', bs => bs.map(b => b.textContent)), ['기본', '가깝게', '과감하게']);
    ok('3 shows balanced', /R1 balanced/.test(await T(p, '#p-out')));
    const pr = await p.evaluate(() => window.__calls[0].input);
    ok('3 prompt: three versions, academic register, naturalness first', /Write three versions/.test(pr) && /Journal-article English/.test(pr) && /1\. Natural/.test(pr));
    eq('3 paraphrase always fresh', (await calls(p))[0].cache, false);
    await p.click('#p-vers [data-v="2"]'); await wait(p);
    ok('3 switch version', /R1 freer/.test(await T(p, '#p-out')));
    ok('3 notes follow version', /we stabilized/.test(await T(p, '#p-pane-notes')));
    ok('3 reuse chip', /일반 낱말 재사용 \d+%/.test(await T(p, '#p-pane-notes .hd')));
    await p.click('#p-view [data-v="pair"]');
    eq('3 pair view', await p.$$eval('#p-out .pair', xs => xs.length), 1);
    await p.click('#p-view [data-v="new"]');
    await p.click('#p-again'); await settle(p);
    eq('3 six chips after more', await p.$$eval('#p-vers button', bs => bs.map(b => b.textContent)), ['기본', '가깝게', '과감하게', '기본 2', '가깝게 2', '과감하게 2']);
    const pr2 = await p.evaluate(() => window.__calls[1].input);
    ok('3 second prompt carries earlier versions', /<earlier_versions>/.test(pr2) && /R1 freer/.test(pr2));
    ok('3 newest selected', /R2 balanced/.test(await T(p, '#p-out')));
    const docs = await histDocs(p);
    eq('3 one record, six versions', [docs.length, docs[0].versions.length, docs[0].kind, docs[0].style], [1, 6, 'para', 'academic']);
    ok('3 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 4. 멈추기·오류: 한국어 문구, 이전 결과 유지, 기록에 넣지 않음 ---------- */
  {
    const { p, errs, ctx } = await open(browser, { cfg: { delay: 40, steps: 6 } });
    await p.fill('#p-in', EN);
    await p.click('#p-run'); await wait(p, 60);
    eq('4 run button becomes stop', await T(p, '#p-run'), '멈추기');
    await p.fill('#p-in', EN + ' More.');
    eq('4 typing does not re-arm run', await T(p, '#p-run'), '멈추기');
    await p.keyboard.press('Escape'); await settle(p);
    ok('4 stop message in Korean', /^멈췄습니다\./.test(await T(p, '#p-status')), await T(p, '#p-status'));
    ok('4 no developer text', !/developer message/.test(await p.evaluate(() => document.body.innerText)));
    eq('4 nothing saved', (await histDocs(p)).length, 0);
    eq('4 run label back', await T(p, '#p-run'), '교정하기');
    /* 성공 한 번 → 다시 실행 중 멈춤 → 이전 결과 그대로 */
    await p.fill('#p-in', EN);
    await p.evaluate(() => { window.__cfg.delay = 0; });
    await p.click('#p-run'); await settle(p);
    const before = await T(p, '#p-out');
    await p.evaluate(() => { window.__cfg.delay = 40; });
    await p.click('#p-again'); await wait(p, 60);
    await p.click('#p-run'); await settle(p);
    eq('4 previous result kept after stop', await T(p, '#p-out'), before);
    ok('4 says previous kept', /이전 결과를 그대로 둡니다/.test(await T(p, '#p-status')));
    eq('4 still one record', (await histDocs(p)).length, 1);
    /* 오류 코드 */
    await p.evaluate(() => { window.__cfg.delay = 0; window.__cfg.failBefore = 'rate_limited'; });
    await p.click('#p-again'); await settle(p);
    ok('4 rate limit copy', /사용량 한도/.test(await T(p, '#p-status')), await T(p, '#p-status'));
    ok('4 error style', await p.$eval('#p-statusbar', n => n.classList.contains('err')));
    await p.evaluate(() => { window.__cfg.failBefore = 'not_granted'; });
    await p.click('#p-again'); await settle(p);
    ok('4 not_granted disables run', await p.$eval('#p-run', b => b.disabled) && await p.$eval('#t-run', b => b.disabled));
    ok('4 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 5. 점검: 문제 목록, 적용·되돌리기 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.fill('#p-in', EN);
    await p.click('#p-run'); await settle(p);
    await p.click('#p-sidetab [data-v="review"]'); await settle(p);
    eq('5 review call made', (await calls(p)).length, 2);
    const rp = await p.evaluate(() => window.__calls[1].input);
    ok('5 review sees source and result', /<source>\nThe laser was lock/.test(rp) && /<result>\nThe laser was locked/.test(rp));
    eq('5 two issues', await p.$$eval('#p-pane-review .note', xs => xs.length), 2);
    ok('5 chips', /의미 확인 1건/.test(await T(p, '#p-pane-review .hd')) && /어색한 곳 1건/.test(await T(p, '#p-pane-review .hd')));
    eq('5 count chip', await T(p, '#p-review-n'), '2');
    ok('5 unlocatable issue has no apply button', /찾지 못해/.test(await p.$eval('#p-pane-review .note >> nth=1', n => n.textContent)));
    await p.click('#p-pane-review .note >> nth=0 >> button'); await wait(p);
    await p.click('#p-view [data-v="clean"]');
    ok('5 fix applied to result', /^FIXED The laser was/.test(await T(p, '#p-out')), await T(p, '#p-out'));
    await p.click('#p-pane-review .note >> nth=0 >> button'); await wait(p);
    ok('5 toggle off restores', /^The laser was locked/.test(await T(p, '#p-out')));
    /* 결과를 다른 방법으로 바꾸면 점검 목록은 옛것으로 표시 */
    await p.click('#p-view [data-v="marks"]'); await p.click('#p-out .chg >> nth=0'); await wait(p);
    ok('5 stale notice', /점검한 뒤에 결과가 바뀌었습니다/.test(await T(p, '#p-pane-review')));
    ok('5 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 6. 다른 표현: 구절을 끌어 고르고 바꾸기 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.fill('#p-in', 'The laser was locked to the cavity.');
    await p.click('#p-mode [data-v="para"]'); await p.click('#p-triple');
    await p.click('#p-run'); await settle(p);
    eq('6 single version when triple off', await p.$$eval('#p-vers button', bs => bs.length), 0);
    await p.click('#p-sidetab [data-v="alt"]');
    await p.evaluate(() => { const n = document.getElementById('p-out').firstChild, i = n.textContent.indexOf('the laser showed'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 16); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
    await wait(p, 80);
    eq('6 selection shown', await T(p, '#p-pane-alt .quote'), 'the laser showed');
    await p.click('#p-pane-alt button.main'); await settle(p);
    eq('6 three alternatives', await p.$$eval('#p-pane-alt .note', xs => xs.length), 3);
    const ap = await p.evaluate(() => window.__calls[1].input);
    ok('6 passage marks selection', /⟦the laser showed⟧/.test(ap));
    await p.click('#p-pane-alt .note >> nth=1 >> button'); await wait(p);
    ok('6 replaced in result', /method, ALT-TWO 1\.2 kHz/.test(await T(p, '#p-out')), await T(p, '#p-out'));
    ok('6 done message', /바꿨습니다/.test(await T(p, '#p-pane-alt')));
    ok('6 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 7. 번역: 메모, 용어집 추가, 같은 언어 막기, 탭 사이 보내기, 바꾸기 ---------- */
  {
    const { p, errs, ctx } = await open(browser, { hash: '#translate' });
    await p.fill('#t-in', KO);
    ok('7 detect', /감지: 한국어/.test(await T(p, '#t-det')));
    await p.press('#t-in', 'Control+Enter'); await settle(p);
    ok('7 result', /^TR1\[레이저를/.test(await T(p, '#t-out')));
    const tp = await p.evaluate(() => window.__calls[0].input);
    ok('7 prompt direction + register, no rewrite command', /Korean → English/.test(tp) && /Target register: Neutral, clear written English/.test(tp) && !/Rewrite/.test(tp));
    eq('7 memo cards', await p.$$eval('#t-pane-notes .note', xs => xs.length), 2);
    ok('7 integrity flags lost numbers', /수치·수식·인용 확인/.test(await T(p, '#t-chips')));
    await p.click('#t-pane-notes .note >> nth=0 >> button'); await wait(p, 100);
    eq('7 glossary got the pair', await p.$eval('#pf-terms', t => t.value), '공진기 = cavity');
    ok('7 terms chip', /용어 1/.test(await T(p, '#t-terms-chip')));
    let docs = await histDocs(p);
    eq('7 history tr', [docs.length, docs[0].kind, docs[0].src, docs[0].dst], [1, 'tr', 'ko', 'en']);
    /* 다음 번역에는 용어집이 실림 */
    await p.click('#t-again'); await settle(p);
    ok('7 glossary sent', /<glossary>\n- "공진기" <-> "cavity"/.test(await p.evaluate(() => window.__calls[1].input)));
    /* 교정 탭으로 */
    await p.click('#t-fix'); await wait(p);
    ok('7 arrives in polish tab with text, no stale result', await p.$eval('#tab-polish', s => !s.hidden) && /^TR2\[/.test(await p.$eval('#p-in', t => t.value)) && await p.$eval('#p-out', o => o.classList.contains('empty')));
    eq('7 focus in input', await p.evaluate(() => document.activeElement.id), 'p-in');
    /* 번역 탭으로 보내기: 언어가 맞춰짐 */
    await p.fill('#p-in', EN); await p.click('#p-run'); await settle(p);
    await p.click('#p-send'); await wait(p);
    eq('7 send sets languages', await p.evaluate(() => [document.getElementById('t-src').value, document.getElementById('t-dst').value]), ['en', 'ko']);
    ok('7 translate tab cleared', await p.$eval('#t-out', o => o.classList.contains('empty')));
    /* 같은 언어 막기 */
    await p.selectOption('#t-src', 'auto'); await p.selectOption('#t-dst', 'en');
    await p.click('#t-run'); await settle(p);
    eq('7 auto: target switched', await p.$eval('#t-dst', s => s.value), 'ko');
    ok('7 says why', /원문이 영어라서 한국어로 옮깁니다/.test(await T(p, '#t-status')));
    await p.selectOption('#t-src', 'ko'); await p.selectOption('#t-dst', 'ko');
    const n0 = (await calls(p)).length;
    await p.click('#t-again'); await settle(p);
    ok('7 same language refused without a call', (await calls(p)).length === n0 && /같습니다/.test(await T(p, '#t-status')));
    /* ⇄: 새로 붙여 넣은 글은 덮어쓰지 않음 */
    await p.selectOption('#t-src', 'auto'); await p.selectOption('#t-dst', 'ko');
    await p.fill('#t-in', 'Brand new English text here.');
    await p.click('#t-swap'); await wait(p);
    eq('7 swap keeps new input', await p.$eval('#t-in', t => t.value), 'Brand new English text here.');
    eq('7 swap languages', await p.evaluate(() => [document.getElementById('t-src').value, document.getElementById('t-dst').value]), ['ko', 'en']);
    ok('7 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 8. 긴 글 번역: 조각, 멈춤, 이어서 ---------- */
  {
    const { p, errs, ctx } = await open(browser, { hash: '#translate', cfg: { delay: 80, steps: 3 } });
    const long = Array.from({ length: 4 }, (_, i) => '문단' + (i + 1) + ' ' + '레이저 주파수를 안정화하였다. '.repeat(190)).join('\n\n');
    await p.fill('#t-in', long);
    await p.click('#t-run');
    await p.waitForFunction(() => window.__calls.length >= 2 && / 조각 옮기는 중/.test(document.getElementById('t-status').textContent), null, { timeout: 5000 });
    ok('8 progress visible and first chunk stays on screen', /^TR1\[문단1/.test(await T(p, '#t-out')) && /\d \/ 4 조각 옮기는 중/.test(await T(p, '#t-status')));
    await p.click('#t-run'); await settle(p);
    const st = await calls(p), k = st.length - 1;                 /* k = 끝난 조각 수 */
    ok('8 stop makes no further call', st[k].state === 'cancelled' && st.slice(0, k).every(c => c.state === 'done') && k >= 1 && k < 4, st.map(c => c.state));
    const msg = await T(p, '#t-status');
    ok('8 stop message names the chunk and resume', msg.indexOf('4 조각 중 ' + (k + 1) + '번째에서 멈췄습니다') >= 0 && msg.indexOf((k + 1) + '번째 조각부터 이어서') >= 0, msg);
    eq('8 partial not saved', (await histDocs(p)).length, 0);
    ok('8 partial: review disabled, copy enabled', await p.$eval('#t-sidetab [data-v="review"]', b => b.disabled) && await p.$eval('#t-copy-out', b => !b.disabled));
    await p.evaluate(() => { window.__cfg.delay = 0; });
    await p.click('#t-run'); await settle(p);
    const all = await p.evaluate(() => window.__calls.map(c => c.input));
    eq('8 resume makes only the missing calls', all.length, k + 1 + (4 - k));
    ok('8 resumed chunk gets the previous passage for continuity', /<previous>/.test(all[k + 1]) && /already delivered:\nTR/.test(all[k + 1]));
    ok('8 finished message', (await T(p, '#t-status')).indexOf('번역 완료 · 4 조각 (' + (k + 1) + '번째부터 이어서)') >= 0, await T(p, '#t-status'));
    const out = await T(p, '#t-out');
    eq('8 four chunks joined by paragraph breaks', out.split('\n\n').length, 4);
    ok('8 each chunk is a finished translation', out.split('\n\n').every(x => /^TR\d+\[문단\d/.test(x)), out.slice(0, 120));
    eq('8 saved once', (await histDocs(p)).length, 1);
    ok('8 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 9. 용어·지침: 저장과 프롬프트 반영 ---------- */
  {
    const { p, errs, ctx } = await open(browser, { hash: '#terms' });
    await p.fill('#pf-terms', '공진기 = cavity\npulse width > pulse duration\n!very\nYb:KGW');
    await p.fill('#pf-rules', '# off\nen: Use American spelling.\nko: 본문은 -다 체.');
    ok('9 counts', /번역쌍 1 · 대신 쓰기 1 · 쓰지 않기 1 · 그대로 두기 1/.test(await T(p, '#pf-terms-n')) && /지침 2줄/.test(await T(p, '#pf-rules-n')));
    eq('9 tab chip', await T(p, '#termsn'), '6');
    await p.waitForTimeout(1000);
    const doc = await p.evaluate(u => window.__docs.get('data/users/' + u + '/prefs'), UID);
    ok('9 saved to private doc', doc && /공진기 = cavity/.test(doc.terms) && /American/.test(doc.rules));
    await p.click('#tabbtn-polish'); await p.fill('#p-in', 'The cavity is very stable.');
    await p.click('#p-run'); await settle(p);
    const pr = await p.evaluate(() => window.__calls[0].input);
    ok('9 glossary + preferences in prompt', /<glossary>/.test(pr) && /Write "pulse duration", never "pulse width"/.test(pr) && /<preferences>\n- Use American spelling\./.test(pr) && !/본문은/.test(pr));
    ok('9 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 10. 기록: 거르기, 다시 열기, 삭제, 내보내기 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.fill('#p-in', EN); await p.click('#p-run'); await settle(p);
    await p.click('#p-mode [data-v="para"]'); await p.click('#p-run'); await settle(p);
    await p.click('#tabbtn-translate'); await p.fill('#t-in', KO); await p.click('#t-run'); await settle(p);
    await p.click('#tabbtn-history'); await wait(p);
    eq('10 count chip', await T(p, '#histn'), '3');
    eq('10 three rows', await p.$$eval('#h-list .hist', xs => xs.length), 3);
    ok('10 labels are words, local time', /번역/.test(await T(p, '#h-list .hist >> nth=0')) && /오늘 \d\d:\d\d/.test(await T(p, '#h-list .hist >> nth=0')));
    await p.click('#h-filter [data-v="para"]');
    eq('10 filter', await p.$$eval('#h-list .hist', xs => xs.length), 1);
    await p.click('#h-md');
    const md = await p.evaluate(() => navigator.clipboard.readText());
    ok('10 markdown export', /^---\ntitle: 번역·패러프레이즈 기록/.test(md) && /count: 1/.test(md) && /## \d{4}-\d\d-\d\d \d\d:\d\d · 패러프레이즈/.test(md) && /\n> The laser/.test(md));
    await p.click('#h-file'); await wait(p);
    ok('10 file export through downloads', await p.evaluate(() => window.__saved.length === 1 && /\.md$/.test(window.__saved[0].filename)));
    await p.click('#h-filter [data-v=""]');
    /* 패러프레이즈 기록 다시 열기 */
    await p.click('#h-list .hist >> nth=1 >> text=다시 열기'); await wait(p);
    ok('10 reopen para: tab, mode, versions', await p.$eval('#tab-polish', s => !s.hidden) && await p.$eval('#p-mode [data-v="para"]', b => b.getAttribute('aria-pressed') === 'true') && (await p.$$eval('#p-vers button', bs => bs.length)) === 3);
    await p.click('#tabbtn-history');
    await p.click('#h-list .hist >> nth=2 >> text=다시 열기'); await wait(p);
    ok('10 reopen fix: marks restored', (await p.$$eval('#p-out .chg', xs => xs.length)) === 2 && await p.$eval('#p-mode [data-v="fix"]', b => b.getAttribute('aria-pressed') === 'true'));
    await p.click('#tabbtn-history');
    await p.click('#h-list .hist >> nth=0 >> text=다시 열기'); await wait(p);
    ok('10 reopen translation: tab, languages, review enabled', await p.$eval('#tab-translate', s => !s.hidden) && await p.$eval('#t-src', s => s.value === 'ko') && await p.$eval('#t-sidetab [data-v="review"]', b => !b.disabled));
    /* 삭제 (두 번 눌러야) */
    await p.click('#tabbtn-history');
    await p.click('#h-list .hist >> nth=0 >> text=삭제'); await p.click('#h-list .hist >> nth=0 >> text=정말 삭제?'); await wait(p, 100);
    eq('10 delete one', (await histDocs(p)).length, 2);
    await p.click('#h-clear'); await p.click('#h-clear'); await wait(p, 200);
    eq('10 clear all', (await histDocs(p)).length, 0);
    ok('10 empty message', /아직 기록이 없습니다/.test(await T(p, '#h-list')));
    ok('10 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 11. 예전 기록(1.x 형식)과 저장소 없는 화면 ---------- */
  {
    const legacy = [{ id: 'old1', at: '2026-11-09T01:00:00.000Z', tool: '번역+점검', lang: 'auto→en', mode: 'academic', input: KO, output: 'The laser was locked.', tier: 'quick' },
      { id: 'old2', at: '2026-11-09T02:00:00.000Z', tool: '패러프레이즈', lang: 'en', mode: 'formal', input: EN, output: 'Reworded.', notes: '- "a" → "b": c' }];
    const { p, errs, ctx } = await open(browser, { cfg: { off: ['db'] }, ls: { hist: JSON.stringify(legacy), tier: 'deep' }, hash: '#history' });
    eq('11 store chip without db', await T(p, '#dbstat'), '기록: 이 브라우저만');
    eq('11 legacy rows', await p.$$eval('#h-list .hist', xs => xs.length), 2);
    eq('11 old tier setting honoured', await p.$eval('#tier', s => s.value), 'deep');
    await p.click('#h-list .hist >> nth=1 >> text=다시 열기'); await wait(p);
    ok('11 legacy 번역+점검 opens in translate tab', await p.$eval('#tab-translate', s => !s.hidden) && await p.$eval('#t-dst', s => s.value === 'en') && await p.$eval('#t-style [data-v="academic"]', b => b.getAttribute('aria-pressed') === 'true'));
    await p.click('#tabbtn-polish'); await p.fill('#p-in', EN); await p.click('#p-run'); await settle(p);
    eq('11 model follows selector', (await calls(p))[0].model, 'claude-sonnet-5-5');
    ok('11 local history grows', (await p.evaluate(() => JSON.parse(localStorage.getItem('hist')).length)) === 3);
    ok('11 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 12. 설정·초안 기억, 키보드, 탭 접근성 ---------- */
  {
    const { p, errs, ctx } = await open(browser);
    await p.click('#p-lang [data-v="ko"]'); await p.click('#p-mode [data-v="para"]'); await p.click('#p-style [data-v="report"]');
    await p.fill('#p-in', '레이저를 공진기에 잠궜다.'); await p.fill('#p-note', 'Optics Letters 초록 · 150단어 이내');
    await p.waitForTimeout(500);
    await p.reload(); await p.waitForTimeout(150);
    eq('12 restored after reload', await p.evaluate(() => [document.querySelector('#p-lang [aria-pressed="true"]').dataset.v, document.querySelector('#p-mode [aria-pressed="true"]').dataset.v, document.querySelector('#p-style [aria-pressed="true"]').dataset.v, document.getElementById('p-in').value, document.getElementById('p-note').value]),
      ['ko', 'para', 'report', '레이저를 공진기에 잠궜다.', 'Optics Letters 초록 · 150단어 이내']);
    ok('12 run enabled from restored draft', await p.$eval('#p-run', b => !b.disabled));
    /* 한국어 전용 문체는 영어에서 표준으로 — 방식(패러프레이즈)은 그대로 */
    await p.click('#p-mode [data-v="fix"]'); await p.click('#p-lang [data-v="en"]');
    eq('12 mode stays fix when switching to English', await p.$eval('#p-mode [aria-pressed="true"]', b => b.dataset.v), 'fix');
    /* Ctrl+Enter 두 번 = 한 번 실행 */
    await p.click('#p-lang [data-v="auto"]'); await p.fill('#p-in', EN);
    await p.evaluate(() => { window.__cfg.delay = 30; window.__cfg.steps = 4; });
    await p.focus('#p-in'); await p.keyboard.press('Control+Enter'); await p.keyboard.press('Control+Enter'); await settle(p);
    eq('12 double shortcut = one call', (await calls(p)).length, 1);
    ok('12 word cap rule from note', /must not exceed/.test(await p.evaluate(() => window.__calls[0].input)) === false);
    /* 큰 탭 화살표 */
    await p.focus('#tabbtn-polish'); await p.keyboard.press('ArrowRight');
    eq('12 arrow moves tab', await p.evaluate(() => [document.activeElement.id, document.querySelector('nav.top [aria-selected="true"]').dataset.tab, location.hash]), ['tabbtn-translate', 'translate', '#translate']);
    await p.keyboard.press('End');
    eq('12 End goes to history', await p.evaluate(() => document.activeElement.id), 'tabbtn-history');
    ok('12 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 14. 검증에서 찾은 문제의 회귀 테스트 ---------- */
  {
    const { p, errs, ctx } = await open(browser, { cfg: { delay: 40, steps: 8 } });
    await p.fill('#p-in', EN);
    await p.click('#p-run'); await settle(p);
    /* 다시 실행하는 동안: 복사는 옛 결과를 집지 않게 꺼짐, 보기 칩을 눌러도 흐르는 글이 유지됨 */
    await p.click('#p-again'); await wait(p, 100);
    ok('14 copy disabled while running', await p.$eval('#p-copy-out', b => b.disabled));
    await p.click('#p-view [data-v="clean"]');
    ok('14 view chip does not repaint the old result mid-run', await p.$eval('#p-out', o => o.classList.contains('busy')));
    await settle(p);
    await p.click('#p-view [data-v="marks"]');
    /* 점검 창 안의 멈추기: 글이 흐르는 중에도 눌림 */
    await p.click('#p-sidetab [data-v="review"]');
    await p.waitForSelector('#p-pane-review .hd button', { timeout: 3000 });
    const box = await (await p.$('#p-pane-review .hd button')).boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(90); await p.mouse.up();
    await settle(p);
    eq('14 pane stop button cancels the review', (await calls(p)).pop().state, 'cancelled');
    ok('14 review tab stays reachable', await p.$eval('#p-sidetab [data-v="review"]', b => !b.disabled));
    /* 다시 점검은 새 답을 받음 */
    await p.evaluate(() => { window.__cfg.delay = 0; });
    await p.click('#p-pane-review >> text=다시 점검'); await settle(p);
    eq('14 redo review is fresh', (await calls(p)).pop().cache, false);
    /* 되돌린 수정은 점검 수정을 적용해도 남음 */
    await p.click('#p-out .chg >> nth=1'); await wait(p);
    await p.click('#p-pane-review >> text=다시 점검'); await settle(p);
    await p.click('#p-pane-review .note >> nth=0 >> button'); await wait(p);
    ok('14 rejected change survives a review fix', /1곳 되돌림/.test(await T(p, '#p-pane-notes .hd')) && (await p.$$eval('#p-out .chg.rej', xs => xs.length)) === 1, await T(p, '#p-pane-notes .hd'));
    eq('14 focus stays on the applied button', await p.evaluate(() => document.activeElement.textContent), '적용됨');
    ok('14 no page errors', errs.length === 0, errs);
    await ctx.close();
  }
  {
    const { p, errs, ctx } = await open(browser);
    /* 긴 교정: 조각마다 비교해 표시를 잃지 않음 (빈 줄 없는 6,800자) */
    await p.fill('#p-in', 'The laser was lock to the cavity. '.repeat(200).trim());
    await p.click('#p-run'); await settle(p);
    ok('14 long proofread keeps marks', /교정 완료 · 수정 200곳 · 2 조각/.test(await T(p, '#p-status')) && (await p.$$eval('#p-out .chg', xs => xs.length)) === 200, await T(p, '#p-status'));
    eq('14 duplicate note lines merged', await p.$$eval('#p-pane-notes .note', xs => xs.length), 2);
    /* 긴 글 점검: 문단 묶음으로 나눠 부름 */
    const para = 'The laser was lock to the cavity using PDH technique. '.repeat(36).trim();
    await p.fill('#p-in', [para, para, para, para].join('\n\n'));
    await p.click('#p-run'); await settle(p);
    const before = (await calls(p)).length;
    await p.click('#p-sidetab [data-v="review"]'); await settle(p);
    ok('14 long review runs in batches', (await calls(p)).length - before >= 2 && (await p.$$eval('#p-pane-review .note', xs => xs.length)) >= 2, (await calls(p)).length - before);
    /* 맥락·지시의 쉼표 든 숫자 */
    await p.click('#p-mode [data-v="para"]'); await p.fill('#p-in', EN); await p.fill('#p-note', '1,500자 이내');
    await p.click('#p-run'); await settle(p);
    ok('14 comma number in the limit', /must not exceed 1500 characters/.test(await p.evaluate(() => window.__calls[window.__calls.length - 1].input)) && /\/ 1,500 자/.test(await T(p, '#p-chips')), await T(p, '#p-chips'));
    await p.fill('#p-note', '이메일');
    ok('14 changed note marks the result stale', /입력·설정이 바뀜/.test(await T(p, '#p-chips')));
    await p.fill('#p-note', '1,500자 이내');
    /* 안마다 점검을 기억 */
    await p.click('#p-sidetab [data-v="review"]'); await settle(p);
    await p.click('#p-vers [data-v="1"]'); await wait(p);
    ok('14 other version: review pane offers a run button', (await p.$$eval('#p-pane-review button.main', xs => xs.length)) === 1 || await p.$eval('#p-pane-review', n => n.hidden));
    await p.click('#p-vers [data-v="0"]'); await p.click('#p-sidetab [data-v="review"]'); await settle(p);
    ok('14 back to first version: its review is still there', (await p.$$eval('#p-pane-review .note', xs => xs.length)) === 2);
    /* 다른 표현: 먼저 고르고 나서 탭을 열어도 보임, 키보드용 문장 고르기 */
    await p.click('#p-sidetab [data-v="notes"]');
    await p.evaluate(() => { const n = document.getElementById('p-out').firstChild, i = n.textContent.indexOf('the laser showed'); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 16); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
    await wait(p, 80);
    await p.click('#p-sidetab [data-v="alt"]');
    eq('14 selection made before opening the tab is shown', await T(p, '#p-pane-alt .quote'), 'the laser showed');
    await p.click('#p-pane-alt button.main'); await settle(p);
    await p.click('#p-pane-alt button.main'); await settle(p);
    ok('14 "three more" tells the model what was offered', /<already_offered>\n- ALT-ONE/.test(await p.evaluate(() => window.__calls[window.__calls.length - 1].input)));
    await p.evaluate(() => { window.__respond2 = window.__respond; });
    /* 탭 사이로 보낼 때 받는 쪽 초안을 되돌릴 수 있음 */
    await p.click('#tabbtn-translate'); await p.fill('#t-in', '아직 실행하지 않은 초안');
    await p.click('#tabbtn-polish'); await p.click('#p-send'); await wait(p);
    await p.click('#t-status-acts button'); await wait(p);
    eq('14 undo restores the draft that was replaced', await p.$eval('#t-in', t => t.value), '아직 실행하지 않은 초안');
    ok('14 no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  /* ---------- 13. 좁은 화면·어두운 테마: 가로 스크롤 없음 ---------- */
  for (const [name, w, dark] of [['phone-dark', 400, true], ['tablet', 900, false], ['desk', 1320, false]]) {
    const { p, errs, ctx } = await open(browser, { w, h: 800, dark });
    await p.fill('#p-in', EN + ' See https://doi.org/10.1364/OE.123456789012345678901234567890 and $\\frac{\\partial^2E}{\\partial z^2}-\\frac{1}{c^2}\\frac{\\partial^2E}{\\partial t^2}=\\mu_0\\frac{\\partial^2P}{\\partial t^2}$.');
    await p.click('#p-run'); await settle(p);
    await p.click('#p-sidetab [data-v="review"]'); await settle(p);
    for (const tab of ['polish', 'translate', 'terms', 'history']) {
      await p.click('#tabbtn-' + tab); await wait(p, 30);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      ok('13 ' + name + ' ' + tab + ' no horizontal scroll', sw <= w, sw);
      await p.screenshot({ path: path.join(OUTDIR, name + '-' + tab + '.png'), fullPage: w < 1000 });
    }
    await p.click('#tabbtn-polish');
    const over = await p.evaluate(() => ['p-out', 'p-side'].map(id => { const e = document.getElementById(id); return e.scrollWidth - e.clientWidth; }));
    ok('13 ' + name + ' long tokens wrap inside columns', over.every(x => x <= 1), over);
    ok('13 ' + name + ' no page errors', errs.length === 0, errs);
    await ctx.close();
  }

  await browser.close();
  console.log(pass + ' passed, ' + fail + ' failed' + (fail ? ' → ' + fails.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
