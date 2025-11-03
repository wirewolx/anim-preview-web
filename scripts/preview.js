// scripts/preview.js

// === elements ===
const el = {
  file: document.getElementById('f2-file'),
  stage: document.getElementById('f2-stage'),
  bgImg: document.getElementById('f2-bgImg'),
  status: document.getElementById('f2-status'),
  controls: document.getElementById('f2-controls'),
  sizeSelect: document.getElementById('f2-sizeSelect'),
  playBtn: document.getElementById('f2-playBtn'),
  loopToggle: document.getElementById('f2-loopToggle'),
  hint: document.getElementById('f2-hint')
};

let anim = null;
let lottieContainer = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// === functions ===
function destroyAnim() {
  if (anim) { try { anim.destroy(); } catch (e) {} }
  anim = null;
  if (lottieContainer) lottieContainer.remove();
  lottieContainer = null;
}

function setStatus(msg) {
  if (el.status) el.status.textContent = msg;
}

// === load lottie ===
el.file.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    destroyAnim();

    // контейнер
    lottieContainer = document.createElement('div');
    lottieContainer.className = 'lottieContainer';
    lottieContainer.style.position = 'absolute';
    lottieContainer.style.width = el.sizeSelect.value + 'px';
    lottieContainer.style.height = el.sizeSelect.value + 'px';
    lottieContainer.style.left = '50%';
    lottieContainer.style.top = '50%';
    lottieContainer.style.transform = 'translate(-50%, -50%)';
    el.stage.appendChild(lottieContainer);

    anim = lottie.loadAnimation({
      container: lottieContainer,
      renderer: 'svg',
      loop: el.loopToggle.checked,
      autoplay: false,
      animationData: json
    });

    anim.addEventListener('DOMLoaded', () => {
      setStatus('Lottie загружен: ' + file.name);
      anim.goToAndStop(0, true);
      el.controls.style.display = 'flex';
      el.hint.style.display = 'none';
    });

    // Перемещение анимации
    lottieContainer.addEventListener('mousedown', (e) => {
      isDragging = true;
      const rect = lottieContainer.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = e.clientX - el.stage.getBoundingClientRect().left - dragOffset.x;
      const y = e.clientY - el.stage.getBoundingClientRect().top - dragOffset.y;
      lottieContainer.style.left = x + 'px';
      lottieContainer.style.top = y + 'px';
      lottieContainer.style.transform = 'none';
    });

    document.addEventListener('mouseup', () => { isDragging = false; });
  } catch (err) {
    console.error(err);
    setStatus('Ошибка загрузки файла');
  }
});

// === управление ===
el.playBtn.addEventListener('click', () => {
  if (!anim) return;
  anim.loop = el.loopToggle.checked;
  anim.play();
  setStatus('Воспроизведение ' + (anim.loop ? '(loop)' : ''));
});

el.loopToggle.addEventListener('change', () => {
  if (anim) anim.loop = el.loopToggle.checked;
});

el.sizeSelect.addEventListener('change', () => {
  if (!lottieContainer) return;
  const s = el.sizeSelect.value;
  lottieContainer.style.width = s + 'px';
  lottieContainer.style.height = s + 'px';
  anim?.resize();
});

// === paste from clipboard ===
(function enablePasteFromClipboard() {
  if (el.status)
    el.status.textContent = 'Размер экрана: 1440×800. Вставь скрин из Figma (Ctrl/Cmd+V — Copy as PNG).';

  document.addEventListener('paste', async (e) => {
    try {
      const cd = e.clipboardData;
      if (!cd) return;

      // 1) Изображение
      const item = [...cd.items].find(i => i.type && i.type.startsWith('image/'));
      if (item) {
        const file = item.getAsFile();
        if (file) {
          const url = URL.createObjectURL(file);
          el.bgImg.src = url;
          el.bgImg.style.display = 'block';
          setStatus('Скрин вставлен из буфера обмена.');
          e.preventDefault();
          return;
        }
      }

      // 2) Data URL
      const text = cd.getData('text/plain');
      if (text && text.startsWith('data:image/')) {
        el.bgImg.src = text;
        el.bgImg.style.display = 'block';
        setStatus('Скрин вставлен (data URL).');
        e.preventDefault();
        return;
      }

      // 3) HTML <img>
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
