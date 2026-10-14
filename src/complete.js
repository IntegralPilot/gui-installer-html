export function mountComplete({ t, readJSON, showMessage, preview = false }) {
  const $ = (selector) => document.querySelector(selector);
  const options = $('#metrics-options');
  const submit = $('[data-action="next"]');
  const error = $('#shutdown-error');
  let id;
  let name;
  let request;
  let busy = false;
  let submitted = false;

  function render() {
    if (!id) return;
    $('#complete-selection').textContent = t('complete.select', { name });
    if (!error.hidden) error.textContent = t('shutdown.failed');
    const selected = options.querySelector(':checked');
    options.disabled = Boolean(request);
    $('#metrics-hint').hidden = Boolean(selected);
    submit.hidden = !selected;
    submit.disabled = !selected || busy || submitted;
    submit.textContent = t(busy ? 'shutdown.busy' : 'shutdown');
    document.querySelectorAll('[data-action="close"]').forEach((button) => {
      button.disabled = busy;
    });
  }

  options.addEventListener('change', render);

  return {
    render,
    async details() {
      const content = document.createElement('div');
      content.setAttribute('role', 'status');
      content.textContent = t('metrics.loading');
      showMessage(t('metrics.title'), content);
      try {
        const data = await readJSON('/api/telemetry', {
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        });
        const preview = document.createElement('pre');
        preview.className = 'telemetry-data';
        preview.dir = 'ltr';
        preview.tabIndex = 0;
        preview.textContent = JSON.stringify(data, null, 2);
        content.replaceChildren(preview);
      } catch (cause) {
        console.error(cause);
        content.textContent = t('metrics.loadError');
      }
    },
    show(jobId, volumeName) {
      id = jobId;
      name = volumeName;
      render();
    },
    async shutdown() {
      const selected = options.querySelector(':checked');
      if (!id || !selected || busy || submitted) return;
      request ??= { id, shareAnonymousStatistics: selected.value === 'yes' };
      busy = true;
      error.hidden = true;
      render();
      try {
        const response = await readJSON('/api/shutdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: AbortSignal.timeout(10000),
        });
        if (
          response.id !== id ||
          response.status !== 'shutting-down'
        ) {
          throw new Error('Invalid shutdown response');
        }
        submitted = true;
        if (preview) {
          showMessage(
            t('shutdown'),
            t('demo.shutdown', {
              choice: t(request.shareAnonymousStatistics ? 'yes' : 'no'),
            }),
          );
        }
      } catch (cause) {
        console.error(cause);
        error.textContent = t('shutdown.failed');
        error.hidden = false;
      } finally {
        busy = false;
        render();
        if (!submitted) submit.focus();
      }
    },
  };
}
