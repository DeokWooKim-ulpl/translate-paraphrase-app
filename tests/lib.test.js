const L = require('../src/lib.js');
let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); }
}
function ok(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } }

// guessLang
eq('lang en', L.guessLang('The laser was locked to the cavity.'), 'en');
eq('lang ko', L.guessLang('레이저를 공진기에 잠갔다.'), 'ko');
eq('lang ko mixed', L.guessLang('PDH 방식으로 laser를 cavity에 lock하였다'), 'ko');
eq('lang ko dense latin', L.guessLang('Ti:sapphire oscillator의 carrier-envelope offset frequency를 f-2f interferometer로 측정함'), 'ko');
eq('lang ja', L.guessLang('レーザーを共振器にロックした。'), 'ja');
eq('lang zh', L.guessLang('激光被锁定到谐振腔。'), 'zh');
eq('lang empty', L.guessLang(''), 'en');
eq('lang en with one korean name', L.guessLang('We thank Dr. 김 for helpful discussions on the cavity design and the locking electronics.'), 'en');

// parseTagged
let p = L.parseTagged('<result>\nHello world.\n</result>\n<notes>\n- a → b: 이유\n</notes>', ['result', 'notes']);
eq('tag full result', p.result, 'Hello world.'); eq('tag full notes', p.notes, '- a → b: 이유'); eq('tag open none', p._open, '');
p = L.parseTagged('<result>\nHello wor', ['result', 'notes']);
eq('tag streaming', p.result, 'Hello wor'); eq('tag streaming open', p._open, 'result');
p = L.parseTagged('<result>\nHello world.\n</res', ['result', 'notes']);
eq('tag partial close stripped', p.result, 'Hello world.');
p = L.parseTagged('<result>\nHello world.\n</result>\n<no', ['result', 'notes']);
eq('tag partial open stripped', p.result, 'Hello world.'); eq('no notes yet', p.notes, undefined);
p = L.parseTagged('<result>a\n---\nb with $x<y$ math</result><notes>n</notes>', ['result', 'notes']);
eq('tag keeps --- and <', p.result, 'a\n---\nb with $x<y$ math');
p = L.parseTagged('<result>text ends with $a<', ['result', 'notes']);
ok('tag: lone < at end is hidden only transiently', p.result === 'text ends with $a', p.result);
p = L.parseTagged('<result>text $a<b$ more', ['result', 'notes']);
eq('tag: < inside text kept', p.result, 'text $a<b$ more');
p = L.parseTagged('No tags at all, just text.', ['result', 'notes']);
eq('tag none -> plain', p._plain, 'No tags at all, just text.'); eq('tag none any', p._any, false);
p = L.parseTagged('<result>A</result><notes>B', ['result', 'notes']);
eq('unclosed notes', p.notes, 'B'); eq('unclosed notes open', p._open, 'notes');
p = L.parseTagged('<result>A\n<notes>B</notes>', ['result', 'notes']);
eq('missing close result', p.result, 'A'); eq('missing close notes', p.notes, 'B');
p = L.parseTagged('<lang>Korean</lang>\n<result>번역</result>', ['lang', 'result', 'notes']);
eq('lang tag', p.lang, 'Korean'); eq('lang result', p.result, '번역');
p = L.parseTagged('<RESULT>X</RESULT>', ['result']);
eq('case-insensitive', p.result, 'X');
p = L.parseTagged('<c1>one</c1><n1>- x</n1><c2>two</c2><n2>- y</n2>', ['c1', 'n1', 'c2', 'n2', 'c3', 'n3']);
eq('candidates', [p.c1, p.n1, p.c2, p.n2, p.c3], ['one', '- x', 'two', '- y', undefined]);

