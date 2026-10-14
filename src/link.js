export function externalLink(t, text, href) {
  const url = new URL(href, document.baseURI);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Invalid link: ${href}`);
  }
  const anchor = document.createElement('a');
  anchor.textContent = text;
  anchor.href = url.href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.setAttribute('aria-label', t('link.open', { name: text }));
  return anchor;
}
