import { mockJSON as readJSON } from './mock-api.js';

export function mountProgress({ t, locale }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('progress-bar');
  const error = $('progress-error');
  const retry = $('progress-retry');
  const percent = new Intl.NumberFormat(locale == "en-RTL" ? "en-AU" : locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const stages = ['preparing', 'resizing', 'writing', 'finalising'];
  let id;
  let polling = false;

  async function poll() {
    if (polling) return;
    polling = true;
    retry.hidden = true;
    error.hidden = true;

    try {
      const data = await readJSON(
        `/api/progress.json?id=${encodeURIComponent(id)}`,
        {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      );
      if (
        data.id !== id ||
        !['running', 'complete', 'failed'].includes(data.status) ||
        !stages.includes(data.stage) ||
        (data.percent !== null &&
          (!Number.isFinite(data.percent) ||
            data.percent < 0 ||
            data.percent > 100)) ||
        !Number.isInteger(data.step) ||
        !Number.isInteger(data.total) ||
        data.step < 1 ||
        data.step > data.total ||
        typeof data.log !== 'string'
      ) {
        throw new Error('Invalid installation progress');
      }

      const running = data.status === 'running';
      const message = t(`progress.${running ? data.stage : data.status}`);
      if ($('progress-label').textContent !== message) {
        $('progress-label').textContent = message;
      }
      if (data.percent === null) bar.removeAttribute('value');
      else bar.value = data.percent;
      $('progress-value').textContent =
        data.percent === null ? '' : percent.format(data.percent / 100);
      $('progress-step').textContent = t('progress.step', data);
      $('resize-warning').hidden = !running || data.stage !== 'resizing';
      $('progress-log').textContent = data.log;
      if (running) {
        setTimeout(poll, 1000);
      } else {
        $('progress-title').textContent = t(`progress.${data.status}Title`);
        if (data.status === 'failed') {
          $('progress-log').parentElement.open = true;
        }
        $('installer').dispatchEvent(
          new CustomEvent(`installer:${data.status}`, {
            bubbles: true,
            detail: { id },
          }),
        );
      }
    } catch (cause) {
      console.error(cause);
      bar.removeAttribute('value');
      $('progress-value').textContent = '';
      error.textContent = t('progress.connectionError');
      error.hidden = false;
      retry.hidden = false;
    } finally {
      polling = false;
    }
  }

  retry.addEventListener('click', poll);

  return {
    async start(selection) {
      if (id) return;
      id = crypto.randomUUID();
      $('progress-label').textContent = t('progress.preparing');
      try {
        await readJSON('/api/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...selection }),
          signal: AbortSignal.timeout(10000),
        });
      } catch (cause) {
        console.error(cause);
      }
      await poll();
    },
  };
}
