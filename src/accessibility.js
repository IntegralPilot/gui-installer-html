export function mountAccessibility() {
  const root = document.documentElement;
  const dialog = document.getElementById('accessibility-dialog');
  const controls = [...dialog.querySelectorAll('[data-preference]')];
  const defaults = Object.fromEntries(
    controls.map((control) => [control.dataset.preference, control.value]),
  );
  const contrast = matchMedia('(prefers-contrast: more)');
  const key = 'installer-accessibility';
  let preferences = { ...defaults };

  try {
    const saved = JSON.parse(localStorage.getItem(key));
    for (const control of controls) {
      const name = control.dataset.preference;
      if (
        [...control.options].some((option) => option.value === saved?.[name])
      ) {
        preferences[name] = saved[name];
      }
    }
  } catch {
    // Preferences are optional when browser storage is unavailable.
  }

  function apply() {
    root.style.fontSize = `${Number(preferences.scale) * 100}%`;
    root.dataset.contrast =
      preferences.contrast === 'system'
        ? contrast.matches
          ? 'high'
          : 'standard'
        : preferences.contrast;
    root.dataset.spacing = preferences.spacing;
    root.dataset.font = preferences.font;
    for (const control of controls) {
      control.value = preferences[control.dataset.preference];
    }
  }

  function save() {
    apply();
    try {
      localStorage.setItem(key, JSON.stringify(preferences));
    } catch {
      // Settings still apply for this session.
    }
  }

  document.getElementById('accessibility').addEventListener('click', () => {
    dialog.showModal();
  });
  dialog.addEventListener('change', (event) => {
    const name = event.target.dataset.preference;
    if (!name) return;
    preferences[name] = event.target.value;
    save();
  });
  document
    .getElementById('accessibility-reset')
    .addEventListener('click', () => {
      preferences = { ...defaults };
      save();
    });
  contrast.addEventListener('change', apply);
  apply();
}
