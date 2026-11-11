Object.assign(global, require('../src/lib.js'));
const P = require('../src/prompts.js');
let pass = 0, fail = 0;
function eq(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log('FAIL', name, '\n  got ', g, '\n  want', w); } }
function ok(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info === undefined ? '' : JSON.stringify(info)); } }

// block / build
eq('block escapes closer', P.block('text', 'a </text> b'), '<text>\na </ text> b\n</text>');
const prompt = P.build('RULES', [P.block('author_note', 'n'), '', P.block('text', 'T')], 'FORMAT');
ok('build order', prompt.indexOf('RULES') < prompt.indexOf(P.GUARD) && prompt.indexOf(P.GUARD) < prompt.indexOf('<author_note>') && prompt.indexOf('<text>') < prompt.indexOf('FORMAT'));
ok('text is last block', prompt.lastIndexOf('</text>') > prompt.lastIndexOf('</author_note>'));

// reg
ok('reg ko standard has ending rule', /하다체/.test(P.reg('standard', 'ko', 'tr')));
ok('reg shorter para has length', /60–75/.test(P.reg('shorter', 'en', 'para')) && !/60–75/.test(P.reg('shorter', 'en', 'tr')));
ok('reg ja falls back + line', /である体/.test(P.reg('academic', 'ja', 'tr')));
ok('reg unknown style', P.reg('nope', 'en', 'para') === P.reg('standard', 'en', 'para'));