// diff
function render(list) { return list.map(o => o.s !== undefined ? o.s : ((o.a ? '[-' + o.a + '-]' : '') + (o.b ? '[+' + o.b + '+]' : ''))).join(''); }
function sideA(list) { return list.map(o => o.s !== undefined ? o.s : o.a).join(''); }
function sideB(list) { return list.map(o => o.s !== undefined ? o.s : o.b).join(''); }
function both(name, a, b) { const d = L.diffChanges(a, b); ok(name + ' not null', d !== null); if (!d) return d; eq(name + ' rebuild b', sideB(d), b); eq(name + ' rebuild a', sideA(d), a); eq(name + ' compose', L.composeChanges(d), b); return d; }
eq('diff basic', render(both('basic', 'The laser was lock to the cavity.', 'The laser was locked to the cavity.')), 'The laser was [-lock-][+locked+] to the cavity.');
eq('diff same', render(both('same', 'same text', 'same text')), 'same text');
both('ws only', 'a  b', 'a b'); both('newline to space', 'a\nb c', 'a b c'); both('para merge', 'Alpha.\n\nBeta.', 'Alpha. Beta.');
eq('diff insert', render(both('insert', 'a c', 'a b c')), 'a [+b +]c');
eq('diff delete', render(both('delete', 'a b c', 'a c')), 'a [-b -]c');
both('empty a', '', 'x y'); both('empty b', 'x y', '');
eq('diff merge adjacent', render(both('merge', 'which reduce the noise significantly', 'which reduces noise significantly')), 'which [-reduce the-][+reduces+] noise significantly');
const a1 = 'We measure the linewidth of the laser using a delayed self-heterodyne setup, which give 1.2 kHz.';
const b1 = 'We measured the laser linewidth with a delayed self-heterodyne setup, which gives 1.2 kHz.';
both('sentence', a1, b1);
both('korean', '레이저를 공진기에 잠궜다. 그 결과 잡음이 줄었다.', '레이저를 공진기에 잠갔다. 그 결과 잡음이 감소하였다.');
// rejecting one change gives the original for that change only
const dr = L.diffChanges('The laser was lock to cavity.', 'The laser was locked to the cavity.');
dr.filter(o => o.a !== undefined)[0].rej = true;
eq('reject first change', L.composeChanges(dr), 'The laser was lock to the cavity.');
// big: 3000 words identical except one -> prefix/suffix trimming keeps it cheap
const big = Array.from({ length: 3000 }, (_, i) => 'w' + i).join(' ');
const big2 = big.replace('w1500', 'CHANGED');
const t0 = Date.now(); const bo = L.diffChanges(big, big2);
ok('diff big not null', bo !== null); ok('diff big fast', Date.now() - t0 < 500, Date.now() - t0);
eq('diff big rebuild', sideB(bo), big2);
// over cap -> null for the whole text, paragraph fallback works
const pa = Array.from({ length: 6 }, (_, k) => Array.from({ length: 1500 }, (_, i) => 'p' + k + 'w' + i).join(' ')).join('\n\n');
const pb = pa.replace(/w7\b/g, 'X7').replace(/w1400\b/g, 'Y1400');
ok('diff over cap null', L.diffRaw(pa, pb, 1e6) === null);
const lo = L.diffChanges(pa, pb, 1e7);
ok('diff long fallback', lo !== null && sideB(lo) === pb && sideA(lo) === pa);
// random property test
(function () { let seed = 7; function rnd(n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; }
  const words = ['the', 'laser', 'cavity', 'is', 'locked', 'to', 'a', 'mode', '\n\n', 'and', '  ', 'noise', '1.2', 'kHz', '\n'];
  let bad = 0; for (let k = 0; k < 300; k++) { const mk = () => Array.from({ length: rnd(14) }, () => words[rnd(words.length)]).join(' ');
    const x = mk(), y = mk(), d = L.diffChanges(x, y); if (!d || sideA(d) !== x || sideB(d) !== y) bad++; }
  eq('diff random property (300 cases)', bad, 0); })();

