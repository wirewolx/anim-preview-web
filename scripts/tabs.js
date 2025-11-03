function initTabs(config) {
  const tabs = config.map(({ btnId, panelId }) => ({
    btn: document.getElementById(btnId),
    panel: document.getElementById(panelId),
  }));

  tabs.forEach(({ btn, panel }) => {
    btn.addEventListener('click', () => {
      tabs.forEach(({ btn, panel }) => {
        btn.setAttribute('aria-selected', 'false');
        panel.classList.remove('active');
      });
      btn.setAttribute('aria-selected', 'true');
      panel.classList.add('active');
    });
  });
}
