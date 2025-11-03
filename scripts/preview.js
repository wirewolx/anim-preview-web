function initPreview(sel) {
  const el = {
    imgFile:   $(sel.imgFile),
    jsonFile:  $(sel.jsonFile),
    bgImg:     $(sel.bgImg),
    stage:     $(sel.stage),
    host:      $(sel.animHost),
    start:     $(sel.startBtn),
    stop:      $(sel.stopBtn),
    loop:      $(sel.loopToggle),
    opacity:   $(sel.opacityRange),
    statusEl:  $(sel.statusEl),
    handles:   $$(sel.handles),
  };

  let anim = null;
  let data = null;

  const toggleHandles = (show) => el.handles.forEach(h => h.style.display = show ? 'block' : 'none');
  toggleHandles(false);

  // Фон
  el.imgFile.addEventListener('change', (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    el.bgImg.src = URL.createObjectURL(f);
    el.statusEl.textContent = 'Скрин установлен как фон 1440×800.';
  });

  // Lottie
  el.jsonFile.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    el.statusEl.textContent = 'Чтение Lottie...';
    try {
      data = JSON.parse(await f.text());
      mount();
      el.start.disabled = false; el.stop.disabled = false;
      el.statusEl.textContent = 'Lottie загружен. Кликните по анимации, чтобы показать ручки.';
    } catch (err) {
      console.error(err);
      el.statusEl.textContent = 'Не удалось прочитать JSON';
    }
  });

  function mount() {
    if (anim) { try { anim.destroy(); } catch {} anim = null; }
    el.host.querySelectorAll('svg,canvas').forEach(n => n.remove());
    el.host.style.display = 'block';
    anim = lottie.loadAnimation({ container: el.host, renderer: 'svg', loop: el.loop.checked, autoplay: false, animationData: data });
    anim.addEventListener('DOMLoaded', () => {
      const svg = el.host.querySelector('svg'); if (svg) svg.style.pointerEvents = 'none';
      anim.goToAndStop(0, true);
    });
  }

  // Показ/скрытие ручек
  el.host.addEventListener('pointerdown', (e) => { if (!e.target.closest('.handle')) toggleHandles(true); });
  document.addEventListener('pointerdown', (e) => { if (!el.host.contains(e.target)) toggleHandles(false); });

  // Перетаскивание
  (function(){
    let dragging = false, dx = 0, dy = 0;
    el.host.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.handle')) return;
      dragging = true;
      const r = el.host.getBoundingClientRect();
      const s = el.stage.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      el.host.setPointerCapture(e.pointerId);
    });
    el.host.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const s = el.stage.getBoundingClientRect();
      const x = e.clientX - s.left - dx;
      const y = e.clientY - s.top  - dy;
      el.host.style.left = clamp(x, 0, s.width  - el.host.offsetWidth)  + 'px';
      el.host.style.top  = clamp(y, 0, s.height - el.host.offsetHeight) + 'px';
    });
    el.host.addEventListener('pointerup', (e) => { dragging = false; el.host.releasePointerCapture(e.pointerId); });
  })();

  // Ресайз
  (function(){
    let resizing = false, start = {x:0,y:0}, box = {l:0,t:0,w:0,h:0}, dir = '';
    el.handles.forEach(h => {
      h.addEventListener('pointerdown', (e) => {
        resizing = true;
        dir = [...h.classList].find(c => ['nw','ne','sw','se'].includes(c));
        const r = el.host.getBoundingClientRect();
        const s = el.stage.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY };
        box = { l: r.left - s.left, t: r.top - s.top, w: r.width, h: r.height };
        h.setPointerCapture(e.pointerId);
      });
      h.addEventListener('pointermove', (e) => {
        if (!resizing) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        let l = box.l, t = box.t, w = box.w, h = box.h;
        if (dir === 'se') { w = box.w + dx; h = box.h + dy; }
        if (dir === 'sw') { w = box.w - dx; h = box.h + dy; l = box.l + dx; }
        if (dir === 'ne') { w = box.w + dx; h = box.h - dy; t = box.t + dy; }
        if (dir === 'nw') { w = box.w - dx; h = box.h - dy; l = box.l + dx; t = box.t + dy; }
        w = Math.max(24, w); h = Math.max(24, h);
        const s = el.stage.getBoundingClientRect();
        l = clamp(l, 0, s.width  - w);
        t = clamp(t, 0, s.height - h);
        Object.assign(el.host.style, { left: l+'px', top: t+'px', width: w+'px', height: h+'px' });
        if (anim) anim.resize();
      });
      h.addEventListener('pointerup', (e) => { resizing = false; h.releasePointerCapture(e.pointerId); });
    });
  })();

  // Controls
  el.opacity.addEventListener('input', () => { el.host.style.opacity = (+el.opacity.value) / 100; });
  el.loop.addEventListener('change', () => { if (anim) anim.loop = el.loop.checked; });
  el.start.addEventListener('click', () => { if (anim) { anim.loop = el.loop.checked; anim.play(); el.statusEl.textContent = 'Воспроизведение'; } });
  el.stop.addEventListener('click',  () => { if (anim) { anim.stop(); anim.goToAndStop(0, true); el.statusEl.textContent = 'Остановлено'; } });
}
