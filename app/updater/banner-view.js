'use strict';
// Renders the update state from the main process into the banner card.
(() => {
  const $ = (id) => document.getElementById(id);
  const isMac = navigator.platform.toLowerCase().startsWith('mac');
  const CARD_MARGIN = 18;  // px of vertical margin around the card (6 above, 12 below for its shadow), as in banner.html

  const VIEWS = {
    available: (s) => ({
      title: `Вышла версия ${s.version}`,
      text: `У вас ${s.current}. Питомец скачает обновление, заменит старую версию и перезапустится.`
        + (isMac ? ' macOS может один раз спросить пароль.' : ''),
      buttons: [['later', 'Позже'], ['install', 'Обновить', true]],
    }),
    downloading: (s) => ({ title: `Скачиваю версию ${s.version}…`, text: `${Math.round((s.progress ?? 0) * 100)}%`, progress: s.progress ?? 0 }),
    installing: (s) => ({ title: `Устанавливаю ${s.version}…`, text: 'Питомец сейчас перезапустится.', progress: 1 }),
    upToDate: (s) => ({ title: 'Обновлений нет', text: `У вас последняя версия: ${s.current}.`, buttons: [['later', 'Ок', true]] }),
    error: (s) => ({
      title: 'Не получилось обновиться', text: s.message, error: true,
      buttons: [['openPage', 'Скачать вручную'], ...(s.version ? [['install', 'Ещё раз']] : []), ['later', 'Закрыть', true]],
    }),
  };

  function render(state) {
    const view = state && VIEWS[state.phase]?.(state);
    if (!view) return;
    $('card').classList.toggle('error', Boolean(view.error));
    $('title').textContent = view.title;
    $('text').textContent = view.text ?? '';
    $('bar').hidden = view.progress === undefined;
    $('fill').style.width = `${Math.round((view.progress ?? 0) * 100)}%`;
    const buttons = (view.buttons ?? []).map(([action, label, primary]) => {
      const button = document.createElement('button');
      button.textContent = label;
      button.className = primary ? 'px-btn primary' : 'px-btn';
      button.addEventListener('click', () => window.updateBanner.act(action));
      return button;
    });
    $('buttons').replaceChildren(...buttons);
    window.updateBanner.fit(Math.ceil($('card').getBoundingClientRect().height) + CARD_MARGIN);
  }

  window.updateBanner.onState(render);
  window.updateBanner.getState().then(render);
})();
