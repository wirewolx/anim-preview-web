@@ -1,45 +1,255 @@
(function boot() {
  const start = () => {
    try {
      initTabs([
        { btnId: 'tab-f1', panelId: 'panel-f1' },
        { btnId: 'tab-f2', panelId: 'panel-f2' },
      ]);

      initLoader({
        fileInput:   '#f1-file',
        stage:       '#f1-stage',
        statusEl:    '#f1-status',
        sizeSelect:  '#f1-sizeSelect',
        colorPicker: '#f1-colorPicker',
        colorInput:  '#f1-colorInput',
        loopToggle:  '#f1-loopToggle',
        startBtn:    '#f1-startBtn',
        stopBtn:     '#f1-stopBtn',
      });

      initPreview({
        imgFile:     '#f2-imgFile',
        jsonFile:    '#f2-jsonFile',
        bgImg:       '#f2-bgImg',
        stage:       '#f2-stage',
        animHost:    '#f2-animHost',
        startBtn:    '#f2-startBtn',
        stopBtn:     '#f2-stopBtn',
        loopToggle:  '#f2-loopToggle',
        opacityRange:'#f2-opacityRange',
        statusEl:    '#f2-status',
        handles:     '#f2-animHost .handle',
      });
    } catch (e) {
      console.error('Init error:', e);
      alert('Ошибка инициализации. Посмотри консоль браузера (F12) — я вывел подробности.');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
