export async function readJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Cannot load ${url} (${response.status})`);
  }
  return response.json();
}

export async function createI18n(config, requested = navigator.languages) {
  const supported = Object.keys(config.locales);
  const preferences = Array.isArray(requested) ? requested : [requested];
  let locale = config.defaultLocale;

  for (const preference of preferences) {
    const tag = preference?.toLowerCase();
    const match =
      supported.find((key) => key.toLowerCase() === tag) ||
      supported.find(
        (key) => key.toLowerCase().split('-')[0] === tag?.split('-')[0],
      );

    if (match) {
      locale = match;
      break;
    }
  }
  const fallback = await readJSON(config.locales[config.defaultLocale].file);
  const translated =
    locale === config.defaultLocale
      ? {}
      : await readJSON(config.locales[locale].file);
  const messages = {
    ...fallback,
    ...config.messages?.[config.defaultLocale],
    ...translated,
    ...config.messages?.[locale],
  };
  const formatLocale = config.locales[locale].formatLocale || locale;
  return {
    locale,
    dir: config.locales[locale].dir || 'ltr',
    number(value, options) {
      return new Intl.NumberFormat(formatLocale, options).format(value);
    },
    t(key, values = {}) {
      if (typeof messages[key] !== 'string') {
        throw new Error(`Missing translation: ${key}`);
      }
      return messages[key].replace(/\{(\w+)\}/g, (_, name) => {
        if (!(name in values)) {
          throw new Error(`Missing ${name} in ${key}`);
        }
        return String(values[name]);
      });
    },
  };
}
