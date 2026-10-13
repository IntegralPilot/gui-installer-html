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
  const t = (key, values = {}) =>
    i18n.t(key, {
      brand: config.brand.name,
      distribution: config.brand.distribution,
      version: config.version,
      step: 1,
      total: 3,
      ...values,
    });
  const root = $('#installer');
  let edition = config.editions[0];
  const label = (item) => (item.labelKey ? t(item.labelKey) : item.label);

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

  for (const item of config.editions) {
    const option = $('#edition-option').content.cloneNode(true);
    const radio = option.querySelector('input');
    radio.value = item.id;
    radio.checked = item === edition;
    option.querySelector('span').textContent = label(item);
    $('#editions').append(option);
  }

  function renderEdition() {
    $('#edition-name').textContent = label(edition);
    $('#edition-description').textContent = t(edition.description);
    document.querySelectorAll('[data-action="preview"]').forEach((button) => {
      button.hidden = !edition.image;
    });
    $('.no-desktop').hidden = Boolean(edition.image);
    if (edition.image) {
      $('#desktop-image').src = edition.image;
      $('#desktop-image').alt = t('preview.title', { edition: label(edition) });
    } else {
      $('#desktop-empty').textContent = t(edition.empty);
    }
  }

  function showScreen(name) {
    $('#welcome').hidden = name !== 'welcome';
    $('#edition').hidden = name !== 'edition';
    root.dataset.screen = name;
    root.setAttribute('aria-labelledby', `${name}-title`);
    $('[data-action="back"]').hidden = name === 'welcome';
    $(`#${name}-title`).focus();
  }

  function showMessage(title, body = '') {
    $('#dialog-title').textContent = title;
    $('#dialog-content').replaceChildren(body);
    $('#dialog').showModal();
  }

  $('#editions').addEventListener('change', (event) => {
    edition = config.editions.find((item) => item.id === event.target.value);
    renderEdition();
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) {
      return;
    }

    switch (button.dataset.action) {
      case 'next':
        if (root.dataset.screen === 'welcome') {
          showScreen('edition');
        } else {
          root.dispatchEvent(
            new CustomEvent('installer:next', {
              bubbles: true,
              detail: { edition: edition.id },
            }),
          );
        }
        break;
      case 'back':
        showScreen('welcome');
        break;
      case 'preview': {
        const title = t('preview.title', { edition: label(edition) });
        const image = new Image();
        image.src = edition.image;
        image.alt = title;
        showMessage(title, image);
        break;
      }
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

  renderEdition();
  root.hidden = false;
} catch (error) {
  console.error(error);
  const notice = $('#startup-error');
  notice.textContent = `Could not load the installer interface. ${error.message}`;
  notice.hidden = false;
}
