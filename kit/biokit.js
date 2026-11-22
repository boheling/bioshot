/* BioKit: plates, leader-line callouts and the workflow-stage strip for storyshot scenes.
   Pictures are written as <img class="bio-plate" src="assets/…"> in the scene's own markup, so the
   renderer waits for them; BioKit only places and animates what is already there.
   Every move is a fromTo on the scene's paused timeline: nothing here runs on a clock of its own. */
window.BioKit = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  /* document.getElementById(<scene id>) is null while a scene script runs; the root is found by class */
  const root = (id) => document.querySelector('.film[data-composition-id="' + id + '"]') || document.querySelector('.film');
  const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; parent.appendChild(e); return e; };
  const show = (tl, node, at, dur) => tl.fromTo(node, { opacity: 0 }, { opacity: 1, duration: dur == null ? 0.35 : dur, ease: 'power2.out' }, at);

  /* A slow push or drift on a plate: from and to are { x, y, scale } in px and factors. */
  function move(tl, node, from, to, at, dur, ease) {
    return tl.fromTo(node, from, Object.assign({ duration: dur, ease: ease || 'power1.inOut' }, to), at);
  }

  /* The film's stages along the top, the current one in ink: the viewer always knows where in the workflow they are. */
  function stages(r, names, now) {
    const bar = el('div', 'bio-stages', r);
    names.forEach((n, i) => {
      if (i) el('span', 'bio-stage-sep', bar, '›');
      el('span', 'bio-stage' + (i === now ? ' now' : ''), bar, n);
    });
    return bar;
  }

  /* A label joined to a point on a picture by a straight leader line with a dot at the picture's end.
     at: the point on the part; to: where the line meets the label; side: which side of `to` the words sit. */
  function callout(r, o) {
    let svg = r.querySelector('svg.bio-lines');
    if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'bio-lines'); svg.setAttribute('viewBox', '0 0 ' + r.dataset.width + ' ' + r.dataset.height); r.appendChild(svg); }
    const line = document.createElementNS(NS, 'path');
    line.setAttribute('class', 'bio-lead');
    line.setAttribute('d', 'M' + o.at[0] + ' ' + o.at[1] + 'L' + o.to[0] + ' ' + o.to[1]);
    line.setAttribute('pathLength', '1');
    line.style.strokeDasharray = '1';
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('class', 'bio-dot'); dot.setAttribute('cx', o.at[0]); dot.setAttribute('cy', o.at[1]); dot.setAttribute('r', 7);
    svg.appendChild(line); svg.appendChild(dot);
    const label = el('div', 'bio-label', r, o.text);
    const side = o.side || 'left';
    label.style.top = (o.to[1] - 22) + 'px';
    if (side === 'left') { label.style.right = (r.dataset.width - o.to[0] + 14) + 'px'; label.style.textAlign = 'right'; }
    else label.style.left = (o.to[0] + 14) + 'px';
    return {
      label: label, line: line,
      show: function (tl, at) {
        tl.fromTo(dot, { opacity: 0 }, { opacity: 1, duration: 0.15 }, at);
        tl.fromTo(line, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out', autoRound: false }, at);
        tl.fromTo(label, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, at + 0.3);
      },
    };
  }

  function lines(r) {
    let svg = r.querySelector('svg.bio-lines');
    if (!svg) { svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'bio-lines'); svg.setAttribute('viewBox', '0 0 ' + r.dataset.width + ' ' + r.dataset.height); r.appendChild(svg); }
    return svg;
  }
  const sv = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };

  /* Library preparation, drawn: one long double strand, cut into pieces, an adapter on both ends of each.
     o: { x, y, w, pieces }. It is a diagram of the idea, so it is drawn here and never generated. */
  function fragments(r, o) {
    const svg = lines(r), n = o.pieces || 5, pw = o.w / n, GAP = 46, TAG = 18, H = 18;
    const all = sv('g', {}, svg), parts = [], tags = [];
    for (let i = 0; i < n; i++) {
      const g = sv('g', {}, all), x0 = o.x + i * pw, x1 = x0 + pw;
      for (let x = x0 + 10; x < x1 - 4; x += 20) sv('line', { class: 'bio-rung', x1: x, y1: o.y - H / 2, x2: x, y2: o.y + H / 2 }, g);
      sv('path', { class: 'bio-strand', d: 'M' + x0 + ' ' + (o.y - H / 2) + 'H' + x1 + 'M' + x0 + ' ' + (o.y + H / 2) + 'H' + x1 }, g);
      const a = sv('rect', { class: 'bio-tag', x: x0 - TAG, y: o.y - 19, width: TAG, height: 38, rx: 4 }, g);
      const b = sv('rect', { class: 'bio-tag', x: x1, y: o.y - 19, width: TAG, height: 38, rx: 4 }, g);
      a.style.opacity = 0; b.style.opacity = 0;
      parts.push(g); tags.push(a, b);
    }
    all.style.opacity = 0;
    // o.scale enlarges the whole drawing from its left end; the points handed out below are where things end up on screen
    const k = o.scale || 1;
    if (k !== 1) all.setAttribute('transform', 'translate(' + o.x + ' ' + o.y + ') scale(' + k + ') translate(' + (-o.x) + ' ' + (-o.y) + ')');
    const on = function (x, dy) { return [o.x + (x - o.x) * k, o.y + dy * k]; };
    return {
      /* where the right-hand adapter of piece i ends up once the pieces are apart, and the top of piece i */
      tagAt: function (i) { return on(o.x + (i + 1) * pw + i * GAP + TAG / 2, 19); },
      pieceAt: function (i) { return on(o.x + (i + 0.5) * pw + i * GAP, -H / 2 - 3); },
      show: function (tl, at) { tl.fromTo(all, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, at); },
      cut: function (tl, at) { parts.forEach(function (g, i) { tl.fromTo(g, { x: 0 }, { x: i * GAP, duration: 0.6, ease: 'power3.out' }, at + i * 0.04); }); },
      tag: function (tl, at) { tags.forEach(function (t, i) { tl.fromTo(t, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, at + Math.floor(i / 2) * 0.08); }); },
    };
  }

  /* Four dyes, one per base. The assignment is this film's legend (the colours a chromatogram
     conventionally uses), not any maker's chemistry. */
  const DYES = [['A', '#22c55e'], ['C', '#3b82f6'], ['G', '#facc15'], ['T', '#ef4444']];
  const pick = function (seed, i, k) { let h = (seed * 73856093) ^ (i * 19349663) ^ (k * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) % 4; };

  /* The surface of a flow cell, drawn: a field of clusters on black. In each cycle every cluster takes
     exactly one of four colours, chosen by a hash of its position and the cycle, so a render repeats.
     o: { x, y, size, cols, rows, seed, focus: [col, row], cycles } */
  function clusters(r, o) {
    const win = el('div', 'bio-window', r);
    win.style.left = o.x + 'px'; win.style.top = o.y + 'px'; win.style.width = o.size + 'px'; win.style.height = o.size + 'px';
    const svg = sv('svg', { viewBox: '0 0 1000 1000' }, win);
    const defs = sv('defs', {}, svg), f = sv('filter', { id: 'bio-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    sv('feGaussianBlur', { stdDeviation: 9, result: 'b' }, f);
    const merge = sv('feMerge', {}, f); sv('feMergeNode', { in: 'b' }, merge); sv('feMergeNode', { in: 'SourceGraphic' }, merge);
    const g = sv('g', { filter: 'url(#bio-glow)' }, svg), dots = [];
    const cols = o.cols || 12, rows = o.rows || 12, step = 1000 / cols;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      // clusters do not sit on a perfect grid: each is nudged by its own hash
      const k = j * cols + i, dx = (pick(o.seed, k, 91) - 1.5) * step * 0.09, dy = (pick(o.seed, k, 92) - 1.5) * step * 0.09;
      dots.push(sv('circle', { cx: (i + 0.5) * step + dx, cy: (j + 0.5) * step + dy, r: step * 0.26, fill: '#39424c' }, g));
    }
    const fi = o.focus[1] * cols + o.focus[0], fd = dots[fi];
    const ring = sv('circle', { class: 'bio-ring', cx: fd.getAttribute('cx'), cy: fd.getAttribute('cy'), r: step * 0.46 }, svg);
    ring.style.opacity = 0;
    return {
      win: win, dyes: DYES,
      /* the letter the watched cluster shows in cycle k */
      read: function (k) { return DYES[pick(o.seed, fi, k)]; },
      focusAt: function () { return [o.x + (+fd.getAttribute('cx')) * o.size / 1000, o.y + (+fd.getAttribute('cy')) * o.size / 1000]; },
      watch: function (tl, at) { tl.fromTo(ring, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at); },
      /* cycle k: every cluster changes to its colour for that cycle */
      cycle: function (tl, k, at) {
        dots.forEach(function (d, i) {
          const from = k === 0 ? '#39424c' : DYES[pick(o.seed, i, k - 1)][1];
          tl.fromTo(d, { attr: { fill: from } }, { attr: { fill: DYES[pick(o.seed, i, k)][1] }, duration: 0.3, ease: 'power1.inOut', immediateRender: false }, at);
        });
      },
    };
  }

  /* The four dyes and their letters, on one line. */
  function legend(r, o) {
    const row = el('div', 'bio-legend', r);
    row.style.left = o.left + 'px'; row.style.top = o.top + 'px';
    DYES.forEach(function (d) { const s = el('span', '', row); const i = el('i', '', s); i.style.background = d[1]; el('em', '', s, d[0]).style.fontStyle = 'normal'; });
    return row;
  }

  /* The read so far: one dark chip per cycle, its letter in the colour that was seen. */
  function readout(r, o) {
    const row = el('div', 'bio-read', r);
    row.style.left = o.left + 'px'; row.style.top = o.top + 'px';
    const chips = o.letters.map(function (d) { const b = el('b', '', row, d[0]); b.style.color = d[1]; b.style.opacity = 0; return b; });
    return { row: row, add: function (tl, k, at) { tl.fromTo(chips[k], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, at); } };
  }

  /* One library piece: two strands with rungs and an adapter cap on each end. */
  function piece(parent, x, y, len) {
    const H = 18, TAG = 18, g = sv('g', {}, parent);
    for (let px = x + 10; px < x + len - 4; px += 20) sv('line', { class: 'bio-rung', x1: px, y1: y - H / 2, x2: px, y2: y + H / 2 }, g);
    sv('path', { class: 'bio-strand', d: 'M' + x + ' ' + (y - H / 2) + 'H' + (x + len) + 'M' + x + ' ' + (y + H / 2) + 'H' + (x + len) }, g);
    sv('rect', { class: 'bio-tag', x: x - TAG, y: y - 19, width: TAG, height: 38, rx: 4 }, g);
    sv('rect', { class: 'bio-tag', x: x + len, y: y - 19, width: TAG, height: 38, rx: 4 }, g);
    return g;
  }

  /* Hybrid capture, drawn: a field of library pieces that all look alike; probes settle on the few
     that match; a bead takes each probe by its handle; the rest is washed away and the kept pieces
     are gathered. o: { x, y, w, h, cols, rows, len, targets: [index…], seed } */
  function capture(r, o) {
    const svg = lines(r), cols = o.cols || 3, rows = o.rows || 5, len = o.len || 190;
    const items = [], kept = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = o.x + i * (o.w / cols) + (pick(o.seed, k, 3) - 1.5) * 9, y = o.y + j * (o.h / rows) + (pick(o.seed, k, 4) - 1.5) * 5;
      const g = sv('g', {}, svg);
      piece(g, x, y, len);
      const it = { g: g, x: x, y: y, target: o.targets.indexOf(k) >= 0 };
      if (it.target) {
        // the probe lies along the piece it matches; its handle sticks out to the right, where the bead takes it
        it.probe = sv('g', {}, g);
        sv('rect', { class: 'bio-probe', x: x + len / 2 - 50, y: y - 40, width: 100, height: 13, rx: 6 }, it.probe);
        sv('circle', { class: 'bio-probe', cx: x + len / 2 + 58, cy: y - 33.5, r: 7 }, it.probe);
        it.bead = sv('circle', { class: 'bio-bead', cx: x + len / 2 + 86, cy: y - 33.5, r: 22 }, g);
        it.probe.style.opacity = 0; it.bead.style.opacity = 0;
        kept.push(it);
      }
      g.style.opacity = 0;
      items.push(it);
    }
    return {
      probeAt: function (k) { const t = kept[k]; return [t.x + len / 2, t.y - 40]; },
      beadAt: function (k) { const t = kept[k]; return [t.x + len / 2 + 86, t.y - 33.5]; },
      show: function (tl, at) { items.forEach(function (it, i) { tl.fromTo(it.g, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, at + i * 0.03); }); },
      probes: function (tl, at) { kept.forEach(function (it, i) { tl.fromTo(it.probe, { opacity: 0, y: -46 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, at + i * 0.14); }); },
      beads: function (tl, at) { kept.forEach(function (it, i) { tl.fromTo(it.bead, { opacity: 0, scale: 0.2, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.6)' }, at + i * 0.12); }); },
      /* everything without a probe leaves to the left; what is held moves into one column */
      wash: function (tl, at) {
        items.filter(function (it) { return !it.target; }).forEach(function (it, i) { tl.fromTo(it.g, { x: 0, opacity: 1 }, { x: -520, opacity: 0, duration: 0.9, ease: 'power2.in', immediateRender: false }, at + i * 0.03); });
        const cx = o.x + o.w / 2 - len / 2, top = o.y + 20, gap = (o.h - 60) / Math.max(1, kept.length - 1);
        kept.forEach(function (it, i) { tl.fromTo(it.g, { x: 0, y: 0 }, { x: cx - it.x, y: top + i * gap - it.y, duration: 0.9, ease: 'power2.inOut', immediateRender: false }, at + 0.7); });
      },
    };
  }

  /* Reads lined up against a reference. One column is where some reads disagree: those reads show
     their own letter there on a dark chip, in that letter's dye colour. What is drawn is what is
     counted: `counts` comes from the same list as the picture.
     o: { x, y, cell, ref, col, alt, reads: [[start, length, saysAlt], …] } */
  function pileup(r, o) {
    const svg = lines(r), c = o.cell, dye = function (ch) { for (let i = 0; i < 4; i++) if (DYES[i][0] === ch) return DYES[i][1]; return '#fff'; };
    const ROW = 40, top = o.y + 64, bottom = top + o.reads.length * ROW;
    const band = sv('rect', { class: 'bio-band', x: o.x + o.col * c, y: o.y - 44, width: c, height: bottom - o.y + 44 }, svg);
    band.style.opacity = 0;
    const refG = sv('g', {}, svg), letters = [];
    for (let i = 0; i < o.ref.length; i++) {
      const cx = o.x + (i + 0.5) * c, isCol = i === o.col;
      if (isCol) sv('rect', { class: 'bio-chip', x: cx - c / 2 + 4, y: o.y - 28, width: c - 8, height: 56, rx: 8 }, refG);
      const t = sv('text', { class: 'bio-base', x: cx, y: o.y }, refG); t.textContent = o.ref[i];
      if (isCol) t.style.fill = dye(o.ref[i]);
      letters.push(t);
    }
    refG.style.opacity = 0;
    const bars = [], chips = [];
    let cover = 0, alt = 0;
    o.reads.forEach(function (rd, k) {
      const y = top + k * ROW, g = sv('g', {}, svg);
      sv('rect', { class: 'bio-readbar', x: o.x + rd[0] * c + 3, y: y, width: rd[1] * c - 6, height: 28, rx: 8 }, g);
      const covers = rd[0] <= o.col && o.col < rd[0] + rd[1];
      if (covers) cover++;
      if (covers && rd[2]) {
        alt++;
        const cg = sv('g', {}, g), cx = o.x + (o.col + 0.5) * c;
        sv('rect', { class: 'bio-chip', x: cx - c / 2 + 5, y: y - 3, width: c - 10, height: 34, rx: 6 }, cg);
        const t = sv('text', { class: 'bio-base bio-base-small', x: cx, y: y + 14 }, cg); t.textContent = o.alt; t.style.fill = dye(o.alt);
        cg.style.opacity = 0; chips.push(cg);
      }
      g.style.opacity = 0; bars.push(g);
    });
    // one read that disagrees somewhere else, alone: [read index, column, letter]
    let slip = null, slipAt = null;
    if (o.slip) {
      const y = top + o.slip[0] * ROW, cx = o.x + (o.slip[1] + 0.5) * c;
      slip = sv('g', {}, bars[o.slip[0]]);
      sv('rect', { class: 'bio-chip', x: cx - c / 2 + 5, y: y - 3, width: c - 10, height: 34, rx: 6 }, slip);
      const t = sv('text', { class: 'bio-base bio-base-small', x: cx, y: y + 14 }, slip); t.textContent = o.slip[2]; t.style.fill = dye(o.slip[2]);
      slip.style.opacity = 0; slipAt = [cx + c / 2 - 4, y + 14];
    }
    return {
      counts: { cover: cover, alt: alt },
      slipAt: function () { return slipAt; },
      slip: function (tl, at) { tl.fromTo(slip, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, at); },
      colAt: function () { return [o.x + (o.col + 0.5) * c, o.y - 44]; },
      ref: function (tl, at) { tl.fromTo(refG, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, at); },
      drop: function (tl, at, total) { bars.forEach(function (g, i) { tl.fromTo(g, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, at + i * (total / bars.length)); }); },
      mark: function (tl, at) {
        tl.fromTo(band, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, at);
        chips.forEach(function (cg, i) { tl.fromTo(cg, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, at + 0.2 + i * 0.1); });
      },
    };
  }

  /* A printed slip: a title and a few label/value rows that arrive one at a time. */
  function sheet(r, o) {
    const box = el('div', 'bio-sheet', r);
    box.style.left = o.left + 'px'; box.style.top = o.top + 'px'; box.style.width = o.width + 'px';
    el('h4', '', box, o.title);
    const rows = o.rows.map(function (kv) { const row = el('div', 'row', box); el('span', '', row, kv[0]); el('span', '', row, kv[1]); row.style.opacity = 0; return row; });
    return { box: box, row: function (tl, k, at) { tl.fromTo(rows[k], { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, at); } };
  }

  return { root: root, el: el, show: show, move: move, stages: stages, callout: callout, fragments: fragments, clusters: clusters, legend: legend, readout: readout, capture: capture, pileup: pileup, sheet: sheet };
})();
