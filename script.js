(() => {
  const header = document.querySelector('.site-header');
  const btn = header.querySelector('.menu-toggle');
  const setOpen = open => {
    header.toggleAttribute('data-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  btn.addEventListener('click', () => setOpen(!header.hasAttribute('data-open')));
  header.addEventListener('click', e => { if (e.target.closest('.nav__list a')) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  matchMedia('(min-width:1025px)').addEventListener('change', e => { if (e.matches) setOpen(false); });

  const grid = document.querySelector('.grid');
  [8, 36, 66.5].forEach(y => [4, 35, 65.5, 96].forEach(x => {
    const mark = document.createElement('i');
    mark.style.cssText = `--x:${x}%;--y:${y}%`;
    grid.append(mark);
  }));

  document.querySelectorAll('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  /* ASCII fade between the hero and the about section.
     'rise' + flip: the glow sits at the top (touching the hero) and burns out downward.
     If WebGL2 is unavailable GradientASCII returns null and the CSS gradient stays. */
  document.querySelectorAll('[data-ascii]').forEach(el => {
    window.GradientASCII?.(el, {
      colors: ['#b83a14', '#f2683c', '#ff9d6b', '#ffe3d1'],
      shape: 'rise',
      flip: true,
      characters: ' =+xX0S8#@',
      cellSize: 11,          // small characters
      density: 0.95,
      glyphOpacity: 1,
      glow: 0.45,
      gradientOpacity: 0.45,  // let the characters carry the transition
      flicker: 0.25,
      softness: 0.3,         // lower = glow reaches further down
      scale: 1,
      flow: 0.35,
      grain: 0.06,
      scrambleRadius: 0.1,
      clickEffect: 'wave',
      intro: true
    });
  });

  /* Holo-card carousel in the About section: reads the <img>s inside [data-carousel] and turns each into a HoloCard.
     fadeColor matches the section background so far-side cards sink into it.
     Try preset:'orbit' for cards that always face the viewer. */
  document.querySelectorAll('[data-carousel]').forEach(el => {
    window.CircularCarousel?.(el, {
      label: 'Card carousel',
      holo: { intensity: 0.85, edgeSparkle: 0.8, glare: 0.5, tiltMax: 12, hoverScale: 1.04 },
      preset: 'cylinder',
      intro: 'rise',
      cardWidth: 210,        // height follows the 63:88 card ratio
      gap: 30,
      tilt: -5,
      perspective: 2500,
      autoplay: 'drift',
      speed: 12,
      direction: 'left',
      momentum: 0.6,
      snap: true,
      pauseOnHover: true,
      focusOnClick: true,
      draggable: true,
      parallax: 0.3,
      stretch: 0.5,
      fadeColor: '#1c0502',
      depthFade: 0.55,
      cornerRadius: 14
    });
  });

  /* Projects: image accordion + a detail block that follows the open panel.
     Each <a> in [data-accordion] carries data-title / data-meta / data-desc and its href. */
  document.querySelectorAll('[data-accordion]').forEach(el => {
    const detail = document.querySelector('.projects__detail');
    const total = el.children.length;
    const field = k => detail?.querySelector(`[data-pd="${k}"]`);
    let first = true;
    window.AccordionGallery?.(el, {
      label: 'Projects',
      defaultIndex: 2,
      expandRatio: 0.52,
      trigger: 'hover',          // 'click' to open panels on click only
      accentColor: '#ffffff',
      overlayColor: '#1c0502',
      textColor: '#ffffff',
      grayscale: true,
      showLabels: true,
      duration: 0.6,
      ease: 'power3.out',
      parallax: 0.5,
      tilt: 8,
      stagger: 0.06,
      height: 'clamp(360px,36vw,500px)',
      gap: 10,
      radius: 16,
      orientation: 'horizontal',
      onChange: (i, item) => {
        if (!detail) return;
        const d = item.data;
        field('index').textContent = String(i + 1).padStart(2, '0');
        field('title').textContent = d.title || item.label;
        field('meta').textContent = d.meta || '';
        field('desc').textContent = d.desc || '';
        field('link').href = item.link || '#projects';
        if (first) { first = false; return; }
        detail.querySelectorAll('.projects__side,.projects__main').forEach(n => {
          n.classList.remove('is-swap'); void n.offsetWidth; n.classList.add('is-swap');
        });
      }
    });
  });
})();