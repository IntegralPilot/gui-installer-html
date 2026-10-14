import { externalLink } from './link.js';

const defaultAbout = {
  projectWebsite: 'https://asahilinux.org/',
  gettingStarted: 'https://docs.fedoraproject.org/en-US/fedora-asahi-remix/',
};

export function renderAbout(t, about, locale, defaultLocale) {
  about ??= defaultAbout;
  const content = document.createElement('div');
  content.className = 'about';
  const description = document.createElement('p');
  description.textContent = t('about.body');
  if (about.body) {
    const language = [locale, defaultLocale, ...Object.keys(about.body)].find(
      (key) => about.body[key],
    );
    description.textContent = about.body[language];
    description.lang = language;
  }
  description.dir = 'auto';
  content.append(description);

  const links = document.createElement('div');
  links.className = 'about-links';
  for (const key of ['projectWebsite', 'gettingStarted']) {
    if (about[key]) {
      links.append(externalLink(t, t(`about.${key}`), about[key]));
    }
  }
  if (links.childElementCount) content.append(links);
  return content;
}
