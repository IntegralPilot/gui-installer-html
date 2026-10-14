export function mountProgress({ t, n, readJSON }) {
  const $ = (id) => document.getElementById(id);
  const bar = $('progress-bar');
  const error = $('progress-error');
  const retry = $('progress-retry');
  const stages = ['preparing', 'resizing', 'writing', 'finalising'];
  let id;
  let latest;
  let polling = false;

  function render() {
    if (!id) return;
    error.textContent = t('progress.connectionError');
    const running = !latest || latest.status === 'running';
    const stage = latest?.stage || 'preparing';
    const message = t(`progress.${running ? stage : latest.status}`);
    if ($('progress-label').textContent !== message) {
      $('progress-label').textContent = message;
    }
    const percent = error.hidden ? latest?.percent : null;
    if (percent == null) bar.removeAttribute('value');
    else bar.value = percent;
    $('progress-value').textContent =
      percent == null
        ? ''
        : n(percent / 100, { style: 'percent', maximumFractionDigits: 0 });
    $('progress-step').textContent = latest
      ? t('progress.step', { step: n(latest.step), total: n(latest.total) })
      : '';
    $('resize-warning').hidden = !running || stage !== 'resizing';
    $('progress-log').textContent = latest?.log || '';
    if (!running) {
      $('progress-title').textContent = t(`progress.${latest.status}Title`);
    }
  }

  async function poll() {
    if (polling) return;
    polling = true;
    retry.hidden = true;
    error.hidden = true;

    try {
      const data = await readJSON(
        `/api/progress?id=${encodeURIComponent(id)}`,
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
        (data.status === 'complete' && data.percent !== 100) ||
        !Number.isInteger(data.step) ||
        !Number.isInteger(data.total) ||
        data.step < 1 ||
        data.step > data.total ||
        typeof data.log !== 'string'
      ) {
        throw new Error('Invalid installation progress');
      }

      latest = data;
      render();
      if (data.status === 'running') {
        setTimeout(poll, 1000);
      } else {
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
      error.hidden = false;
      retry.hidden = false;
      render();
    } finally {
      polling = false;
    }
  }

  retry.addEventListener('click', poll);

  return {
    render,
    async start(selection) {
      if (id) return;
      id = crypto.randomUUID();
      render();
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
