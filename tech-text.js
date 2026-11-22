/* TechText: vanilla port of the React Bits "Tech Text" effect.
   Letter outlines, selection frame with specks, drag + spring, click kick and an idle sweep.
   Add data-tech="WORD" to any element; it reads font, size, weight and spacing from CSS.
   Colours come from --tt-ink / --tt-accent. */
(() => {
  const OPT = { dash: 4, gap: 2, stroke: 1.5, specks: 15, bounce: 0.4, sweep: true, drag: true, kick: true, labels: true };
  const SPRING = 320, KICK_DECAY = 0.62;
  const LABEL_FONT = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp01 = v => Math.min(1, Math.max(0, +v || 0));
  const approach = (c, t, dt, s) => c + (t - c) * (1 - Math.exp(-dt / s));
  const signed = v => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0');
  const noise = (...vals) => {
    let h = 2166136261;
    for (const v of vals) { h = Math.imul(h ^ (v | 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
    return (h >>> 0) / 4294967296;
  };

  function techText(host, text, opt = OPT) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const mctx = document.createElement('canvas').getContext('2d');
    if (!ctx || !mctx) return false;
    canvas.className = 'tt-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.append(canvas);
    host.style.width = 'max-content';
    /* tag position: a line stacked under another data-tech line puts its tag below the frame so it never covers the line above.
       Override with data-tech-label="above" or "below". */
    const labelBelow = host.dataset.techLabel
      ? host.dataset.techLabel === 'below'
      : Boolean(host.previousElementSibling && host.previousElementSibling.hasAttribute('data-tech'));

    let W = 1, H = 1, PAD = 0, dpr = 1, key = '', view = null, glyphs = [];
    let raf = 0, last = 0, visible = false, sizeDirty = true, placed = false;
    let dragging = -1, cursor = '', pulse = 0, clock = 0, lifted = false;
    const client = { x: 0, y: 0 };
    const kicks = [], press = { x: 0, y: 0, t: 0, i: -1 };
    const pointer = { x: 0, y: 0, inside: false }, grab = { x: 0, y: 0 }, lens = { x: 0, y: 0 };
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    const style = () => {
      const cs = getComputedStyle(host);
      return {
        size: parseFloat(cs.fontSize) || 100, family: cs.fontFamily, weight: cs.fontWeight,
        ls: parseFloat(cs.letterSpacing) || 0,
        ink: cs.getPropertyValue('--tt-ink').trim() || '#fff',
        accent: cs.getPropertyValue('--tt-accent').trim() || '#fff'
      };
    };
    const setFont = (c, st) => {
      c.font = `${st.weight} ${st.size}px ${st.family}`;
      if ('letterSpacing' in c) c.letterSpacing = `${st.ls}px`;
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    };

    const measure = () => {
      sizeDirty = false;
      PAD = Math.round(style().size * 0.3);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = host.clientWidth + PAD * 2;
      H = host.clientHeight + PAD * 2;
      canvas.style.cssText = `left:${-PAD}px;top:${-PAD}px;width:${W}px;height:${H}px;letter-spacing:normal;word-spacing:normal`;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      key = '';
    };

    const sprite = (g, st, dashed) => {
      const pad = Math.ceil(opt.stroke * 2 + 4);
      const left = g.box.x1 - pad, top = g.box.y1 - pad;
      const img = document.createElement('canvas');
      img.width = Math.max(1, Math.ceil((g.box.x2 - g.box.x1 + pad * 2) * dpr));
      img.height = Math.max(1, Math.ceil((g.box.y2 - g.box.y1 + pad * 2) * dpr));
      const c = img.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, st);
      if (dashed) {
        c.lineJoin = 'round';
        c.lineWidth = opt.stroke * 2;
        c.strokeStyle = st.ink;
        c.setLineDash([opt.dash, opt.gap]);
        c.strokeText(g.char, g.x, view.baseline);
        c.setLineDash([]);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000';
        c.fillText(g.char, g.x, view.baseline);
      } else {
        c.fillStyle = st.ink;
        c.fillText(g.char, g.x, view.baseline);
      }
      return { img, left, top };
    };

    const layout = () => {
      const st = style();
      const k = [text, st.size, st.family, st.weight, st.ls, st.ink, W, H, dpr].join('|');
      if (k === key) return st;
      key = k;
      setFont(mctx, st);
      const m = mctx.measureText(text);
      const x = PAD + m.actualBoundingBoxLeft;
      const inkH = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const baseline = PAD + (H - PAD * 2 - inkH) / 2 + m.actualBoundingBoxAscent;
      view = {
        baseline, left: PAD, right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent
      };
      const prev = glyphs;
      glyphs = [];
      let prefix = '';
      Array.from(text).forEach((ch, i) => {
        prefix += ch;
        const own = mctx.measureText(ch);
        const gx = x + mctx.measureText(prefix).width - own.width;
        if (!ch.trim()) return;
        const g = {
          char: ch, x: gx, index: i, outline: 0, offset: { x: 0, y: 0 }, velocity: { x: 0, y: 0 },
          box: {
            x1: gx - own.actualBoundingBoxLeft, y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight, y2: baseline + own.actualBoundingBoxDescent
          }
        };
        const kept = prev[glyphs.length];
        if (kept && kept.char === ch && kept.index === i) Object.assign(g, { offset: kept.offset, velocity: kept.velocity, outline: kept.outline });
        g.fill = sprite(g, st, false);
        g.dashes = sprite(g, st, true);
        glyphs.push(g);
      });
      if (dragging >= glyphs.length) dragging = -1;
      return st;
    };

    const glyphAt = (x, y) => {
      if (!view || y < view.top - 24 || y > view.bottom + 24) return -1;
      let best = -1, bd = 1e9;
      glyphs.forEach((g, i) => {
        const x1 = g.box.x1 + g.offset.x, x2 = g.box.x2 + g.offset.x;
        const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < bd) { bd = d; best = i; }
      });
      return bd < 28 ? best : -1;
    };

    const blit = (c, a, dx, dy, ox = 0, oy = 0) =>
      c.drawImage(a.img, Math.round((a.left + dx + ox) * dpr), Math.round((a.top + dy + oy) * dpr));

    /* Full-viewport overlay: displaced letters are drawn here so they can travel anywhere on the page
       instead of being clipped by this element's canvas. It exists only while a letter is away from home. */
    let over = null, octx = null;
    const ensureOverlay = () => {
      if (!over) {
        over = document.createElement('canvas');
        over.setAttribute('aria-hidden', 'true');
        over.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999;letter-spacing:normal;word-spacing:normal';
        document.body.append(over);
        octx = over.getContext('2d');
      }
      const w = Math.max(1, Math.round(over.clientWidth * dpr)), h = Math.max(1, Math.round(over.clientHeight * dpr));
      if (over.width !== w || over.height !== h) { over.width = w; over.height = h; }
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalAlpha = 1;
      octx.clearRect(0, 0, w, h);
      return octx;
    };
    const dropOverlay = () => { if (over) { over.remove(); over = null; octx = null; } };
    const crisp = v => (Math.round(v * dpr) + 0.5) / dpr;

    const perimeterPoint = (d, w, h) => {
      d = ((d % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
      if (d < w) return [frame.x1 + d, frame.y1, 0, -1];
      d -= w;
      if (d < h) return [frame.x2, frame.y1 + d, 1, 0];
      d -= h;
      if (d < w) return [frame.x2 - d, frame.y2, 0, 1];
      d -= w;
      return [frame.x1, frame.y2 - d, -1, 0];
    };

    const drawSpecks = (c, a, accent) => {
      const w = frame.x2 - frame.x1, h = frame.y2 - frame.y1;
      if (w < 2 || h < 2) return;
      const perimeter = 2 * (w + h), seed = frame.index + 1, grid = 3;
      c.fillStyle = c.strokeStyle = accent;
      for (let k = 0; k < opt.specks; k++) {
        const t = pulse / (0.5 + noise(seed, k, 11) * 1.2) + noise(seed, k, 17);
        const cycle = Math.floor(t), life = t - cycle;
        if (life > 0.7) continue;
        const [px, py, nx, ny] = perimeterPoint(noise(seed, k, cycle) * perimeter, w, h);
        const pick = noise(seed, k, cycle, 2);
        const size = pick < 0.46 ? 2 : pick < 0.7 ? 3 : pick < 0.84 ? 5 : pick < 0.94 ? 8 : 11;
        const large = size >= 8;
        const out = (large ? 9 : 4) + Math.floor(noise(seed, k, cycle, 1) * 5) * grid;
        const x = frame.x1 + Math.round((px + nx * out - frame.x1) / grid) * grid;
        const y = frame.y1 + Math.round((py + ny * out - frame.y1) / grid) * grid;
        const tone = noise(seed, k, cycle, 3);
        const blink = life < 0.06 || (life > 0.32 && life < 0.36) ? 0.35 : 1;
        c.globalAlpha = a * (large ? 0.3 + 0.4 * tone : 0.3 + 0.6 * tone) * blink;
        const left = Math.round(x - size / 2), top = Math.round(y - size / 2);
        if (tone < 0.26 || (large && tone < 0.78)) {
          c.strokeRect(left + 0.5, top + 0.5, size, size);
          if (large && tone > 0.5) c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
        } else c.fillRect(left, top, size, size);
      }
      for (let j = 0; j < 2; j++) {
        const head = (pulse * 0.42 + j * 0.5) * perimeter;
        for (let i = 0; i < 4; i++) {
          const [x, y] = perimeterPoint(head - i * 6, w, h);
          const size = i === 0 ? 3 : 2;
          c.globalAlpha = a * [0.95, 0.55, 0.32, 0.16][i];
          c.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
        }
      }
      c.globalAlpha = 1;
    };

    const drawFrame = (c, accent, ox, oy) => {
      const g = glyphs[frame.index];
      if (!g || frame.alpha < 0.01) return;
      const a = frame.alpha;
      const x1 = crisp(frame.x1), y1 = crisp(frame.y1), x2 = crisp(frame.x2), y2 = crisp(frame.y2);
      c.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
      c.fillStyle = c.strokeStyle = accent;
      c.lineWidth = 1;
      const moved = Math.hypot(g.offset.x, g.offset.y);
      if (moved > 1) {
        const hx = (g.box.x1 + g.box.x2) / 2, hy = (g.box.y1 + g.box.y2) / 2;
        c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + g.offset.x, hy + g.offset.y);
        c.setLineDash([3, 4]); c.globalAlpha = 0.45 * a; c.stroke(); c.setLineDash([]);
        c.beginPath(); c.rect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4); c.globalAlpha = 0.7 * a; c.fill();
      }
      c.beginPath(); c.rect(x1, y1, x2 - x1, y2 - y1); c.globalAlpha = 0.5 * a; c.stroke();
      c.beginPath();
      for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) c.rect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      c.globalAlpha = 0.95 * a; c.fill(); c.globalAlpha = 1;
      if (opt.specks > 0) drawSpecks(c, a, accent);
      if (!opt.labels) return;
      /* tag above the frame: "I  58 × 106" at rest, just the offset ("+120, −34") while a letter is moved */
      const text = moved > 1
        ? `${signed(Math.round(g.offset.x))}, ${signed(Math.round(-g.offset.y))}`
        : `${g.char}  ${Math.round(g.box.x2 - g.box.x1)} × ${Math.round(g.box.y2 - g.box.y1)}`;
      c.font = LABEL_FONT; c.textAlign = 'left'; c.textBaseline = 'middle';
      if ('letterSpacing' in c) c.letterSpacing = '0px';
      const tagW = Math.ceil(c.measureText(text).width) + 10, tagH = 16;
      const tx = Math.round(frame.x1), ty = labelBelow ? Math.round(frame.y2) + 4 : Math.round(frame.y1) - tagH - 4;
      c.globalAlpha = 0.95 * a; c.fillStyle = accent; c.fillRect(tx, ty, tagW, tagH);
      c.fillStyle = '#0e0e0e'; c.fillText(text, tx + 5, ty + tagH / 2 + 0.5);
      c.globalAlpha = 1;
    };

    const kick = index => {
      const strength = (view ? view.bottom - view.top : 100) * 11;
      kicks.push({ index, at: pulse, velocity: strength });
      for (let d = 1; d < glyphs.length; d++) {
        const velocity = strength * Math.pow(KICK_DECAY, d);
        if (velocity < 30) break;
        for (const j of [index - d, index + d]) if (j >= 0 && j < glyphs.length) kicks.push({ index: j, at: pulse + d * 0.055, velocity });
      }
      wake();
    };

    const tick = now => {
      raf = 0;
      if (sizeDirty) measure();
      if (dragging >= 0) {
        const r = canvas.getBoundingClientRect();
        pointer.x = client.x - r.left;
        pointer.y = client.y - r.top;
      }
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const st = layout();
      const damping = 2 * Math.sqrt(SPRING) * (1 - clamp01(opt.bounce) * 0.96);
      const sweeping = opt.sweep && !reduced && !pointer.inside && dragging < 0;
      if (sweeping) clock += dt;
      pulse += dt;
      let tx = pointer.x, ty = pointer.y;
      if (sweeping) {
        tx = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.45));
        ty = view.top + (view.bottom - view.top) * (0.45 + 0.1 * Math.sin(clock * 0.8));
      }
      const active = pointer.inside || sweeping || dragging >= 0;
      if (active && !placed) { lens.x = tx; lens.y = ty; }
      if (active) {
        const lag = pointer.inside ? 0.05 : 0.22;
        lens.x = approach(lens.x, tx, dt, lag);
        lens.y = approach(lens.y, ty, dt, lag);
      }
      placed = active;

      for (let k = kicks.length - 1; k >= 0; k--) {
        if (kicks[k].at > pulse) continue;
        const g = glyphs[kicks[k].index];
        if (g) g.velocity.y -= kicks[k].velocity;
        kicks.splice(k, 1);
      }
      let moving = false;
      glyphs.forEach((g, i) => {
        const { offset, velocity } = g;
        if (i === dragging) {
          offset.x = approach(offset.x, pointer.x - grab.x, dt, 0.03);
          offset.y = approach(offset.y, pointer.y - grab.y, dt, 0.03);
          velocity.x = velocity.y = 0;
          moving = true;
          return;
        }
        if (Math.abs(offset.x) < 0.05 && Math.abs(offset.y) < 0.05 && Math.hypot(velocity.x, velocity.y) < 0.5) {
          offset.x = offset.y = velocity.x = velocity.y = 0;
          return;
        }
        velocity.x += (-SPRING * offset.x - damping * velocity.x) * dt;
        velocity.y += (-SPRING * offset.y - damping * velocity.y) * dt;
        offset.x += velocity.x * dt;
        offset.y += velocity.y * dt;
        moving = true;
      });

      const focus = dragging >= 0 ? dragging : active ? glyphAt(lens.x, lens.y) : -1;
      if (focus >= 0) {
        const g = glyphs[focus];
        const b = [g.box.x1 + g.offset.x - 6, g.box.y1 + g.offset.y - 6, g.box.x2 + g.offset.x + 6, g.box.y2 + g.offset.y + 6];
        if (frame.index < 0 || frame.alpha < 0.02) [frame.x1, frame.y1, frame.x2, frame.y2] = b;
        const glide = focus === dragging ? 0.02 : 0.08;
        frame.x1 = approach(frame.x1, b[0], dt, glide);
        frame.y1 = approach(frame.y1, b[1], dt, glide);
        frame.x2 = approach(frame.x2, b[2], dt, glide);
        frame.y2 = approach(frame.y2, b[3], dt, glide);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 ? 1 : 0, dt, 0.1);
      const lift = frame.alpha > 0.02 ? '2' : '';
      if (host.style.zIndex !== lift) host.style.zIndex = lift; /* active line draws above its neighbour */
      glyphs.forEach((g, i) => {
        const target = i === focus && i !== dragging ? 1 : 0;
        g.outline = approach(g.outline, target, dt, 0.09);
        if (Math.abs(g.outline - target) > 0.002) moving = true; else g.outline = target;
      });

      const hovering = focus >= 0 && pointer.inside;
      const next = dragging >= 0 ? 'grabbing' : hovering && opt.drag ? 'grab' : hovering && opt.kick ? 'pointer' : '';
      if (next !== cursor) { cursor = next; host.style.cursor = next; }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const away = g => Math.hypot(g.offset.x, g.offset.y) > 0.5;
      let hi = null, ox = 0, oy = 0;
      if (dragging >= 0 || glyphs.some(away)) {
        const r = canvas.getBoundingClientRect();
        ox = r.left; oy = r.top;
        hi = ensureOverlay();
      } else dropOverlay();
      lifted = Boolean(hi);
      for (const g of glyphs) {
        const moved = Math.hypot(g.offset.x, g.offset.y);
        if (moved > 1) { ctx.globalAlpha = Math.min(1, moved / 24) * 0.55; blit(ctx, g.dashes, 0, 0); }
      }
      for (const g of glyphs) {
        const up = hi && away(g);
        const c = up ? hi : ctx, x = up ? ox : 0, y = up ? oy : 0;
        if (g.outline < 0.999) { c.globalAlpha = 1 - g.outline; blit(c, g.fill, g.offset.x, g.offset.y, x, y); }
        if (g.outline > 0.001) { c.globalAlpha = g.outline; blit(c, g.dashes, g.offset.x, g.offset.y, x, y); }
      }
      ctx.globalAlpha = 1;
      const fg = glyphs[frame.index];
      const frameUp = hi && fg && away(fg);
      drawFrame(frameUp ? hi : ctx, st.accent, frameUp ? ox : 0, frameUp ? oy : 0);

      const settling = moving || kicks.length > 0 || (frame.alpha > 0.01 && frame.alpha < 0.99);
      if ((active || settling) && (visible || lifted)) raf = requestAnimationFrame(tick);
    };

    function wake() {
      if (raf || (!visible && !lifted)) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }

    const locate = e => {
      const r = canvas.getBoundingClientRect();
      client.x = e.clientX;
      client.y = e.clientY;
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const near = () => dragging >= 0 || glyphAt(pointer.x, pointer.y) >= 0;
    host.addEventListener('pointermove', e => { locate(e); pointer.inside = near(); wake(); }, { passive: true });
    host.addEventListener('pointerenter', e => { locate(e); pointer.inside = near(); wake(); }, { passive: true });
    host.addEventListener('pointerleave', () => { if (dragging < 0) { pointer.inside = false; wake(); } }, { passive: true });
    host.addEventListener('pointerdown', e => {
      locate(e);
      pointer.inside = true;
      const i = e.pointerType !== 'mouse' || e.button === 0 ? glyphAt(pointer.x, pointer.y) : -1;
      Object.assign(press, { x: pointer.x, y: pointer.y, t: performance.now(), i });
      if (opt.drag && i >= 0) {
        dragging = i;
        grab.x = pointer.x - glyphs[i].offset.x;
        grab.y = pointer.y - glyphs[i].offset.y;
        host.setPointerCapture?.(e.pointerId);
      }
      wake();
    }, { passive: true });
    const up = e => {
      if (dragging >= 0) {
        dragging = -1;
        host.releasePointerCapture?.(e.pointerId);
        const r = host.getBoundingClientRect();
        pointer.inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      }
      if (e.type === 'pointerup' && press.i >= 0 && opt.kick && !reduced && performance.now() - press.t < 450) {
        const r = canvas.getBoundingClientRect();
        if (Math.hypot(e.clientX - r.left - press.x, e.clientY - r.top - press.y) < 6) kick(press.i);
      }
      press.i = -1;
      wake();
    };
    host.addEventListener('pointerup', up, { passive: true });
    host.addEventListener('pointercancel', up, { passive: true });
    host.addEventListener('lostpointercapture', up, { passive: true });

    new ResizeObserver(() => { sizeDirty = true; wake(); }).observe(host);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; wake(); }).observe(host);
    sizeDirty = true;
    wake();
    return true;
  }

  const start = () => document.querySelectorAll('[data-tech]').forEach(el => {
    if (techText(el, el.dataset.tech)) el.classList.add('tt-on');
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start); else start();
})();