/* ===== 설명 칸: 바뀐 곳(번역 메모) · 점검 · 다른 표현 · 역번역 ===== */

function setSide(tab, v) {
  tab.side = v;
  pick($(tab.k + '-sidetab'), v);
  ['notes', 'review', 'alt', 'back'].forEach(function (n) {
    var p = $(tab.k + '-pane-' + n);
    if (p) p.hidden = n !== v;
  });
  if (v === 'alt') renderAlt(tab);
  $(tab.k + '-side').scrollTop = 0;
}
/* 스트리밍 중에는 머리줄(멈추기 버튼)을 다시 만들지 않음: 누르는 사이에 버튼이 갈리면 클릭이 사라지고 초점도 잃음 */
function paneKeep(pane, running) {
  var hd = pane.firstElementChild;
  if (running && hd && hd.getAttribute('data-run') === '1') { while (hd.nextSibling) pane.removeChild(hd.nextSibling); return true; }
  pane.textContent = '';
  return false;
}
function renderSide(tab) {
  keepFocus($(tab.k + '-pane-notes'), function () { renderNotes(tab); }); renderReview(tab); renderAlt(tab);
  if (tab.k === 't') renderBack(tab);
  if (tab.side === 'back' && !(tab.res && !tab.res.part && (tab.res.dst === 'ja' || tab.res.dst === 'zh'))) setSide(tab, 'notes');
}

