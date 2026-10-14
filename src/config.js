import { readJSON } from './i18n.js';

const colors = [
  'accent',
  'accentHover',
  'accentSoft',
  'accentText',
  'text',
  'muted',
  'line',
  'surface',
  'background',
  'panel',
  'footer',
  'welcomeFooter',
  'field',
  'hover',
  'unavailable',
];

export function localURL(path) {
  const url = new URL(path, document.baseURI);
  if (
    url.origin !== location.origin ||
    !['http:', 'https:'].includes(url.protocol)
  ) {
    throw new Error(`Expected a local asset: ${path}`);
  }
  return url.href;
}

export async function loadTheme(override) {
  const base = await readJSON('config/asahi.json');
  const custom = override ? await readJSON(localURL(override)) : {};
  const config = {
    ...base,
    ...custom,
    brand: { ...base.brand, ...custom.brand },
    theme: { ...base.theme, ...custom.theme },
  };
  for (const key of colors) {
    if (!/^#[\da-f]{6}$/i.test(config.theme[key])) {
      throw new Error(`Invalid theme colour: ${key}`);
    }
    const variable = key.replace(
      /[A-Z]/g,
      (letter) => `-${letter.toLowerCase()}`,
    );
    document.documentElement.style.setProperty(
      `--${variable}`,
      config.theme[key],
    );
  }
  if (config.theme.font) {
    document.documentElement.style.setProperty('--font', config.theme.font);
  }
  for (const key of ['logo', 'mark']) {
    config.brand[key] = localURL(config.brand[key]);
  }
  if (!Array.isArray(config.editions) || !config.editions.length) {
    throw new Error('No editions are configured');
  }
  for (const edition of config.editions) {
    if (edition.image) {
      edition.image = localURL(edition.image);
    }
  }
  return config;
}

export async function loadLocales() {
  const config = await readJSON('config/locales.json');
  if (!config.locales[config.defaultLocale]) {
    throw new Error('Default locale is not configured');
  }
  for (const value of Object.values(config.locales)) {
    if (typeof value.selfName !== 'string' || !value.selfName.trim()) {
      throw new Error('Missing language self-name');
    }
    value.file = localURL(value.file);
    if (value.dir && !['ltr', 'rtl'].includes(value.dir)) {
      throw new Error('Invalid writing direction');
    }
  }
  return config;
}
