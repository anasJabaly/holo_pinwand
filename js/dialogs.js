/* Barrierefreie Dialogsteuerung: Fokus, Escape und Fokusfalle. */

const previousFocus = new WeakMap();
const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getOverlay(target) {
  return typeof target === 'string' ? document.getElementById(target) : target;
}

function visibleDialogs() {
  return [...document.querySelectorAll('.overlay[role="dialog"]:not([hidden])')];
}

function focusFirst(overlay, preferredSelector) {
  const preferred = preferredSelector ? overlay.querySelector(preferredSelector) : null;
  const target = preferred || overlay.querySelector('[autofocus], ' + focusableSelector);
  target?.focus({ preventScroll: true });
}

export function openDialog(target, { focus = null } = {}) {
  const overlay = getOverlay(target);
  if (!overlay) return;
  previousFocus.set(overlay, document.activeElement);
  overlay.hidden = false;
  document.body.classList.add('dialog-open');
  requestAnimationFrame(() => focusFirst(overlay, focus));
}

export function closeDialog(target) {
  const overlay = getOverlay(target);
  if (!overlay || overlay.hidden) return;

  const beforeEvent = new CustomEvent('holo:dialog-before-close', { cancelable: true });
  if (!overlay.dispatchEvent(beforeEvent)) return;

  overlay.hidden = true;
  overlay.dispatchEvent(new CustomEvent('holo:dialog-closed'));
  if (!visibleDialogs().length) document.body.classList.remove('dialog-open');

  const previous = previousFocus.get(overlay);
  if (previous instanceof HTMLElement && document.contains(previous)) {
    previous.focus({ preventScroll: true });
  }
}

export function initDialogSystem() {
  document.addEventListener('keydown', (event) => {
    const dialogs = visibleDialogs();
    const top = dialogs.at(-1);
    if (!top) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      closeDialog(top);
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [...top.querySelectorAll(focusableSelector)].filter(
      (element) => !element.hidden && element.getClientRects().length > 0,
    );
    if (!focusable.length) {
      event.preventDefault();
      top.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
