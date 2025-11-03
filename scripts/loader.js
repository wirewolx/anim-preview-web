function initLoader(sel) {
  const el = {
    fileInput: $(sel.fileInput),
    stage: $(sel.stage),
    stageHint: $('#f1-stage-hint'),
    statusEl: $(sel.statusEl),
    size: $(sel.sizeSelect),
    colorPick: $(sel.colorPicker),
    colorTxt: $(sel.colorInput),
    loop: $(sel.loopToggle),
    start: $(sel.startBtn),
    stop: $(sel.stopBtn),
  };

  let anim = null;
  const destroy = () => { if (anim) { try { anim.destroy(); } catch {} } anim = null; };
  const setEnabled = (v) => { el.start.disabled = !v; el.stop.disabled = !v; };
  const updateSize = () => { const s = el.size.value; el.stage.style.width = s+'px'; el.stage.style.height = s+'px'; if (anim) anim.resize(); };
  const updateColor = (c) => { el.stage.style.background = c; };

  // --- Клик по контейнеру (и по внутреннему тексту) открывает файл
  const openPicker = (e) => { e.preventDefault(); e.stopPropagation(); el.fileInput.click(); };
  el.stage.addEventListener('click', openPicker);
  if (el.stageHint) el.stageHint.addEventListener('click', openPicker);

  // Цвет
  el.colorPick.addEventListener('input', () => { el.colorTxt.value = el.colorPick.value; updateColor(el.colorPick.value); });
  el.colorTxt.addEventListener('input', () => { const v = el.colorTxt.value.trim(); if (isHex(v)) { el.colorPick.value = v; updateColor(v); } });

  // Размер
  el.size.addEventListener('change', updateSize);

  // Loop
  el.loop.addEventListener('change', () => {
    if (anim) anim.loop = el.loop.checked;
    el.statusEl.textContent = 'Loop: ' + (el.loop.checked ? 'вкл' : 'выкл');
  });

  // Init
  updateSize(); updateColor(el.colorTxt.value); setEnabled(false);

  // Загрузка Lottie
  el.fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    el.statusEl.textContent = 'Загрузка...';
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      destroy(); el.stage.innerHTML = '';
      anim = lottie.loadAnimation({ container: el.stage, renderer: 'svg', loop: el.loop.checked, autoplay: false, animationData: json });
      anim.addEventListener('DOMLoaded', () => {
        el.statusEl.textContent = `Загружено: ${file.name}`;
        anim.goToAndStop(0, true);
        setEnabled(true);
      });
    } catch (err) {
      console.error('Lottie load error', err);
      el.statusEl.textContent = 'Ошибка загрузки файла (проверь JSON)';
      setEnabled(false);
    }
  });

  // Управление
  el.start.addEventListener('click', () => { if (!anim) return; anim.loop = el.loop.checked; anim.play(); el.statusEl.textContent = 'Воспроизведение' + (anim.loop ? ' (loop)' : ''); });
  el.stop.addEventListener('click',  () => { if (!anim) return; anim.stop(); anim.goToAndStop(0, true); el.statusEl.textContent = 'Остановлено'; });
}