/* ---------- 바뀐 곳과 이유 / 번역 메모 ---------- */
function noteLines(v) {
  return (v.notes || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
}
function integBox(ig) {
  var box = el('div', { class: 'box ' + (integBad(ig) ? 'bad' : 'warn') });
  box.appendChild(el('div', { class: 'label' }, '수치·수식·인용 대조'));
  function row(label, a, b) {
    if (a.length) box.appendChild(el('div', null, label + ': 원문의 ' + a.join(', ') + ' — 결과에 없음'));
    if (b.length) box.appendChild(el('div', null, label + ': 결과의 ' + b.join(', ') + ' — 원문에 없음'));
  }
  row('숫자', ig.missing.num, ig.added.num); row('수식', ig.missing.tex, ig.added.tex); row('인용', ig.missing.cite, ig.added.cite);
  box.appendChild(el('div', { class: 'meta' }, '단위를 환산했거나 숫자를 글로 쓴 경우에도 표시됩니다.'));
  return box;
}
function noteItem(tab, line) {
  var p = parseNote(line), li = el('li', { class: 'note' });
  if (!p) return li;
  var top = el('div');
  if (p.tag) { top.appendChild(chipEl(p.tag, p.tag === '확인' ? 'mid' : 'mute')); top.appendChild(document.createTextNode(' ')); }
  if (p.from) top.appendChild(el('del', null, p.from));
  if (p.to) { top.appendChild(el('span', { 'aria-hidden': 'true' }, ' → ')); top.appendChild(el('ins', null, p.to)); }
  if (p.alt) top.appendChild(el('span', { class: 'meta' }, ' ' + p.alt));
  if (p.tag || p.from || p.to) li.appendChild(top);
  if (p.why) li.appendChild(el('div', { class: (p.from || p.to) ? 'why' : '' }, p.why));
  if (p.to && curOut(tab).indexOf(p.to) >= 0) locatable(tab, li, function () { return p.to; });
  if (tab.k === 't' && p.tag === '용어' && p.from && p.to && wc(p.from) <= 6 && wc(p.to) <= 6 && glossSafe(p.from) && glossSafe(p.to)) {
    var acts = el('div', { class: 'acts' }), known = glossHas(p.from, p.to);
    var b = btnEl(known ? '용어집에 있음' : '+ 용어집', 'sm', function (e) {
      e.stopPropagation();
      addGlossPair(p.from, p.to);
      b.textContent = '용어집에 넣음'; b.disabled = true;
    }, '이 번역쌍을 용어집에 넣어 다음부터 항상 이렇게 옮기게 합니다');
    b.disabled = known;
    acts.appendChild(b); li.appendChild(acts);
  }
  return li;
}
/* 용어집 한 줄로 적어도 다르게 읽히지 않는 구절인지 (=, >, ->, 탭, 맨 앞 # ! 는 용어집 문법) */
function glossSafe(t) { return !/[=>→⇒\t]|->/.test(t) && !/^[#!]/.test(t.trim()); }
/* 카드에 마우스를 올리거나 초점을 주면 결과에서 그 구절을 표시, 누르면 그 자리로 스크롤 */
function locatable(tab, li, phraseFn) {
  li.classList.add('loc'); li.tabIndex = 0;
  function on() { return markPhrase(tab, phraseFn()); }
  function off() { unmark(tab); }
  li.addEventListener('mouseenter', on); li.addEventListener('mouseleave', off);
  li.addEventListener('focus', on); li.addEventListener('blur', off);
  li.addEventListener('click', function (e) {
    if (e.target.closest('button')) return;
    var m = on();
    if (m && m.scrollIntoView) m.scrollIntoView({ block: 'nearest' });
  });
}
function renderNotes(tab) {
  var k = tab.k, pane = $(k + '-pane-notes'), r = tab.res, nChip = $(k + '-notes-n');
  pane.textContent = '';
  if (!r) {
    pane.appendChild(el('div', { class: 'emptymsg' }, k === 'p' ? '실행하면 바뀐 곳과 이유가 여기에 뜹니다.' : '번역하면 용어 선택과 해석 메모가 여기에 뜹니다.'));
    nChip.hidden = true;
    return;
  }
  var v = r.versions[r.cur], out = v.out, hd = el('div', { class: 'hd' });
  hd.appendChild(el('span', { class: 'label' }, r.kind === 'tr' ? '번역 메모' : '바뀐 곳과 이유'));
  if (r.part) hd.appendChild(chipEl('미완성', 'mid'));
  if (r.kind === 'para' && !r.part) {
    hd.appendChild(chipEl(v.label, 'mute'));
    hd.appendChild(chipEl('원문 구절 재사용 ' + phrasePct(r.text, out, r.lang) + '%', 'mute', '결과의 세 단어 묶음 가운데 원문에도 그대로 있는 비율입니다. 용어와 숫자는 그대로여도 문장을 다시 지었으면 낮아집니다.'));
  }
  if (r.kind === 'fix' && r.ops && !r.part) {
    var ch = r.ops.filter(realChange), rej = ch.filter(function (o) { return o.rej; }).length;
    hd.appendChild(chipEl('수정 ' + ch.length + '곳' + (rej ? ' · ' + rej + '곳 되돌림' : ''), rej ? 'mid' : 'mute'));
    if (rej) hd.appendChild(btnEl('모두 다시 적용', 'sm', function () {
      r.ops.forEach(function (o) { if (o.a !== undefined) o.rej = false; });
      r.versions[r.cur].out = composeChanges(r.ops);
      if (tab.review) tab.review.stale = true;
      refresh(tab); queueSave(tab);
    }));
  }
  pane.appendChild(hd);
  if (!r.part) {
    var ig = integrity(r.text, out);
    if (!ig.ok) pane.appendChild(integBox(ig));
    var gc = glossCheck(glossItems, r.text, out);
    if (gc.length) {
      var gb = el('div', { class: 'box warn' });
      gb.appendChild(el('div', { class: 'label' }, '용어집 확인'));
      gc.forEach(function (m) { gb.appendChild(el('div', null, m)); });
      gb.appendChild(el('div', { class: 'meta' }, '활용형은 다 알아보지 못하므로 맞게 쓰였으면 무시하세요.'));
      pane.appendChild(gb);
    }
  }
  var lines = noteLines(v);
  if (lines.length) {
    var ul = el('ul', { class: 'notes' });
    lines.forEach(function (l) { ul.appendChild(noteItem(tab, l)); });
    pane.appendChild(ul);
  } else pane.appendChild(el('div', { class: 'msg' }, r.part ? '설명은 글이 끝까지 와야 나옵니다.' : '설명이 오지 않았습니다.'));
  var real = lines.filter(function (l) { return !/고칠 곳이 없습니다|특기 사항 없음|더 없습니다/.test(l); }).length;
  if (r.kind === 'fix' && r.ops && !r.part) real = r.ops.filter(realChange).length;      /* 교정은 머리줄의 '수정 N곳'과 같은 수 */
  nChip.hidden = !real; nChip.textContent = real;
}

/* ---------- 점검: 원문과 견준 뜻 보존 + 자연스러움 ---------- */
var SEVKO = { high: '중요', medium: '보통', low: '가벼움' }, SEVCLS = { high: 'no', medium: 'mid', low: 'mute' };
/* 구절이 글에 정확히 한 번 나오는 자리 {at, len}. 줄바꿈·공백 수만 다른 것은 같은 구절로 봄. 없거나 여러 번이면 null */
function findOnce(text, q) {
  if (!q) return null;
  var i = text.indexOf(q);
  if (i >= 0) return text.indexOf(q, i + 1) < 0 ? { at: i, len: q.length } : null;
  var words = q.trim().split(/\s+/);
  if (words.length < 2) return null;
  var re = new RegExp(words.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('\\s+'), 'g');
  var m = re.exec(text);
  if (!m) return null;
  var hit = { at: m.index, len: m[0].length };
  re.lastIndex = m.index + 1;
  return re.exec(text) ? null : hit;
}
function uniqueIn(text, q) { return !!findOnce(text, q); }
function reviewChips(rv) {
  var F = rv.items.filter(function (it) { return FIDELITY_KINDS.indexOf(it.kind) >= 0; });
  var N = rv.items.filter(function (it) { return FIDELITY_KINDS.indexOf(it.kind) < 0 && it.sev !== 'low'; });
  var hi = N.some(function (it) { return it.sev === 'high'; });
  var lowN = rv.items.length - F.length - N.length;
  return [
    F.length ? chipEl('의미 확인 ' + F.length + '건', 'no') : chipEl('의미 차이 못 찾음', 'ok'),
    !N.length ? (lowN ? chipEl('가벼운 손질 ' + lowN + '건', 'mute') : chipEl('어색한 곳 없음', 'ok')) : (N.length <= 3 && !hi ? chipEl('어색한 곳 ' + N.length + '건', 'mid') : chipEl('다시 손보기 권장', 'no'))
  ];
}
function renderReview(tab) { keepFocus($(tab.k + '-pane-review'), function () { drawReview(tab); }); }
function drawReview(tab) {
  var k = tab.k, pane = $(k + '-pane-review'), rv = tab.review, nChip = $(k + '-review-n');
  var kept = paneKeep(pane, !!rv && rv.running);
  if (!rv) {
    var r0 = tab.res;
    pane.appendChild(el('div', { class: 'emptymsg' }, '원문과 견주어 뜻이 달라진 곳과 어색한 곳을 찾습니다. Claude 호출이 한 번 더 나갑니다.'));
    if (r0 && !r0.part) {
      var go = btnEl('점검하기', 'main', function () { runReview(tab); });
      go.disabled = tab.job.busy || !!sampleOff;
      pane.appendChild(go);
    }
    nChip.hidden = true;
    return;
  }
  if (kept) { var pc = pane.firstElementChild.querySelector('.chip'); if (pc) pc.textContent = rv.progress || '읽는 중…'; }
  var hd = el('div', { class: 'hd' });
  hd.appendChild(el('span', { class: 'label' }, '의미·자연스러움 점검'));
  if (rv.running) {
    hd.setAttribute('data-run', '1');
    hd.appendChild(chipEl(rv.progress || '읽는 중…', 'ac'));
    hd.appendChild(btnEl('멈추기', 'sm', function () { stopJob(tab); }, 'Esc'));
  } else {
    if (rv.done) reviewChips(rv).forEach(function (c) { hd.appendChild(c); });
    if (rv.model) hd.appendChild(chipEl(rv.model.t, rv.model.c, rv.model.tip));
    hd.appendChild(el('span', { class: 'sp' }));
    var can = rv.items.filter(function (it) { return applicable(rv, it); });
    if (can.length > 1 && !rv.stale) {
      hd.appendChild(btnEl('모두 적용', 'sm', function () { rv.items.forEach(function (it) { it.on = applicable(rv, it); }); applyReview(tab); }));
    }
    if (rv.items.some(function (it) { return it.on; }) && !rv.stale) {
      hd.appendChild(btnEl('되돌리기', 'sm', function () { rv.items.forEach(function (it) { it.on = false; }); applyReview(tab); }, '적용한 것을 모두 풀고 점검할 때의 글로 돌아갑니다'));
    }
    hd.appendChild(btnEl('다시 점검', 'sm', function () { runReview(tab, true); }));
  }
  if (!kept) pane.appendChild(hd);
  if (rv.err) pane.appendChild(el('div', { class: 'msg err' }, rv.err));
  if (rv.stale && !rv.running) pane.appendChild(el('div', { class: 'msg' }, '점검한 뒤에 결과가 바뀌었습니다. 아래 목록은 바뀌기 전의 글에 대한 것이므로 「다시 점검」을 누르세요.'));
  if (rv.summary) pane.appendChild(el('div', null, rv.summary));
  if (rv.items.length) {
    var ul = el('ul', { class: 'notes' });
    rv.items.forEach(function (it) {
      var li = el('li', { class: 'note' }), top = el('div');
      top.appendChild(chipEl(SEVKO[it.sev], SEVCLS[it.sev])); top.appendChild(document.createTextNode(' '));
      if (it.kind) { top.appendChild(chipEl(it.kind, 'mute')); top.appendChild(document.createTextNode(' ')); }
      if (it.quote) top.appendChild(el('del', null, it.quote));
      if (it.fix) { top.appendChild(el('span', { 'aria-hidden': 'true' }, ' → ')); top.appendChild(el('ins', null, it.fix)); }
      li.appendChild(top);
      if (it.why) li.appendChild(el('div', { class: 'why' }, it.why));
      if (!rv.running) {
        var acts = el('div', { class: 'acts' });
        if (rv.stale) { /* 버튼 없음 */ }
        else if (applicable(rv, it)) {
          var b = btnEl(it.on ? '적용됨' : '적용', 'sm', function (e) {
            e.stopPropagation(); it.on = !it.on; applyReview(tab);
            var nb = pane.querySelectorAll('.note')[rv.items.indexOf(it)]; nb = nb && nb.querySelector('button');
            if (nb) nb.focus({ preventScroll: true });
            if (it.dead) say('다른 수정과 겹쳐 적용하지 못했습니다');
          }, it.on ? '누르면 이 수정을 풉니다' : '결과에서 이 구절을 바꿉니다');
          b.setAttribute('aria-pressed', it.on ? 'true' : 'false');
          acts.appendChild(b);
          if (it.dead) acts.appendChild(el('span', { class: 'meta' }, '켜 둔 다른 수정과 겹쳐 적용하지 못했습니다. 그 수정을 풀면 적용할 수 있습니다.'));
        } else acts.appendChild(el('span', { class: 'meta' }, !it.fix || it.fix === it.quote ? '바꿀 문구가 오지 않았습니다. 설명을 보고 직접 고치세요.' : rv.base.indexOf(it.quote) >= 0 ? '이 구절이 결과에 여러 번 나와 자동으로 바꾸지 못합니다. 직접 고치세요.' : '결과에서 이 구절을 찾지 못했습니다. 직접 고치세요.'));
        if (acts.childNodes.length) li.appendChild(acts);
        if (!rv.stale) locatable(tab, li, function () { if (it.on) return it.fix; var o = curOut(tab), h = findOnce(o, it.quote); return h ? o.substr(h.at, h.len) : it.quote; });
      }
      ul.appendChild(li);
    });
    pane.appendChild(ul);
  } else if (rv.done && !rv.err) pane.appendChild(el('div', { class: 'msg good' }, '고칠 곳을 찾지 못했습니다.'));
  var worst = rv.items.some(function (it) { return it.sev === 'high'; }) ? 'no' : rv.items.some(function (it) { return it.sev === 'medium'; }) ? 'mid' : 'mute';
  nChip.hidden = rv.running || (!rv.items.length && !rv.done);
  nChip.textContent = rv.items.length; nChip.className = 'chip ' + (rv.items.length ? worst : 'ok');
}
/* 긴 글은 문단 수가 같을 때 문단 묶음(원문+결과 12,000자 이하)으로 나눠 차례로 점검 */
function reviewPairs(src, cur) {
  if (cc(src) + cc(cur) <= 12000) return [{ src: src, out: cur }];
  var A = src.split(/\n{2,}/), B = cur.split(/\n{2,}/), out = [], a = '', b = '';
  if (A.length !== B.length) return null;
  A.forEach(function (p, i) {
    if (a && cc(a) + cc(b) + cc(p) + cc(B[i]) > 12000) { out.push({ src: a, out: b }); a = ''; b = ''; }
    a += (a ? '\n\n' : '') + p; b += (b ? '\n\n' : '') + B[i];
  });
  out.push({ src: a, out: b });
  return out.every(function (x) { return cc(x.src) + cc(x.out) <= 12000; }) ? out : null;
}
function applicable(rv, it) {
  return !!it.fix && it.fix !== it.quote && uniqueIn(rv.base, it.quote);
}
/* 켜 둔 수정들을 점검할 때의 글(base)에 차례로 적용해 결과 글을 다시 만듦 */
function applyReview(tab) {
  var rv = tab.review, t = rv.base;
  rv.items.forEach(function (it) { it.dead = false; });
  rv.items.forEach(function (it) {
    if (!it.on) return;
    var h = findOnce(t, it.quote);
    if (!h) { it.on = false; it.dead = true; return; }
    t = t.slice(0, h.at) + it.fix + t.slice(h.at + h.len);
  });
  setOutText(tab, t, 'review');
}
async function runReview(tab, fresh) {
  var r = tab.res;
  if (!r || r.part || tab.job.busy) return;
  var cur = curOut(tab), src = r.text;
  setSide(tab, 'review');
  var pairs = reviewPairs(src, cur);
  if (!pairs) {
    tab.review = { base: cur, items: [], summary: '', done: false, stale: false, running: false, err: '글이 길고 원문과 문단 수가 달라 나눠서 점검할 수 없습니다. 문단을 나눠 실행한 뒤 점검하세요.' };
    renderReview(tab);
    return;
  }
  var my = begin(tab, 'side');
  if (!my) return;
  var rv = tab.review = { base: cur, items: [], summary: '', done: false, stale: false, running: true, err: '', model: null, progress: '' };
  r.versions[r.cur].review = rv;            /* 안마다 따로 기억: 다른 안을 보고 돌아와도 남음 */
  renderReview(tab); sync(tab);
  var kind = r.kind === 'fix' ? 'proofread text' : r.kind === 'para' ? 'paraphrase' : 'translation';
  var regText = r.kind === 'fix' ? '' : reg(r.style, r.lang, r.kind === 'para' ? 'para' : 'tr');
  var ex = extras('review', { note: r.note, gloss: glossFor(glossItems, src + '\n' + cur), prefs: rulesFor(prefs.rules, r.lang) });
  var res, got = [], sums = [], whole = true;
  for (var i = 0; i < pairs.length && whole; i++) {
    var prompt = build(withExtras(reviewRules(kind, r.lang, regText), ex), ex.blocks.concat([block('source', pairs[i].src), block('result', pairs[i].out)]), FORMAT_REVIEW);
    if (pairs.length > 1) { rv.progress = (i + 1) + ' / ' + pairs.length + ' 묶음 점검 중'; renderReview(tab); }
    res = await ask(tab, prompt, { gen: my, fresh: !!fresh, onText: (function (before) { return function (raw) { var y = readIssues(raw); rv.items = before.concat(y.items); rv.summary = sums.concat(y.summary || []).join(' '); renderReview(tab); }; })(got) });
    if (my !== tab.job.gen) return;
    var x = res.text ? readIssues(res.text) : { items: [], summary: '', done: false };
    got = got.concat(x.items); if (x.summary) sums.push(x.summary);
    whole = res.ok && !res.truncated && x.done;
  }
  end(tab);
  rv.running = false;
  rv.items = got; rv.summary = sums.join(' '); rv.done = whole;
  if (res.ok) rv.model = res.model;
  if (!res.ok) rv.err = res.msg + (rv.items.length ? ' 아래는 그때까지 찾은 것입니다.' : '');
  else if (!rv.done) rv.err = rv.items.length ? '점검 답이 끝까지 오지 않았습니다. 아래는 그때까지 찾은 것입니다.' : '점검 답을 읽지 못했습니다. 「다시 점검」을 눌러 주세요.';
  if (curOut(tab) !== cur) rv.stale = true;
  renderReview(tab); sync(tab);
  say(rv.err ? rv.err : '점검을 마쳤습니다. ' + rv.items.length + '건');
}

/* ---------- 다른 표현: 결과에서 끌어 고른 구절의 대안 3개 ---------- */
function validSel(tab) {
  return tab.sel && tab.sel.of === curOut(tab) && isPlainView(tab) ? tab.sel : null;
}
function sameSel(a, b) { return !!a && !!b && a.at === b.at && a.len === b.len && a.of === b.of; }
function captureSelection() {
  var g = window.getSelection ? window.getSelection() : null;
  if (!g || !g.rangeCount || g.isCollapsed) return;
  [P, T].forEach(function (tab) {
    var box = tab.out, r = tab.res;
    if (!r || r.part || tab.job.busy || !box.contains(g.anchorNode) || !box.contains(g.focusNode)) return;
    if (!isPlainView(tab)) return;
    var rg = g.getRangeAt(0), pre = document.createRange();
    pre.selectNodeContents(box); pre.setEnd(rg.startContainer, rg.startOffset);
    var s = rg.toString(), at = pre.toString().length, lead = s.length - s.replace(/^\s+/, '').length;
    s = s.trim(); at += lead;
    var out = curOut(tab);
    if (!s || out.substr(at, s.length) !== s) return;
    if (s.length > 600) { tab.sel = null; tab.selMsg = '한 번에 600자까지 고를 수 있습니다 (지금 ' + fmt(s.length) + '자). 문장 단위로 골라 주세요.'; }
    else { tab.sel = { at: at, len: s.length, text: s, of: out }; tab.selMsg = ''; }
    if (tab.side === 'alt' && !(tab.alt && tab.alt.running)) renderAlt(tab);
  });
}
function sentencePicker(tab) {
  var out = curOut(tab), re = /[^.!?\u3002\uFF01\uFF1F\n]+[.!?\u3002\uFF01\uFF1F]*["')\]]*/g, m, spans = [];
  var sel = el('select', { class: 'lang', 'aria-label': '문장 고르기' });
  sel.appendChild(el('option', { value: '' }, '또는 문장을 골라서…'));
  while ((m = re.exec(out))) {
    var t = m[0].trim();
    if (!t || t.length > 600) continue;
    spans.push({ at: m.index + m[0].indexOf(t), len: t.length, text: t, of: out });
    sel.appendChild(el('option', { value: String(spans.length - 1) }, t.length > 60 ? t.slice(0, 60) + '…' : t));
  }
  if (!spans.length) return null;
  sel.onchange = function () { if (sel.value !== '') { tab.sel = spans[+sel.value]; tab.selMsg = ''; renderAlt(tab); } };
  return sel;
}
function renderAlt(tab) { keepFocus($(tab.k + '-pane-alt'), function () { drawAlt(tab); }); }
function drawAlt(tab) {
  var k = tab.k, pane = $(k + '-pane-alt'), r = tab.res, al = tab.alt;
  var kept = paneKeep(pane, !!r && !r.part && !!al && al.running);
  if (!r || r.part) {
    pane.appendChild(el('div', { class: 'emptymsg' }, '결과가 나오면, 그 안에서 구절이나 문장을 끌어서 고른 뒤 다른 표현 세 가지를 받을 수 있습니다.'));
    return;
  }
  var hd = el('div', { class: 'hd' });
  hd.appendChild(el('span', { class: 'label' }, '다른 표현'));
  if (al && al.running) { hd.setAttribute('data-run', '1'); hd.appendChild(chipEl('쓰는 중…', 'ac')); hd.appendChild(btnEl('멈추기', 'sm', function () { stopJob(tab); }, 'Esc')); }
  if (!kept) pane.appendChild(hd);
  if (!isPlainView(tab)) {
    pane.appendChild(el('div', { class: 'msg' }, r.kind === 'fix' ? '「깨끗한 글」 보기에서 구절을 고를 수 있습니다.' : '「' + (r.kind === 'tr' ? '번역문' : '새 글') + '」 보기에서 구절을 고를 수 있습니다.'));
    pane.appendChild(btnEl(r.kind === 'fix' ? '깨끗한 글로 보기' : '「' + (r.kind === 'tr' ? '번역문' : '새 글') + '」 보기로 바꾸기', '', function () {
      if (r.kind === 'fix') tab.vFix = 'clean'; else tab.vText = 'new';
      paint(tab); renderView(tab); renderAlt(tab); saveSettings();
    }));
    return;
  }
  var sel = validSel(tab), running = al && al.running, mine = !!al && !!al.sel && (running || sameSel(al.sel, sel));
  if (al && al.done) {
    pane.appendChild(el('div', { class: 'msg good' }, '바꿨습니다. 다른 구절을 고르면 이어서 할 수 있습니다.'));
    if (al.before != null && curOut(tab) === al.after) pane.appendChild(btnEl('되돌리기', 'sm', function () { var b = al.before; tab.alt = null; setOutText(tab, b, 'alt'); setSide(tab, 'alt'); }, '방금 바꾼 것을 되돌립니다'));
  }
  if (running) pane.appendChild(el('div', { class: 'quote' }, al.sel.text));
  else if (sel) {
    pane.appendChild(el('div', { class: 'quote' }, sel.text));
    var go = btnEl(mine && al.items.length ? '세 가지 더 받기' : '이 구절의 다른 표현 받기', 'main', function () { runAlt(tab); });
    go.disabled = tab.job.busy || !!sampleOff;
    pane.appendChild(go);
  } else {
    pane.appendChild(el('div', { class: 'emptymsg' }, tab.selMsg || '결과에서 바꾸고 싶은 구절이나 문장을 마우스로 끌어서 고르세요.'));
    var picker = sentencePicker(tab);          /* 마우스 없이도 쓸 수 있게: 문장 단위로 고르기 */
    if (picker) pane.appendChild(picker);
  }
  if (al && al.err) pane.appendChild(el('div', { class: 'msg err' }, al.err));
  if (mine && al.items.length) {                 /* 다른 구절을 고르면 앞 구절의 대안은 보이지 않음 */
    var live2 = al.sel.of === curOut(tab), ul = el('ul', { class: 'notes' });
    al.items.forEach(function (it) {
      var li = el('li', { class: 'note' });
      li.appendChild(el('div', null, it.text));
      if (it.why) li.appendChild(el('div', { class: 'why' }, it.why));
      if (!running && live2) {
        var acts = el('div', { class: 'acts' });
        acts.appendChild(btnEl('바꾸기', 'sm', function () {
          var s = al.sel, out = curOut(tab);
          if (s.of !== out) return;
          var after = out.slice(0, s.at) + it.text + out.slice(s.at + s.len);
          tab.alt = { done: true, items: [], sel: null, before: out, after: after };
          setOutText(tab, after, 'alt');
          setSide(tab, 'alt');
        }, '결과에서 고른 구절을 이 표현으로 바꿉니다'));
        li.appendChild(acts);
      }
      ul.appendChild(li);
    });
    pane.appendChild(ul);
  }
}
async function runAlt(tab) {
  var r = tab.res, sel = validSel(tab);
  if (!r || r.part || !sel || tab.job.busy) return;
  var my = begin(tab, 'side');
  if (!my) return;
  var out = sel.of, s = out.lastIndexOf('\n\n', sel.at), e = out.indexOf('\n\n', sel.at + sel.len);
  s = s < 0 ? 0 : s + 2; if (e < 0) e = out.length;
  if (sel.at - s > 1800) s = sel.at - 1800;
  if (e - (sel.at + sel.len) > 1800) e = sel.at + sel.len + 1800;
  var passage = out.slice(s, sel.at) + '⟦' + sel.text + '⟧' + out.slice(sel.at + sel.len, e);
  var was = tab.alt, seen = was && sameSel(was.sel, sel) ? (was.seen || []).concat(was.items.map(function (x) { return x.text; })) : [];   /* 같은 구절로 이미 받은 대안 */
  var al = tab.alt = { sel: sel, items: [], running: true, err: '', seen: seen };
  renderAlt(tab);
  var ex = extras('alt', { around: tab.k === 'p' ? $('p-around').value.trim().slice(0, 4000) : '', gloss: glossFor(glossItems, passage), prefs: rulesFor(prefs.rules, r.lang) });
  var rules = altRules(r.lang) + (seen.length ? ' The author has already seen the alternatives in <already_offered> and wants different ones: return none of them again, and do not offer a trivial variant of one.' : '');
  var prompt = build(withExtras(rules, ex), ex.blocks.concat([seen.length ? block('already_offered', seen.slice(-9).map(function (t) { return '- ' + t; }).join('\n')) : '', block('passage', passage)]), FORMAT_ALT);
  var res = await ask(tab, prompt, { gen: my, fresh: true, onText: function (raw) { al.items = readAlts(raw); renderAlt(tab); } });
  if (my !== tab.job.gen) return;
  end(tab);
  al.running = false;
  if (res.text) al.items = readAlts(res.text).filter(function (x) { return x.text !== sel.text && seen.indexOf(x.text) < 0; });
  if (!res.ok) al.err = res.msg;
  else if (!al.items.length) al.err = '대안을 받지 못했습니다. 다시 눌러 주세요.';
  renderAlt(tab); sync(tab);
}

/* ---------- 역번역 (번역 탭, 일본어·중국어 결과만) ---------- */
function renderBack(tab) { keepFocus($('t-pane-back'), function () { drawBack(tab); }); }
function drawBack(tab) {
  var pane = $('t-pane-back'), bk = tab.back, r = tab.res;
  var kept = paneKeep(pane, !!bk && bk.running);
  var hd = el('div', { class: 'hd' });
  hd.appendChild(el('span', { class: 'label' }, '역번역 (직역)'));
  if (bk && bk.running) { hd.setAttribute('data-run', '1'); hd.appendChild(chipEl('옮기는 중…', 'ac')); hd.appendChild(btnEl('멈추기', 'sm', function () { stopJob(tab); }, 'Esc')); }
  else if (r && !r.part) { hd.appendChild(el('span', { class: 'sp' })); hd.appendChild(btnEl(bk ? '다시 역번역' : '역번역하기', 'sm', function () { runBack(!!bk); })); }
  if (!kept) pane.appendChild(hd);
  if (!bk) { pane.appendChild(el('div', { class: 'emptymsg' }, '번역문을 한국어로 되도록 직역해, 읽을 수 없는 언어의 글이 실제로 무엇을 말하는지 확인합니다.')); return; }
  if (bk.err) pane.appendChild(el('div', { class: 'msg err' }, bk.err));
  if (bk.of !== curOut(tab) && !bk.running) pane.appendChild(el('div', { class: 'msg' }, '역번역한 뒤에 번역문이 바뀌었습니다.'));
  if (bk.text) pane.appendChild(el('div', { class: 'quote', lang: 'ko' }, bk.text));
}
async function runBack(fresh) {
  var tab = T, r = tab.res;
  if (!r || r.part || tab.job.busy) return;
  var my = begin(tab, 'side');
  if (!my) return;
  var cur = curOut(tab), bk = tab.back = { of: cur, text: '', running: true, err: '' };
  setSide(tab, 'back'); renderBack(tab);
  var res = await ask(tab, build(BACK_RULES, [block('text', cur)], FORMAT_BACK), { gen: my, fresh: !!fresh, onText: function (raw) { bk.text = liveText(raw); renderBack(tab); } });
  if (my !== tab.job.gen) return;
  end(tab);
  bk.running = false;
  if (res.text) bk.text = readAnswer(res.text).text;
  if (!res.ok) bk.err = res.msg; else if (res.truncated) bk.err = '답이 길이 제한에서 잘렸습니다.';
  renderBack(tab); sync(tab);
}
