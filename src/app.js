import { loadTheme, loadLocales } from './config.js';
import { createI18n } from './i18n.js';
import { mountStorage } from './storage.js';
import { mountProgress } from './progress.js';
import { mountComplete } from './complete.js';
import { mountAccessibility } from './accessibility.js';
import { renderCredits } from './credits.js';
import { renderAbout } from './about.js';
import { mockJSON as readJSON } from './mock-api.js';

const $ = (selector) => document.querySelector(selector);

try {
  const params = new URLSearchParams(location.search);
  const [config, localeConfig, info] = await Promise.all([
    loadTheme(params.get('theme')),
    loadLocales(),
    readJSON('/api/info', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    }),
  ]);
  if (!info?.version || !info.device?.productName) {
    throw new Error(
      'Missing installer version or product name in /api/info',
    );
  }
  let i18n = await createI18n(
    localeConfig,
    params.get('lang') || navigator.languages,
  );
  const t = (key, values = {}) =>
    i18n.t(key, {
      brand: config.brand.name,
      aboutBrand: config.about?.body ? config.brand.name : 'Asahi Linux',
      distribution: config.brand.distribution,
      version: info.version,
      step: 1,
      total: 3,
      ...values,
    });
  const n = (value, options) => i18n.number(value, options);
  const root = $('#installer');
  const language = $('#language');
  mountAccessibility();
  const screens = [
    'welcome',
    'edition',
    'storage',
    'review',
    'progress',
    'complete',
  ];
  let edition = config.editions[0];
  const label = (item) => (item.labelKey ? t(item.labelKey) : item.label);
  const storage = mountStorage({
    t,
    label,
    n,
    readJSON,
    defaultName: config.brand.defaultName,
    onChange(valid) {
      if (root.dataset.screen === 'storage') {
        $('[data-action="next"]').disabled = !valid;
      }
    },
  });

  const progress = mountProgress({ t, n, readJSON });

  const complete = mountComplete({ t, readJSON, showMessage, preview: true });
  root.addEventListener('installer:complete', (event) => {
    showScreen('complete');
    complete.show(event.detail.id, storage.selection().volumeName);
  });

  $('link[rel="icon"]').href = config.brand.mark;

  document.querySelectorAll('[data-asset]').forEach((node) => {
    node.src = config.brand[node.dataset.asset];
  });
  $('[data-value="device"]').textContent = info.device.productName;

  for (const item of config.editions) {
    const option = $('#option').content.cloneNode(true);
    const radio = option.querySelector('input');
    radio.name = 'edition';
    radio.value = item.id;
    radio.checked = item === edition;
    option.querySelector('span').textContent = label(item);
    $('#editions').append(option);
  }

  for (const [locale, info] of Object.entries(localeConfig.locales)) {
    if (info.hidden) continue;
    const option = new Option(info.selfName, locale);
    option.lang = info.formatLocale || locale;
    option.dir = info.dir || 'ltr';
    language.add(option);
  }

  function translate() {
    document.documentElement.lang =
      localeConfig.locales[i18n.locale].formatLocale || i18n.locale;
    document.documentElement.dir = i18n.dir;
    document.title = t('app.title');
    language.value = localeConfig.locales[i18n.locale].hidden
      ? localeConfig.defaultLocale
      : i18n.locale;
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    document.querySelectorAll('[data-label]').forEach((node) => {
      node.setAttribute('aria-label', t(node.dataset.label));
    });
    $('#editions')
      .querySelectorAll('input')
      .forEach((radio) => {
        const item = config.editions.find((item) => item.id === radio.value);
        radio.nextElementSibling.textContent = label(item);
      });
    renderEdition();
    storage.translate();
    progress.render();
    renderScreen();
  }

  language.addEventListener('change', async () => {
    if (language.disabled) return;
    language.disabled = true;
    try {
      i18n = await createI18n(localeConfig, language.value);
      translate();
      const url = new URL(location.href);
      url.searchParams.set('lang', i18n.locale);
      history.replaceState(null, '', url);
    } catch (error) {
      console.error(error);
      language.value = localeConfig.locales[i18n.locale].hidden
        ? localeConfig.defaultLocale
        : i18n.locale;
      showMessage(t('language'), t('language.loadError'));
    } finally {
      language.disabled = false;
      if (!$('#dialog').open) language.focus();
    }
  });

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
    for (const screen of screens) {
      $(`#${screen}`).hidden = screen !== name;
    }
    root.dataset.screen = name;
    root.setAttribute('aria-labelledby', `${name}-title`);
    renderScreen();
    $(`#${name}-title`).focus();
    if (name === 'storage') storage.load(edition.id);
  }

  function renderScreen() {
    const name = root.dataset.screen;
    $('[data-action="back"]').hidden = ['welcome', 'complete'].includes(name);
    $('[data-action="next"]').hidden = false;
    const installing = name === 'progress';
    $('[data-action="back"]').disabled = installing;
    $('[data-action="next"]').disabled =
      installing || (name === 'storage' && !storage.valid());
    document.querySelectorAll('[data-action="close"]').forEach((button) => {
      button.disabled = installing;
    });
    $('[data-action="next"]').textContent = t(
      name === 'review' ? 'install' : 'next',
    );
    const step = $(`#${name} .step`);
    if (step) {
      step.textContent = t('wizard.step', {
        step: n(screens.indexOf(name)),
        total: n(3),
      });
    }
    if (name === 'review') {
      const values = {
        ...storage.summary(),
        system: edition.systemKey ? t(edition.systemKey) : config.brand.system,
        edition: label(edition),
      };
      $('#review')
        .querySelectorAll('[data-value]')
        .forEach((node) => {
          node.textContent = values[node.dataset.value];
        });
    }
    if (name === 'complete') complete.render();
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
        if (root.dataset.screen === 'complete') {
          complete.shutdown();
          break;
        }
        if (
          ['storage', 'review'].includes(root.dataset.screen) &&
          !storage.valid()
        ) {
          break;
        }
        if (root.dataset.screen !== 'review') {
          showScreen(screens[screens.indexOf(root.dataset.screen) + 1]);
        } else {
          showScreen('progress');
          progress.start({ edition: edition.id, ...storage.selection() });
        }
        break;
      case 'back':
        showScreen(screens[screens.indexOf(root.dataset.screen) - 1]);
        break;
      case 'preview': {
        const title = t('preview.title', { edition: label(edition) });
        const image = new Image();
        image.src = edition.image;
        image.alt = title;
        showMessage(title, image);
        break;
      }
      case 'device': {
        const basicFields = ['productName', 'soc', 'osVersion', 'bootMode'];
        const content = document.createDocumentFragment();
        const details = document.createElement('dl');
        details.className = 'device-details';
        const technical = document.createElement('details');
        technical.className = 'device-technical';
        const summary = document.createElement('summary');
        summary.textContent = t('device.technical');
        const extra = details.cloneNode();
        const extraFields = Object.keys(info.device).filter(
          (key) => !basicFields.includes(key),
        );
        for (const key of [...basicFields, ...extraFields]) {
          if (!Object.hasOwn(info.device, key)) continue;
          const term = document.createElement('dt');
          term.textContent = t(`device.${key}`);
          const description = document.createElement('dd');
          description.dir = 'auto';
          description.textContent = info.device[key] ?? t('device.none');
          (basicFields.includes(key) ? details : extra).append(term, description);
        }
        content.append(details);
        if (extraFields.length) {
          technical.append(summary, extra);
          content.append(technical);
        }
        showMessage(t('device.title'), content);
        break;
      }
      case 'metrics':
        complete.details();
        break;
      case 'about':
        showMessage(
          t('about.title'),
          renderAbout(t, config.about, i18n.locale, localeConfig.defaultLocale),
        );
        break;
      case 'credits':
        showMessage(t('credits'), renderCredits(t, config.credits));
        break;
      case 'close':
        showMessage(t('demo.title'));
        break;
    }
  });

  translate();
  root.hidden = false;
} catch (error) {
  console.error(error);
  const notice = $('#startup-error');
  notice.textContent = `Could not load the installer interface. ${error.message}`;
  notice.hidden = false;
}