// chunkText
function rejoin(chunks, dst) { let s = ''; chunks.forEach((c, i) => { s += c.text + (i < chunks.length - 1 ? c.sep : ''); }); return s; }
const para = 'Sentence one is here. Sentence two is here! Is sentence three here? Yes.';
let ch = L.chunkText(para, 30);
ok('chunk sizes', ch.every(c => L.cc(c.text) <= 30), ch);
eq('chunk lossless', rejoin(ch), para);
const two = 'Para one line.\n\nPara two line.\n\n\nPara three.';
ch = L.chunkText(two, 20);
eq('chunk paras', ch.map(c => c.text), ['Para one line.', 'Para two line.', 'Para three.']);
eq('chunk para seps', ch.map(c => c.sep), ['\n\n', '\n\n\n', '']);
ch = L.chunkText(two, 1000);
eq('chunk single', ch.length, 1); eq('chunk single text', ch[0].text, two);
const ja = '最初の文です。二番目の文です。三番目の文です。四番目の文です。';
ch = L.chunkText(ja, 16);
ok('chunk ja split', ch.length >= 2 && ch.every(c => L.cc(c.text) <= 16), ch);
eq('chunk ja lossless', rejoin(ch), ja);
ok('chunk ja at sentence end', ch.slice(0, -1).every(c => /。$/.test(c.text)), ch);
const lines = 'item one\nitem two\nitem three\nitem four\nitem five';
ch = L.chunkText(lines, 20);
eq('chunk lines lossless', rejoin(ch), lines);
ok('chunk lines keep newline sep', ch.slice(0, -1).every(c => c.sep === '\n'), ch);
const nospace = 'x'.repeat(95);
ch = L.chunkText(nospace, 30);
eq('chunk nospace lossless', rejoin(ch), nospace); ok('chunk nospace sizes', ch.every(c => L.cc(c.text) <= 30));
const koLong = '레이저 주파수를 안정화하였다. 공진기 길이를 제어하였다. 잡음을 측정하였다. 결과를 분석하였다.';
ch = L.chunkText(koLong, 25);
eq('chunk ko lossless', rejoin(ch), koLong);
eq('joinSep para', L.joinSep('\n\n', 'en'), '\n\n'); eq('joinSep line', L.joinSep('\n', 'en'), '\n');
eq('joinSep space en', L.joinSep(' ', 'en'), ' '); eq('joinSep none ja', L.joinSep('', 'ja'), ''); eq('joinSep none ko', L.joinSep('', 'ko'), ' ');
// surrogate pairs do not break
const emo = '😀'.repeat(50);
ch = L.chunkText(emo, 20); eq('chunk emoji lossless', rejoin(ch), emo);

// integrity
let r = L.integrity('The linewidth is 1.2 kHz at 1,550 nm [3], see $\\Delta\\nu = 1/(2\\pi\\tau)$.', 'At 1550 nm the linewidth is 1.2 kHz [3]; see $\\Delta\\nu=1/(2\\pi\\tau)$.');
ok('integrity ok', r.ok, r); eq('integrity counts', r.counts, { num: 2, tex: 1, cite: 1 });
r = L.integrity('We used 3 mirrors and 10 mW [1,2].', 'We used three mirrors and 100 mW [1].');
eq('integrity missing num', r.missing.num, ['3', '10']); eq('integrity added num', r.added.num, ['100']);
eq('integrity missing cite (one number at a time)', r.missing.cite, ['[2]']); eq('integrity added cite', r.added.cite, []); ok('integrity not ok', !r.ok);
r = L.integrity('그림 2에서 파장은 1064 nm이다 [12–14].', 'In Fig. 2 the wavelength is 1064 nm [12-14].');
ok('integrity ko->en', r.ok, r);
r = L.integrity('no facts here', 'still none');
ok('integrity empty ok', r.ok && r.total === 0);
r = L.integrity('$a<b$ and $$E=mc^2$$', '$a<b$ only');
eq('integrity tex missing', r.missing.tex, ['$$E=mc^2$$']);

// overlap
ok('overlap en identical', L.overlapPct('the laser is locked to the cavity', 'the laser is locked to the cavity', 'en') === 100);
ok('overlap en stopwords ignored', L.overlapPct('the cat of the house in the garden', 'the dog of the street in the city', 'en') === 0);
const o1 = L.overlapPct('레이저를 공진기에 잠갔다', '레이저는 공진기로 잠갔다', 'ko');
ok('overlap ko particles weigh little', o1 >= 60, o1);
ok('overlap empty', L.overlapPct('abc', '', 'en') === 0);

// clipRecord
const recBig = { tool: 'x', input: '가'.repeat(60000), output: '나'.repeat(60000), notes: 'n' };
const cl = L.clipRecord(recBig, 200000);
ok('clip under cap', L.bytes(JSON.stringify(cl)) <= 200000 && cl.clipped === true);
const recSmall = { tool: 'x', input: 'a', output: 'b' };
ok('clip untouched', L.clipRecord(recSmall) === recSmall);

// when
ok('when local', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(L.when('2026-11-11T01:30:00.000Z')));
eq('when bad', L.when('nope'), '');

