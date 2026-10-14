export async function readJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Cannot load ${url} (${response.status})`);
  }
  return response.json();
}

function selectLocale(config, requested) {
  const normalize = (tag) =>
    tag.trim()
      .toLowerCase()
      .replaceAll('_', '-')
      .replace(/\.[\w-]+$/, '')
      .replace(/^zh-(cmn|yue)(?=-|$)/, '$1');
  const supported = Object.entries(config.locales);
  const candidates = supported
    .filter(([, info]) => !info.hidden)
    .map(([key, info]) => [
      key,
      new Intl.Locale(info.formatLocale || key).maximize(),
    ]);
  const aliases = new Map(
    Object.entries(config.localeAliases || {}).map(([alias, target]) => [
      normalize(alias),
      target,
    ]),
  );
  const locales = new Map(supported.map(([key]) => [normalize(key), key]));
  const lookup = (tag) =>
    locales.get(normalize(tag)) || aliases.get(normalize(tag));
  const preferences = Array.isArray(requested) ? requested : [requested];

  for (const preference of preferences) {
    if (typeof preference !== 'string' || !preference.trim()) continue;
    let tag = normalize(preference);
    const exact = lookup(tag);
    if (exact) return exact;

    let parsed;
    try {
      parsed = new Intl.Locale(tag);
    } catch {
      // Legacy aliases can also have region or extension suffixes.
      while (tag.includes('-')) {
        tag = tag.slice(0, tag.lastIndexOf('-'));
        if (aliases.has(tag)) return aliases.get(tag);
      }
      continue;
    }

    const { language, script, baseName } = parsed.maximize();
    const regional = candidates.find(([, locale]) => locale.baseName === baseName);
    const match =
      lookup(parsed.baseName) ||
      lookup(baseName) ||
      regional?.[0] ||
      lookup(`${language}-${script}`) ||
      aliases.get(language);
    if (match) return match;

    const sameScript = candidates.find(([, locale]) =>
      locale.language === language && locale.script === script,
    );
    if (sameScript) return sameScript[0];
  }
  return config.defaultLocale;
}

export async function createI18n(config, requested = navigator.languages) {
  const locale = selectLocale(config, requested);
  const fallback = await readJSON(config.locales[config.defaultLocale].file);
  const translated =
    locale === config.defaultLocale
      ? {}
      : await readJSON(config.locales[locale].file);
  const messages = { ...fallback, ...translated };
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
