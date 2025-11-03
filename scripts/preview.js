// scripts/preview.js
function initPreview(sel) {
  // helpers (локальные, чтобы не зависеть от других файлов)
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  // элементы по селекторам, которые приходят из main.js
  const el = {
    imgFile:     $(sel.imgFile),
    jsonFile:    $(sel.jsonFile),
    bgImg:       $(sel.bgImg),
    stage:       $(sel.stage),
    animHost:    $(sel.animHost),
    startBtn:    $(sel.startBtn),
    stopBtn:     $(sel.stopBtn),
    loopToggle:  $(sel.loopToggle),
    opacityRange:$(sel.opacityRange),
    statusEl:    $(sel.statusEl),
    handles:     $$(sel.handles),
  };

  // проверка обязательных элементов
  const required = ['bgImg','stage','animHost','startBtn','stopBtn','loopToggle','opacityRange','statusEl'];
  for (const k of required) {
    if (!el[k]) {
      console.error(`[preview] missing element for "${k}" selector`);
      // не бросаем исключение — чтобы страница не падала целиком
    }
  }

  let anim = null;
  let data = null;

  // ——— UI utils ———
  const toggleHandles = (show) => el.handles.forEach(h => h.style.display = show ? 'block' : 'none');
  toggleHandles(false);

  const setStatus = (t) => { if (el.statusEl) el.statusEl.textContent = t; };

  // ——— ФОН: загрузка файла ———
  if (el.imgFile) {
    el.imgFile.addEventListener('change', (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      el.bgImg.src = URL.createObjectURL(f);
      el.bgImg.style.display = 'block';
      setStatus('Скрин установлен как фон 1440×800.');
    });
  }

  // ——— ВСТАВКА СКРИНА ИЗ БУФЕРА (Ctrl/Cmd+V) ———
  (function enablePasteFromClipboard(){
    if (el.statusEl) {
      el.statusEl.textContent = 'Размер экрана: 1440×800. Можно вставить скрин из Figma по Ctrl/Cmd+V (Copy as PNG).';
    }
    document.addEventListener('paste', async (e) => {
      try {
        const cd = e.clipboardData;
        if (!cd) return;

        // 1) прямое изображение
        const item = [...cd.items].find(i => i.type && i.type.startsWith('image/'));
        if (item) {
          const file = item.getAsFile();
          if (file) {
            el.bgImg.src = URL.createObjectURL(file);
            el.bgImg.style.display = 'block';
            setStatus('Скрин вставлен из буфера обмена.');
            e.preventDefault();
            return;
          }
        }

        // 2) data URL
        const text = cd.getData('text/plain');
        if (text && text.startsWith('data:image/')) {
          el.bgImg.src = text;
          el.bgImg.style.display = 'block';
          setStatus('Скрин вставлен (data URL).');
          e.preventDefault();
          return;
        }

        // 3) HTML с <img>
        const html = cd.getData('text/html');
        if (html) {
          const tmp = document.createElement('div');
          tmp.innerHTML = html;
          const img = tmp.querySelector('img');
          if (img && img.src) {
            el.bgImg.src = img.src;
            el.bgImg.style.display = 'block';
            setStatus('Скрин вставлен (HTML <img>).');
            e.preventDefault();
            return;
          }
        }
      } catch (err) {
        console.error('Paste error:', err);
        setStatus('Не удалось вставить изображение.');
      }
    });
  })();

  // ——— Lottie: загрузка JSON ———
  if (el.jsonFile) {
    el.jsonFile.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      setStatus('Чтение Lottie...');
      try {
        data = JSON.parse(await f.text());
        mountLottie();
        if (el.startBtn) el.startBtn.disabled = false;
        if (el.stopBtn)  el.stopBtn.disabled  = false;
        setStatus('Lottie загружен. Кликните по анимации, чтобы показать ручки.');
      } catch (err) {
        console.error(err);
        setStatus('Не удалось прочитать JSON');
      }
    });
  }

  // ——— Инициализация/перемонтирование Lottie ———
  function mountLottie() {
    if (!el.animHost) return;
    if (anim) { try { anim.destroy(); } catch {} anim = null; }
    el.animHost.querySelectorAll('svg,canvas').forEach(n => n.remove());
    el.animHost.style.display = 'block';
    anim = lottie.loadAnimation({
      container: el.animHost,
      renderer: 'svg',
      loop: !!(el.loopToggle && el.loopToggle.checked),
      autoplay: false,
      animationData: data
    });
    anim.addEventListener('DOMLoaded', () => {
      const svg = el.animHost.querySelector('svg');
      if (svg) svg.style.pointerEvents = 'none';
      anim.goToAndStop(0, true);
    });
  }

  // ——— Показ/скрытие ручек ———
  if (el.animHost) {
    el.animHost.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.handle')) toggleHandles(true);
    });
    document.addEventListener('pointerdown', (e) => {
      if (!el.animHost.contains(e.target)) toggleHandles(false);
    });
  }

  // ——— Перетаскивание контейнера ———
  (function enableDrag(){
    if (!el.animHost) return;
    let dragging = false, dx = 0, dy = 0;
    el.animHost.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.handle')) return;
      dragging = true;
      const r = el.animHost.getBoundingClientRect();
      const s = el.stage.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      el.animHost.setPointerCapture(e.pointerId);
    });
    el.animHost.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const s = el.stage.getBoundingClientRect();
      const x = e.clientX - s.left - dx;
      const y = e.clientY - s.top  - dy;
      el.animHost.style.left = clamp(x, 0, s.width  - el.animHost.offsetWidth)  + 'px';
      el.animHost.style.top  = clamp(y, 0, s.height - el.animHost.offsetHeight) + 'px';
    });
    el.animHost.addEventListener('pointerup', (e) => {
      dragging = false;
      el.animHost.releasePointerCapture(e.pointerId);
    });
  })();

  // ——— Ресайз ———
  (function enableResize(){
    if (!el.animHost || !el.handles?.length) return;
    let resizing = false, start = {x:0,y:0}, box = {l:0,t:0,w:0,h:0}, dir = '';
    el.handles.forEach(h => {
      h.addEventListener('pointerdown', (e) => {
        resizing = true;
        dir = [...h.classList].find(c => ['nw','ne','sw','se'].includes(c));
        const r = el.animHost.getBoundingClientRect();
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
        Object.assign(el.animHost.style, { left: l+'px', top: t+'px', width: w+'px', height: h+'px' });
        if (anim) anim.resize();
      });
      h.addEventListener('pointerup', (e) => { resizing = false; h.releasePointerCapture(e.pointerId); });
    });
  })();

  // ——— Контролы запуска ———
  if (el.opacityRange) {
    el.opacityRange.addEventListener('input', () => {
      el.animHost.style.opacity = (+el.opacityRange.value) / 100;
    });
  }
  if (el.loopToggle) {
    el.loopToggle.addEventListener('change', () => { if (anim) anim.loop = el.loopToggle.checked; });
  }
  if (el.startBtn) {
    el.startBtn.addEventListener('click', () => {
      if (anim) { anim.loop = !!(el.loopToggle && el.loopToggle.checked); anim.play(); setStatus('Воспроизведение'); }
    });
  }
  if (el.stopBtn) {
    el.stopBtn.addEventListener('click', () => {
      if (anim) { anim.stop(); anim.goToAndStop(0, true); setStatus('Остановлено'); }
    });
  }
}