// ---- 2.0.1: 검증에서 나온 것 ----
// parseTagged: 닫힌 블록 안의 닮은 태그는 글로 두고, 다시 연 태그는 뒤의 것을 씀
p = L.parseTagged('<v2>\n<text_placeholder>\n</v2>\n\nCorrection.\n<v2>\nReal version two.\n</v2>', ['v1', 'why1', 'v2', 'why2']);
eq('tag reopened: later wins', p.v2, 'Real version two.');
p = L.parseTagged('<result>In XML the <notes> element holds remarks.</result><notes>- n</notes>', ['result', 'notes']);
eq('tag look-alike inside closed block', [p.result, p.notes], ['In XML the <notes> element holds remarks.', '- n']);
// 수치 대조: 부호, 만·억, 인용 묶음 바꾸기
ok('integrity sign dropped', !L.integrity('a GDD of -500 fs^2', 'a GDD of 500 fs^2').ok);
ok('integrity exponent sign', !L.integrity('a loss of 1.2 × 10^{-3} per pass', 'a loss of 1.2 × 10^{3} per pass').ok);
ok('integrity range is not a sign', L.integrity('from 10–20 nm with a 3-dB bandwidth', 'a 3-dB bandwidth from 10–20 nm').ok);
ok('integrity 3만 = 30,000', L.integrity('약 3만 개의 펄스를 평균하였다', 'we averaged about 30,000 pulses').ok, L.integrity('약 3만 개의 펄스를 평균하였다', 'we averaged about 30,000 pulses'));
ok('integrity regrouped citations', L.integrity('shown in [3], [4] and [5–7]', 'shown in [3, 4] and [5, 6, 7]').ok);
// 긴 글 나누기: 약어 뒤에서 자르지 않고 문장 끝을 줄 끝보다 먼저
const abbr = 'We follow the method of Kim et al. [8] as shown in Fig. 3 and Eq. (4) of Ref. [7], i.e., the standard one. '.repeat(12);
ok('chunk never cuts after an abbreviation', L.chunkText(abbr, 300).slice(0, -1).every(c => !/(et al|Fig|Eq|Ref|i\.e)\.$/.test(c.text)), L.chunkText(abbr, 300).map(c => c.text.slice(-12)));
const wrapped = ('The oscillator delivers pulses that are stretched before amplification in the\nregenerative amplifier [12]. ').repeat(20);
ok('chunk prefers sentence ends over line ends', L.chunkText(wrapped, 400).slice(0, -1).every(c => /\[12\]\.$/.test(c.text)), L.chunkText(wrapped, 400).map(c => c.text.slice(-14)));
eq('chunk wrapped lossless', (() => { const ch = L.chunkText(wrapped, 400); let s = ''; ch.forEach((c, i) => { s += c.text + (i < ch.length - 1 ? c.sep : ''); }); return s; })(), wrapped);
// 언어 추정: 수식 속 영문자는 세지 않음
eq('lang ko with LaTeX', L.guessLang('여기서 $E(t) = A(t) \\exp\\left(i \\omega_0 t + i \\phi(t)\\right)$, $A(t) = A_0\\,\\mathrm{sech}(t/\\tau)$ 이다.'), 'ko');
// 구절 재사용률
ok('phrase reuse identical', L.phrasePct('the laser was locked to the cavity', 'the laser was locked to the cavity', 'en') === 100);
ok('phrase reuse low after restructuring', L.phrasePct('the laser was locked to the cavity using the PDH technique', 'using the PDH technique, we locked the laser to the cavity', 'en') < 50);
// 기록 줄이기: 안이 여럿이면 고르지 않은 안부터 덜어 냄
const recV = { kind: 'para', input: '가'.repeat(8000), output: '나'.repeat(8000), sel: 8, versions: Array.from({ length: 9 }, (_, i) => ({ label: 'v' + i, text: String(i).repeat(1) + '다'.repeat(8000), why: '' })) };
const cv = L.clipRecord(recV, 200000);
ok('clip drops unselected versions first', L.bytes(JSON.stringify(cv)) <= 200000 && cv.input.length === 8000 && cv.versions[cv.sel].label === 'v8' && cv.versions.length < 9, [cv.versions.length, cv.sel, cv.input.length]);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
