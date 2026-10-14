const $ = (selector) => document.querySelector(selector);

function validateDisk(disk) {
  const positive = (value) => Number.isFinite(value) && value > 0;
  const named = (item) =>
    ['label', 'labelKey'].some(
      (key) => typeof item[key] === 'string' && item[key].trim(),
    );
  if (!disk || !positive(disk.sizeGB) || !Array.isArray(disk.partitions)) {
    throw new Error('Invalid disk data');
  }
  const ids = new Set();
  for (const part of disk.partitions) {
    if (
      !part ||
      typeof part.id !== 'string' ||
      !part.id ||
      !named(part) ||
      ids.has(part.id) ||
      !positive(part.sizeGB) ||
      !['free', 'apfs', 'other'].includes(part.kind) ||
      (part.maxGB !== undefined &&
        (part.kind !== 'apfs' ||
          !Number.isFinite(part.maxGB) ||
          part.maxGB < 0 ||
          part.maxGB > part.sizeGB))
    ) {
      throw new Error('Invalid partition data');
    }
    ids.add(part.id);
  }
}

export function mountStorage({ t, label, n, readJSON, defaultName, onChange }) {
  const size = $('#size');
  const name = $('#name');
  const sizes = new Map();
  let disk;
  let target;
  let edition;
  let minGB;
  let loading = false;
  let request = 0;
  name.value = defaultName;

  const validName = () =>
    Boolean(name.value.trim()) && name.value.length <= name.maxLength;
  const valid = () =>
    !loading && Boolean(target) && size.validity.valid && validName();
  const maximum = (part) =>
    Math.floor(part.kind === 'free' ? part.sizeGB : part.maxGB ?? 0);
  const usable = (part) => part.kind !== 'other' && minGB <= maximum(part);

  function update() {
    if (target) {
      sizes.set(target.id, size.value);
      size.setAttribute('aria-invalid', String(!size.validity.valid));
      name.setAttribute('aria-invalid', String(!validName()));
      $('#size-error').hidden = size.validity.valid;
      $('#name-error').hidden = validName();
      $('#storage-effect').hidden = !size.validity.valid;
      $('#storage-effect').textContent = size.validity.valid
        ? t(
            target.kind === 'free'
              ? 'storage.freeEffect'
              : 'storage.resizeEffect',
            {
              volume: label(target),
              before: n(target.sizeGB),
              after: n(target.sizeGB - size.valueAsNumber),
            },
          )
        : '';
    }
    onChange(valid());
  }

  function select(id) {
    target = disk.partitions.find((part) => part.id === id && usable(part));
    $('.storage-chooser').hidden = !target;
    $('#no-locations').hidden = Boolean(target);
    if (target) {
      $('#disk-map')
        .querySelectorAll('[aria-pressed]')
        .forEach((node) => {
          node.setAttribute('aria-pressed', String(node.value === id));
        });
      $('#destinations')
        .querySelectorAll('input')
        .forEach((radio) => {
          radio.checked = radio.value === id;
        });
      $('#operation-title').textContent = t(
        target.kind === 'free' ? 'storage.useFree' : 'storage.resize',
        { volume: label(target) },
      );
      const maxGB = maximum(target);
      size.min = minGB;
      size.max = maxGB;
      size.value = sizes.get(id) ?? maxGB;
      const values = {
        min: n(minGB),
        max: n(maxGB),
        step: n(1),
      };
      $('#size-limits').textContent = t('storage.limits', values);
      $('#size-error').textContent = t('storage.sizeError', values);
    }
    update();
  }

  function render() {
    $('#drive-name').textContent = t('storage.drive', {
      disk: t('storage.internal'),
      size: n(disk.sizeGB),
    });
    $('#disk-map').replaceChildren();
    $('#destinations').replaceChildren();
    $('#disk-map').hidden = !disk.partitions.length;
    disk.partitions.forEach((part, index) => {
      const node = $('#partition').content.firstElementChild.cloneNode(true);
      node.value = part.id;
      node.style.flexGrow = part.sizeGB;
      node.classList.toggle('free', part.kind === 'free');
      node.classList.toggle('unavailable', !usable(part));
      node.setAttribute(
        'aria-label',
        t('storage.region', { volume: label(part), size: n(part.sizeGB) }),
      );
      node.querySelector('.region-name').textContent = label(part);
      node.querySelector('.region-size').textContent = t('size.gb', {
        size: n(part.sizeGB),
      });
      for (const text of node.querySelectorAll('.region-name, .region-size')) {
        text.hidden = part.sizeGB / disk.sizeGB < 0.06;
      }
      const tooltip = node.querySelector('.tooltip');
      if (usable(part)) {
        node.setAttribute('aria-pressed', 'false');
        tooltip.remove();
      } else {
        node.setAttribute('aria-disabled', 'true');
        tooltip.id = `unavailable-${index}`;
        tooltip.textContent = t('storage.unavailable');
        node.setAttribute('aria-describedby', tooltip.id);
      }
      $('#disk-map').append(node);
    });
    const candidates = disk.partitions
      .filter(usable)
      .sort((a, b) => Number(b.kind === 'free') - Number(a.kind === 'free'));
    for (const part of candidates) {
      const option = $('#option').content.cloneNode(true);
      const radio = option.querySelector('input');
      radio.name = 'target';
      radio.value = part.id;
      const title = document.createElement('strong');
      title.textContent = label(part);
      const detail = document.createElement('small');
      detail.textContent = t(
        part.kind === 'free' ? 'storage.available' : 'storage.reclaim',
        { size: n(maximum(part)) },
      );
      option.querySelector('span').append(title, detail);
      $('#destinations').append(option);
    }
    select(
      candidates.find((part) => part.id === target?.id)?.id ?? candidates[0]?.id,
    );
  }

  async function load(selectedEdition = edition) {
    const current = ++request;
    if (selectedEdition !== edition) {
      sizes.clear();
      target = undefined;
    }
    edition = selectedEdition;
    loading = true;
    onChange(false);
    $('#storage').setAttribute('aria-busy', 'true');
    $('#storage-data').hidden = true;
    $('#storage-status').hidden = false;
    $('#storage-status').textContent = t('storage.loading');
    $('#storage-retry').hidden = true;
    try {
      const options = { cache: 'no-store', signal: AbortSignal.timeout(10000) };
      const [data, required] = await Promise.all([
        readJSON('/api/partitions', options),
        readJSON(`/api/edition/${encodeURIComponent(edition)}/size`, options),
      ]);
      if (current !== request) return;
      validateDisk(data);
      if (!Number.isFinite(required?.minGB) || required.minGB <= 0) {
        throw new Error('Invalid edition size');
      }
      disk = data;
      minGB = Math.ceil(required.minGB);
      render();
      $('#storage-data').hidden = false;
      $('#storage-status').hidden = true;
    } catch (error) {
      if (current !== request) return;
      console.error(error);
      disk = target = undefined;
      $('#storage-data').hidden = true;
      $('#storage-status').textContent = t('storage.loadError');
      $('#storage-retry').hidden = false;
      onChange(false);
    } finally {
      if (current === request) {
        loading = false;
        $('#storage').setAttribute('aria-busy', 'false');
        onChange(valid());
      }
    }
  }

  $('#storage-retry').addEventListener('click', () => load());
  $('#destinations').addEventListener('change', (event) =>
    select(event.target.value),
  );
  $('.storage-settings').addEventListener('input', update);
  $('#disk-map').addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button?.hasAttribute('aria-pressed')) {
      select(button.value);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      $('#disk-map')
        .querySelectorAll('.unavailable')
        .forEach((node) => node.classList.add('dismissed'));
    }
  });
  for (const event of ['focusin', 'pointerover']) {
    $('#disk-map').addEventListener(event, ({ target, relatedTarget }) => {
      const region = target.closest('.unavailable');
      if (region && !region.contains(relatedTarget)) {
        region.classList.remove('dismissed');
        region.classList.add('show-tooltip');
        const tooltip = region.querySelector('.tooltip');
        tooltip.style.left = `${Math.max(
          0,
          Math.min(
            region.offsetLeft + (region.offsetWidth - tooltip.offsetWidth) / 2,
            $('#disk-map').clientWidth - tooltip.offsetWidth,
          ),
        )}px`;
      }
    });
  }
  for (const event of ['focusout', 'pointerout']) {
    $('#disk-map').addEventListener(event, ({ target, relatedTarget }) => {
      const region = target.closest('.unavailable');
      if (!region || region.contains(relatedTarget)) return;
      // Allow the pointer to cross the gap between the region and its tooltip.
      setTimeout(() => {
        if (!region.matches(':hover, :focus-within')) {
          region.classList.remove('show-tooltip');
        }
      }, 300);
    });
  }

  return {
    translate() {
      if (disk) render();
      if (!$('#storage-status').hidden) {
        $('#storage-status').textContent = t(
          loading ? 'storage.loading' : 'storage.loadError',
        );
      }
    },
    load,
    valid,
    summary: () => ({
      name: name.value.trim(),
      size: t('size.gb', { size: n(size.valueAsNumber) }),
      location:
        target.kind === 'free'
          ? label(target)
          : t('review.resize', {
              volume: label(target),
              before: n(target.sizeGB),
              after: n(target.sizeGB - size.valueAsNumber),
            }),
    }),
    selection: () => ({
      target: target.id,
      sizeGB: size.valueAsNumber,
      volumeName: name.value.trim(),
    }),
  };
}