// prompts mention the right things
ok('fix en checklist', /articles \(a \/ an \/ the/.test(P.fixRules('en', 'standard')) && !/되\/돼/.test(P.fixRules('en', 'standard')));
ok('fix ko checklist', /되\/돼/.test(P.fixRules('ko', 'standard')) && /번역투/.test(P.fixRules('ko', 'deep')) && !/이중 피동/.test(P.fixRules('ko', 'light')));
ok('para 3 versions', /v3 — Freer/.test(P.paraRules('en', 'academic', 3, false)) && !/v3 — Freer/.test(P.paraRules('en', 'academic', 1, false)));
ok('para earlier', /earlier_versions/.test(P.paraRules('en', 'standard', 3, true)) && !/earlier_versions/.test(P.paraRules('en', 'standard', 3, false)));
ok('para naturalness first', /1\. Natural[\s\S]*2\. Same content[\s\S]*3\. Fixed terms[\s\S]*4\. Real rewording/.test(P.paraRules('en', 'standard', 1, false)));
ok('formatV', /<v3>/.test(P.formatV(3)) && !/<v2>/.test(P.formatV(1)));
ok('tr ko>en dir', /supply the subject/.test(P.trRules('ko', 'en', 'academic', false)) && /natural Korean order/.test(P.trRules('en', 'ko', 'standard', false)));
ok('tr previous', /<previous>/.test(P.trRules('ko', 'en', 'standard', true)) && !/<previous>/.test(P.trRules('ko', 'en', 'standard', false)));
ok('tr no rewrite command', !/Rewrite/.test(P.trRules('ko', 'en', 'standard', false)));
ok('review register', /intended register/.test(P.reviewRules('paraphrase', 'en', 'X')) && !/intended register/.test(P.reviewRules('proofread', 'en', '')));

// wordCap
eq('cap words ko', P.wordCap('초록 · 150단어 이내'), { n: 150, unit: 'w' });
eq('cap words en', P.wordCap('max 200 words'), { n: 200, unit: 'w' });
eq('cap chars', P.wordCap('2000자 이내'), { n: 2000, unit: 'c' });
eq('cap none', P.wordCap('Optics Letters 초록'), null);
eq('cap not 자리', P.wordCap('소수 10자리까지'), null);

// extras
let ex = P.extras('para', { note: '150단어 이내', around: 'ctx', gloss: [{ k: 'pair', a: '공진기', b: 'cavity' }], prefs: ['Use American spelling.'] });
eq('extras blocks', ex.blocks.map(b => /^<(\w+)>/.exec(b)[1]), ['author_note', 'surrounding', 'glossary', 'preferences']);
ok('extras cap rule', ex.rules.some(r => /must not exceed 150 words/.test(r)));
ex = P.extras('fix', { note: '150단어 이내', around: '', gloss: [], prefs: ['x'] });
ok('extras fix no cap, minimal edits', !ex.rules.some(r => /must not exceed/.test(r)) && ex.rules.some(r => /minimal edits/.test(r)));
ex = P.extras('review', { note: 'n', around: 'a', gloss: [{ k: 'keep', a: 'Yb:KGW' }], prefs: ['x'] });
eq('extras review only glossary', ex.blocks.length, 1);
ex = P.extras('tr', { note: '', around: 'a', gloss: [], prefs: [] });
eq('extras tr ignores around', ex.blocks.length, 0);
eq('withExtras none', P.withExtras('B', { rules: [], blocks: [] }), 'B');

// glossary
const g = P.parseGloss('# 메모\n공진기 = cavity\npulse width > pulse duration\n선폭\tlinewidth\n!very\nYb:KGW\n\n' + 'x'.repeat(70));
eq('gloss kinds', g.items.map(i => i.k), ['pair', 'prefer', 'pair', 'avoid', 'keep']); eq('gloss bad', g.bad, 1);
eq('gloss prefer', g.items[1], { k: 'prefer', a: 'pulse width', b: 'pulse duration' });
ok('hasTerm plural', P.hasTerm('Two cavities were built.', 'cavity'));
ok('hasTerm hyphen', P.hasTerm('a mode-locked laser', 'mode locking'));
ok('hasTerm ko spacing', P.hasTerm('이득매질을 사용하였다', '이득 매질'));
ok('hasTerm no false prefix', !P.hasTerm('the excavity', 'cavity'));
ok('hasTerm absent', !P.hasTerm('a ring resonator', 'cavity'));
eq('glossFor', P.glossFor(g.items, '공진기 길이를 조절하였다').map(i => i.a), ['공진기', 'pulse width', 'very']);
ok('glossLines', P.glossLines(g.items).length === 5 && /<->/.test(P.glossLines(g.items)[0]));
eq('glossCheck ok', P.glossCheck(g.items, '공진기 길이', 'the cavity length'), []);
eq('glossCheck miss', P.glossCheck(g.items, '공진기 길이', 'the resonator length').length, 1);
eq('glossCheck prefer', P.glossCheck(g.items, 'x', 'the pulse width is 100 fs').length, 1);
eq('glossCheck avoid', P.glossCheck(g.items, 'it is stable', 'it is very stable').length, 1);
eq('glossCheck avoid kept from input', P.glossCheck(g.items, 'it is very stable', 'it is very stable').length, 0);
eq('glossCheck keep', P.glossCheck(g.items, 'a Yb:KGW crystal', 'a Yb-doped KGW crystal').length, 1);
// rules
const rf = P.rulesFor('# off\nen: Use American spelling.\nko: 본문은 -다 체.\nSpace between number and unit.', 'en');
eq('rulesFor en', Array.from(rf), ['Use American spelling.', 'Space between number and unit.']);
eq('rulesFor ko', Array.from(P.rulesFor('en: A\nko: B\nC', 'ko')), ['B', 'C']);
ok('rulesFor cap', P.rulesFor(Array.from({ length: 20 }, (_, i) => 'rule ' + i).join('\n'), 'en').length === 12 && P.rulesFor(Array.from({ length: 20 }, (_, i) => 'rule ' + i).join('\n'), 'en').over === true);
eq('countRules', P.countRules('# a\nb\n\nc'), 2);

// readAnswer
let a = P.readAnswer('<result>\nHello.\n</result>\n<notes>\n- [관사] "a" → "the": 이유\n</notes>');
eq('answer', [a.text, a.notes, a.tagged, a.complete], ['Hello.', '- [관사] "a" → "the": 이유', true, true]);
a = P.readAnswer('<result>\nHel'); eq('answer streaming', [a.text, a.complete], ['Hel', false]);
a = P.readAnswer('<result>\nHello.\n</result>'); eq('answer no notes complete', a.complete, true);
a = P.readAnswer('Hello with --- inside\n---\nmore'); eq('answer untagged', [a.text, a.tagged, a.complete], ['Hello with --- inside\n---\nmore', false, false]);
a = P.readAnswer('```\nHello\n```'); eq('answer fenced', a.text, 'Hello');
a = P.readAnswer('Body text.\n<notes>\n- n\n</notes>'); eq('answer notes only', [a.text, a.notes, a.complete], ['Body text.', '- n', true]);
a = P.readAnswer('<result>\nline1\n---\nline2\n</result>\n<notes>x</notes>'); eq('answer keeps ---', a.text, 'line1\n---\nline2');
eq('liveText before tag', P.liveText('<res'), ''); eq('liveText short untagged', P.liveText('Sure, here'), '');
eq('liveText tagged', P.liveText('<result>\nab'), 'ab'); ok('liveText long untagged', P.liveText('x'.repeat(400)).length === 400);

// readVersions
let v = P.readVersions('<v1>\nOne.\n</v1>\n<why1>\n- [어휘] "a" → "b": c\n</why1>\n<v2>\nTwo');
eq('versions', v.map(x => [x.n, x.text, x.complete]), [[1, 'One.', true], [2, 'Two', false]]); eq('versions why', v[0].why, '- [어휘] "a" → "b": c');
eq('versions none', P.readVersions('thinking'), []);
v = P.readVersions('<v1>A</v1><why1>w</why1><v2>B</v2><why2>w2</why2><v3>C</v3><why3>w3</why3>'); eq('versions 3', v.map(x => x.text), ['A', 'B', 'C']);
v = P.readVersions('<v1>A</v1><why1>w</why1><v'); eq('versions partial tag hidden', v.length, 1);

// readIssues
let r = P.readIssues('<issue>\n<kind>수치</kind>\n<severity>high</severity>\n<quote>at 100 mW</quote>\n<fix>at 10 mW</fix>\n<why>원문은 10 mW</why>\n</issue>\n<issue><kind>어색</kind><severity>low</severity><quote>q2</quote><fix>f2</fix><why>w2</why></issue>\n<summary>총평입니다.</summary>');
eq('issues', r.items.map(i => [i.kind, i.sev, i.quote, i.fix]), [['수치', 'high', 'at 100 mW', 'at 10 mW'], ['어색', 'low', 'q2', 'f2']]); eq('issues summary', [r.summary, r.done], ['총평입니다.', true]);
r = P.readIssues('<issue><kind>어색</kind><severity>medium</severity><quote>q</quote><fix>f</fix><why>w</why></issue>\n<issue><kind>문법'); eq('issues streaming', [r.items.length, r.done], [1, false]);
r = P.readIssues('<summary>문제 없음</summary>'); eq('issues none', [r.items.length, r.done], [0, true]);
r = P.readIssues('<issue><kind>x</kind><severity>weird</severity><quote>q</quote><fix>f</fix><why>w</why></issue><summary>s'); eq('issues bad sev + open summary', [r.items[0].sev, r.done], ['medium', false]);

// readAlts
let al = P.readAlts('<a1>\nwas stabilized\n</a1>\n<w1>수동</w1>\n<a2>⟦we stabilized⟧</a2><w2>능동</w2><a3>partial');
eq('alts', al, [{ text: 'was stabilized', why: '수동' }, { text: 'we stabilized', why: '능동' }]);

// parseNote
eq('note full', P.parseNote('- [관사] "a laser" → "the laser": 앞에서 언급됨'), { tag: '관사', from: 'a laser', to: 'the laser', alt: '', why: '앞에서 언급됨' });
eq('note alt', P.parseNote('- [용어] "공진기" → "cavity" (대안: resonator): 분야 관용'), { tag: '용어', from: '공진기', to: 'cavity', alt: '(대안: resonator)', why: '분야 관용' });
eq('note interp', P.parseNote('- [해석] "측정하였다": 주어를 we 로 읽음'), { tag: '해석', from: '측정하였다', to: '', alt: '', why: '주어를 we 로 읽음' });
eq('note curly', P.parseNote('“was lock” → “was locked”: 과거분사'), { tag: '', from: 'was lock', to: 'was locked', alt: '', why: '과거분사' });
eq('note unquoted', P.parseNote('- lock → locked: 과거분사'), { tag: '', from: 'lock', to: 'locked', alt: '', why: '과거분사' });
eq('note plain', P.parseNote('- 고칠 곳이 없습니다.'), { tag: '', from: '', to: '', alt: '', why: '고칠 곳이 없습니다.' });
eq('note tag only', P.parseNote('- [관례] 주어를 we 로 통일'), { tag: '관례', from: '', to: '', alt: '', why: '주어를 we 로 통일' });
eq('note empty', P.parseNote('  '), null);

// mergeNotes
eq('merge drops none-lines', P.mergeNotes(['- 고칠 곳이 없습니다.', '- [관사] "a" → "the": x']), '- [관사] "a" → "the": x');
eq('merge all none', P.mergeNotes(['- 특기 사항 없음', '- 특기 사항 없음']), '- 특기 사항 없음');

// looksWrapped / unwrap
const pdf = 'We demonstrate a mode-locked fiber laser with a pulse dura-\ntion of 120 fs and a repetition rate of 80 MHz, which is stabi-\nlized by a piezo actuator. The measured linewidth of the comb\nlines is below 1 kHz over the full spectrum of the laser output\nand remains stable for hours.';
ok('wrapped pdf', P.looksWrapped(pdf)); ok('unwrap joins', /pulse duration of 120 fs/.test(P.unwrap(pdf)) && /stabilized by/.test(P.unwrap(pdf)) && !/\n/.test(P.unwrap(pdf)));
ok('not wrapped normal', !P.looksWrapped('First paragraph ends here.\n\nSecond paragraph ends here.\n\n- item one\n- item two'));
eq('unwrap keeps paragraphs and lists', P.unwrap('a b\nc d\n\ne f\n- x\n- y'), 'a b c d\n\ne f\n- x\n- y');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
