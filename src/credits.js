import { externalLink } from './link.js';

const installerCredits = [
  {
    name: 'Asahi Linux GUI installer',
    author: 'Michael Reeves',
    license: 'GNU GPL v2',
    licenseUrl: 'LICENSE',
  },
  {
    name: 'Atkinson Hyperlegible Next',
    author: 'The Atkinson Hyperlegible Next Project Authors',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'assets/fonts/AtkinsonHyperlegibleNext-OFL.txt',
  },
  {
    name: 'OpenDyslexic',
    author: 'Abbie Gonzalez',
    license: 'SIL Open Font License 1.1',
    licenseUrl: 'assets/fonts/OFL.txt',
  },
];

export function renderCredits(t, themeCredits = []) {
  const content = document.createElement('div');
  content.className = 'credits';

  function link(text, href) {
    return href ? externalLink(t, text, href) : document.createTextNode(text);
  }

  for (const [title, entries] of [
    ['credits.installer', installerCredits],
    ['credits.images', themeCredits],
  ]) {
    if (!entries.length) continue;
    const heading = document.createElement('h3');
    heading.textContent = t(title);
    const list = document.createElement('dl');
    for (const entry of entries) {
      const name = document.createElement('dt');
      name.dir = 'auto';
      name.append(link(entry.name, entry.url));
      const details = document.createElement('dd');
      details.dir = 'auto';
      details.textContent = entry.author;
      if (entry.license) {
        details.append(
          document.createElement('br'),
          link(entry.license, entry.licenseUrl),
        );
      }
      list.append(name, details);
    }
    content.append(heading, list);
  }
  return content;
}
