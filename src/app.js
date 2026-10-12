import { loadConfig } from './config.js';
import { createI18n } from './i18n.js';

const $ = (selector) => document.querySelector(selector);

try {
  const params = new URLSearchParams(location.search);
  const config = await loadConfig(params.get('theme'));
  const i18n = await createI18n(
    config,
    params.get('lang') || navigator.languages,
  );
  const t = (key) =>
    i18n.t(key, {
      brand: config.brand.name,
      version: config.version,
    });

  document.documentElement.lang = i18n.locale;
  document.documentElement.dir = i18n.dir;
  document.title = t('app.title');
  $('link[rel="icon"]').href = config.brand.mark;

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.label));
  });
  document.querySelectorAll('[data-asset]').forEach((node) => {
    node.src = config.brand[node.dataset.asset];
  });
  $('[data-value="device"]').textContent = config.deviceName;

  function showMessage(title, body = '') {
    $('#dialog-title').textContent = title;
    $('#dialog-content').textContent = body;
    $('#dialog').showModal();
  }

  $('#installer').addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) {
      return;
    }

    switch (button.dataset.action) {
      case 'next':
        $('#installer').dispatchEvent(
          new CustomEvent('installer:next', { bubbles: true }),
        );
        break;
      case 'device':
        showMessage(t('device.title'), t('demo.device'));
        break;
      case 'credits':
        showMessage(t('credits'), t('credits.body'));
        break;
      case 'close':
        showMessage(t('demo.title'));
        break;
    }
  });

  $('#installer').hidden = false;
} catch (error) {
  console.error(error);
  const notice = $('#startup-error');
  notice.textContent = `Could not load the installer interface. ${error.message}`;
  notice.hidden = false;
}
