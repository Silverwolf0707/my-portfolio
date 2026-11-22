/* AccordionGallery: vanilla port of the React/GSAP component. No dependencies: GSAP's tweens are
   replaced by CSS transitions (timing set through --ag-dur / --ag-ease / --ag-stagger).
   Markup: <div data-accordion><a href data-title data-meta data-desc><img src alt></a>...</div>
   Usage:  AccordionGallery(el, { defaultIndex, expandRatio, trigger:'hover'|'click', onChange(i, item) })
   Below 560px wide it switches itself to a vertical accordion. */
(() => {
  const EASES = {
    'power1.out': 'cubic-bezier(.25,.46,.45,.94)', 'power2.out': 'cubic-bezier(.215,.61,.355,1)',
    'power3.out': 'cubic-bezier(.165,.84,.44,1)', 'power4.out': 'cubic-bezier(.23,1,.32,1)'
  };
  const DEFAULTS = {
    defaultIndex: 2, accentColor: '#ffffff', overlayColor: '#060010', textColor: '#ffffff',
    height: 460, mobileHeight: 520, gap: 10, radius: 16, expandRatio: 0.52, orientation: 'horizontal',
    duration: 0.6, ease: 'power3.out', parallax: 0.5, tilt: 8, stagger: 0.06, trigger: 'hover',
    showLabels: true, grayscale: true, label: 'Image accordion gallery', onChange: null
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const el = (cls, parent, tag = 'span') => { const n = document.createElement(tag); n.className = cls; if (parent) parent.append(n); return n; };

  window.AccordionGallery = (root, options = {}) => {
    const o = { ...DEFAULTS, ...options };
    const items = [...root.children].map(a => {
      const img = a.querySelector('img');
      return {
        image: img?.currentSrc || img?.src || '', alt: img?.alt || '', link: a.getAttribute('href') || '',
        label: a.dataset.label || a.dataset.title || img?.alt || '', data: { ...a.dataset }
      };
    }).filter(i => i.image);
    const count = items.length;
    if (!count) return null;
    root.textContent = '';

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const narrow = matchMedia('(max-width:560px)');
    let active = clamp(o.defaultIndex, 0, count - 1);
    let vertical = o.orientation === 'vertical' || narrow.matches;
    let mediaSize = 320, disposed = false;

    root.classList.add('accordion-gallery');
    root.setAttribute('role', 'list');
    root.setAttribute('aria-label', o.label);
    const vars = {
      '--ag-accent': o.accentColor, '--ag-overlay': o.overlayColor, '--ag-text': o.textColor, '--ag-gap': `${o.gap}px`,
      '--ag-radius': `${o.radius}px`, '--ag-dur': reduced ? '0s' : `${o.duration}s`, '--ag-stagger': reduced ? '0s' : `${o.stagger}s`,
      '--ag-ease': EASES[o.ease] || o.ease
    };
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));

    const panels = items.map((item, i) => {
      const panel = el('ag-panel', root, item.link ? 'a' : 'div');
      if (item.link) panel.href = item.link;
      panel.setAttribute('role', 'listitem');
      panel.tabIndex = 0;
      panel.setAttribute('aria-label', item.label || `Item ${i + 1}`);
      panel.style.borderRadius = `${o.radius}px`;
      const frame = el('ag-panel__frame', panel);
      const media = el('ag-panel__media', frame);
      const img = el('', media, 'img');
      img.removeAttribute('class');
      img.src = item.image; img.alt = item.alt || item.label; img.draggable = false; img.decoding = 'async';
      el('ag-panel__overlay', frame).setAttribute('aria-hidden', 'true');
      el('ag-panel__dim', frame).setAttribute('aria-hidden', 'true');
      let bar = null, text = null;
      if (o.showLabels) {
        const label = el('ag-panel__label', panel);
        label.setAttribute('aria-hidden', 'true');
        bar = el('ag-panel__bar', label);
        text = el('ag-panel__text', label);
        text.textContent = item.label;
      }
      return { panel, media };
    });

    const layout = () => {
      const r = clamp(o.expandRatio, 0.2, 0.9);
      const grow = count > 1 ? (r * (count - 1)) / (1 - r) : 1;
      root.classList.toggle('accordion-gallery--vertical', vertical);
      root.style.height = vertical
        ? (typeof o.mobileHeight === 'number' ? `${o.mobileHeight}px` : o.mobileHeight)
        : (typeof o.height === 'number' ? `${o.height}px` : o.height);
      panels.forEach(({ panel, media }, i) => {
        const on = i === active;
        const rot = on ? 0 : i < active ? o.tilt : -o.tilt;
        panel.style.flexGrow = on ? grow : 1;
        panel.style.transform = vertical ? `rotateX(${-rot}deg)` : `rotateY(${rot}deg)`;
        panel.classList.toggle('ag-panel--active', on);
        if (on) panel.setAttribute('aria-current', 'true'); else panel.removeAttribute('aria-current');
        const drift = clamp(active - i, -1.5, 1.5);
        const shift = on ? 0 : drift * o.parallax * mediaSize * 0.06;
        media.style.transform = `translate(-50%,-50%) translate(${vertical ? 0 : shift}px,${vertical ? shift : 0}px)`;
        media.style.filter = `grayscale(${o.grayscale && !on ? 1 : 0})`;
      });
    };

    const measure = () => {
      const rect = root.getBoundingClientRect();
      const total = vertical ? rect.height : rect.width;
      const usable = Math.max(total - o.gap * (count - 1), 120);
      mediaSize = Math.max(140, usable * clamp(o.expandRatio, 0.2, 0.9) * 1.22);
      root.style.setProperty('--ag-media-size', `${mediaSize}px`);
      layout();
    };

    let notified = -1;
    const setActive = (i, notify = true) => {
      if (i === active && notified >= 0) return;
      active = i;
      layout();
      if (notify && notified !== i) { notified = i; o.onChange?.(i, items[i]); }
    };

    panels.forEach(({ panel }, i) => {
      panel.addEventListener('pointerenter', e => { if (o.trigger === 'hover' && e.pointerType === 'mouse') setActive(i); });
      panel.addEventListener('focus', () => setActive(i));
      panel.addEventListener('click', e => { if (i !== active) { e.preventDefault(); setActive(i); } });
      panel.addEventListener('keydown', e => {
        const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % count
          : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + count) % count : -1;
        if (next < 0) return;
        e.preventDefault();
        panels[next].panel.focus();
      });
    });

    const onNarrow = () => {
      vertical = o.orientation === 'vertical' || narrow.matches;
      measure();
    };
    narrow.addEventListener('change', onNarrow);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    measure();
    /* transitions only switch on after the first layout so nothing animates in from the default sizes */
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!disposed) root.classList.add('ag-ready'); }));
    notified = active;
    o.onChange?.(active, items[active]);

    return () => { disposed = true; ro.disconnect(); narrow.removeEventListener('change', onNarrow); };
  };
})();