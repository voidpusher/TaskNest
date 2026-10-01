/* Progressive controls: native selects remain the source of truth. No task data lives here. */
(() => {
  'use strict';
  const controls = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let openControl = null;
  let sequence = 0;
  const spring = 'cubic-bezier(.22,1,.36,1)';
  const animate = (element, frames, duration = 320) => {
    if (!element || reducedMotion.matches) return;
    element.animate(frames, { duration, easing: spring });
  };

  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'trail-select';
    wrapper.dataset.select = select.id;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'trail-select-trigger';
    trigger.id = `${select.id || 'trail-select'}-trigger-${++sequence}`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const caption = document.createElement('span');
    caption.className = 'trail-select-caption';
    const arrow = document.createElement('span');
    arrow.className = 'trail-select-chevron';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '⌄';
    trigger.append(caption, arrow);
    const popup = document.createElement('div');
    popup.className = 'trail-select-menu';
    popup.id = `${trigger.id}-list`;
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('popover', 'manual');
    popup.hidden = true;
    trigger.setAttribute('aria-controls', popup.id);
    // Popovers stay inside their original dialog, so modal inertness remains correct.
    select.before(wrapper);
    wrapper.append(select, trigger, popup);
    const name = select.getAttribute('aria-label') || [...select.labels].map(label =>
      [...label.childNodes].filter(node => node !== wrapper).map(node => node.textContent).join(' ').trim()
    ).join(' ') || 'Choose an option';
    popup.setAttribute('aria-label', name);
    select.classList.add('trail-native-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const control = { select, wrapper, trigger, caption, popup, name, active: 0, signature: '', options: [], search: '', searchAt: 0 };
    controls.set(select, control);
    sync(control);
    new MutationObserver(() => sync(control)).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'selected', 'value'] });
    select.addEventListener('change', () => sync(control));
    select.addEventListener('focus', () => trigger.focus());
    trigger.addEventListener('click', event => {
      event.preventDefault();
      if (openControl === control) close(); else open(control);
    });
    trigger.addEventListener('keydown', event => keyboard(control, event));
    popup.addEventListener('pointerdown', event => event.preventDefault());
    popup.addEventListener('click', event => {
      const item = event.target.closest('[data-option-index]');
      if (item) choose(control, Number(item.dataset.optionIndex));
    });
    popup.addEventListener('pointermove', event => {
      const item = event.target.closest('[data-option-index]');
      if (item && !control.options[Number(item.dataset.optionIndex)]?.disabled) {
        control.active = Number(item.dataset.optionIndex);
        highlight(control, false);
      }
    });
  }

  function sync(control) {
    const { select, trigger, caption, popup } = control;
    control.options = [...select.options];
    const signature = JSON.stringify(control.options.map(option => [option.text, option.value, option.disabled, option.selected]));
    const selectedCaption = select.selectedOptions[0]?.text || 'Choose…';
    if (caption.textContent !== selectedCaption) caption.textContent = selectedCaption;
    if (trigger.disabled !== select.disabled) trigger.disabled = select.disabled;
    const accessibleName = `${control.name}: ${selectedCaption}`;
    if (trigger.getAttribute('aria-label') !== accessibleName) trigger.setAttribute('aria-label', accessibleName);
    if (signature !== control.signature) {
      control.signature = signature;
      popup.replaceChildren(...control.options.map((option, index) => {
        const item = document.createElement('div');
        item.id = `${popup.id}-${index}`;
        item.className = 'trail-select-option';
        item.dataset.optionIndex = index;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.selected));
        item.setAttribute('aria-disabled', String(option.disabled));
        const text = document.createElement('span');
        text.textContent = option.text;
        const mark = document.createElement('span');
        mark.className = 'trail-option-check';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = option.selected ? '✓' : '';
        item.append(text, mark);
        return item;
      }));
      control.active = Math.max(0, select.selectedIndex);
      if (openControl === control) highlight(control);
    }
    if (select.disabled && openControl === control) close();
  }

  function position(control) {
    const rect = control.trigger.getBoundingClientRect();
    const menu = control.popup;
    const width = Math.min(Math.max(rect.width, 200), innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(control.alignEnd ? rect.right - width : rect.left, innerWidth - width - 12))}px`;
    const below = innerHeight - rect.bottom - 20;
    const above = rect.top - 20;
    const upwards = below < Math.min(menu.scrollHeight, 240) && above > below;
    menu.style.maxHeight = `${Math.min(304, Math.max(80, upwards ? above : below))}px`;
    menu.style.top = upwards ? 'auto' : `${rect.bottom + 7}px`;
    menu.style.bottom = upwards ? `${innerHeight - rect.top + 7}px` : 'auto';
    menu.style.transformOrigin = upwards ? '50% 100%' : '50% 0%';
  }

  function highlight(control, scroll = true) {
    [...control.popup.children].forEach((item, index) => item.classList.toggle('is-highlighted', index === control.active));
    const item = control.popup.children[control.active];
    if (item) {
      control.trigger.setAttribute('aria-activedescendant', item.id);
      if (scroll) {
        const top = item.offsetTop;
        const bottom = top + item.offsetHeight;
        if (top < control.popup.scrollTop) control.popup.scrollTop = top;
        else if (bottom > control.popup.scrollTop + control.popup.clientHeight) control.popup.scrollTop = bottom - control.popup.clientHeight;
      }
    }
  }

  function open(control) {
    if (control.select.disabled) return;
    close();
    sync(control);
    openControl = control;
    control.popup.hidden = false;
    if (control.popup.showPopover) control.popup.showPopover();
    else control.popup.classList.add('fallback-open');
    control.trigger.setAttribute('aria-expanded', 'true');
    control.wrapper.classList.add('is-open');
    position(control);
    highlight(control);
    animate(control.popup, [{ opacity: 0, transform: 'translateY(-4px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 260);
  }

  function close() {
    if (!openControl) return;
    const control = openControl;
    openControl = null;
    if (control.popup.hidePopover && control.popup.matches(':popover-open')) control.popup.hidePopover();
    control.popup.hidden = true;
    control.popup.classList.remove('fallback-open');
    control.wrapper.classList.remove('is-open');
    control.trigger.setAttribute('aria-expanded', 'false');
    control.trigger.removeAttribute('aria-activedescendant');
  }

  function choose(control, index) {
    const option = control.options[index];
    if (!option || option.disabled) return;
    const changed = control.select.selectedIndex !== index;
    control.select.selectedIndex = index;
    sync(control);
    close();
    control.trigger.focus({ preventScroll: true });
    if (changed) {
      control.select.dispatchEvent(new Event('input', { bubbles: true }));
      control.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    animate(control.trigger, [{ transform: 'scale(.98)' }, { transform: 'scale(1)' }], 240);
  }

  function keyboard(control, event) {
    const isOpen = openControl === control;
    const enabled = control.options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!isOpen) { open(control); if (!['Home', 'End'].includes(event.key)) return; }
      let position = enabled.indexOf(control.active);
      if (event.key === 'Home') position = 0;
      else if (event.key === 'End') position = enabled.length - 1;
      else position = (position + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
      control.active = enabled[position] ?? 0;
      highlight(control);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) choose(control, control.active); else open(control);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!isOpen) open(control);
      control.search = Date.now() - control.searchAt > 700 ? event.key : control.search + event.key;
      control.searchAt = Date.now();
      const found = enabled.find(index => control.options[index].text.toLowerCase().startsWith(control.search.toLowerCase()));
      if (found !== undefined) { control.active = found; highlight(control); }
    }
  }

  // Enhance dialogs without changing callers, form return values or native close events.
  function enhanceDialog(dialog) {
    if (dialog.dataset.trailDialog) return;
    dialog.dataset.trailDialog = 'true';
    const nativeShow = dialog.showModal.bind(dialog);
    const nativeClose = dialog.close.bind(dialog);
    let closeTimer;
    dialog.showModal = () => {
      clearTimeout(closeTimer);
      dialog.classList.remove('trail-closing');
      close();
      refresh();
      if (!dialog.open) nativeShow();
    };
    dialog.close = value => {
      if (!dialog.open || dialog.classList.contains('trail-closing')) return;
      close();
      if (reducedMotion.matches) return nativeClose(value);
      dialog.classList.add('trail-closing');
      closeTimer = setTimeout(() => { dialog.classList.remove('trail-closing'); nativeClose(value); }, 140);
    };
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      if (openControl) close(); else dialog.close();
    });
  }

  const rowStates = new Map();
  const revealedIds = new Set();
  const observedRows = new Set();
  const revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const row = entry.target;
      if (!revealedIds.has(row.dataset.id)) {
        revealedIds.add(row.dataset.id);
        animate(row, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 360);
      }
      revealObserver.unobserve(row);
      observedRows.delete(row);
    }
  }, { threshold: .1 });
  function enhanceActions(details) {
    if (details.dataset.trailActions || !HTMLElement.prototype.showPopover) return;
    details.dataset.trailActions = 'true';
    const trigger = details.querySelector('summary');
    const popup = details.querySelector('.task-menu-list');
    if (!trigger || !popup) return;
    popup.classList.add('trail-action-menu');
    popup.setAttribute('popover', 'manual');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    const hide = () => {
      if (popup.matches(':popover-open')) popup.hidePopover();
      trigger.setAttribute('aria-expanded', 'false');
    };
    trigger.addEventListener('click', event => {
      event.preventDefault();
      const wasOpen = details.open;
      close();
      document.querySelectorAll('.task-menu[open]').forEach(menu => { menu.open = false; });
      if (wasOpen) { hide(); return; }
      details.open = true;
      popup.showPopover();
      trigger.setAttribute('aria-expanded', 'true');
      position({ trigger, popup, alignEnd: true });
    });
    details.addEventListener('toggle', () => { if (!details.open) hide(); });
    popup.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); details.open = false; hide(); trigger.focus(); }
    });
  }
  const segments = new Map();
  function enhanceSegments(group) {
    let thumb = segments.get(group);
    if (!thumb) {
      thumb = document.createElement('span');
      thumb.className = 'trail-segment-thumb';
      thumb.setAttribute('aria-hidden', 'true');
      group.append(thumb);
      group.classList.add('trail-segments');
      segments.set(group, thumb);
      new ResizeObserver(() => positionSegment(group, thumb)).observe(group);
      new MutationObserver(() => positionSegment(group, thumb)).observe(group, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected', 'aria-pressed'] });
    }
    positionSegment(group, thumb);
  }
  function positionSegment(group, thumb) {
    const active = group.querySelector('button.active,button[aria-selected="true"],button[aria-pressed="true"]');
    if (!active || !group.clientWidth) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.height = `${active.offsetHeight}px`;
    thumb.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
  }
  function refresh() {
    document.querySelectorAll('select').forEach(enhance);
    controls.forEach(sync);
    document.querySelectorAll('dialog').forEach(enhanceDialog);
    document.querySelectorAll('.task-menu').forEach(enhanceActions);
    document.querySelectorAll('.filter-group,.desk-tabs,.content-filters,.widget-mode-switch').forEach(enhanceSegments);
    observedRows.forEach(row => { if (!row.isConnected) { revealObserver.unobserve(row); observedRows.delete(row); } });
    document.querySelectorAll('.task-item[data-id],.widget-task[data-id]').forEach(row => {
      const key = row.dataset.id;
      const done = row.classList.contains('done');
      if (!revealedIds.has(key) && !observedRows.has(row)) { observedRows.add(row); revealObserver.observe(row); }
      if (rowStates.has(key) && rowStates.get(key) !== done) animate(row.querySelector('.task-check,.check'), [{ transform: 'scale(.7)' }, { transform: 'scale(1.12)', offset: .55 }, { transform: 'scale(1)' }], 320);
      rowStates.set(key, done);
    });
  }
  document.addEventListener('pointerdown', event => {
    if (openControl && !openControl.wrapper.contains(event.target)) close();
  });
  document.addEventListener('focusin', event => {
    if (openControl && !openControl.wrapper.contains(event.target)) close();
  });
  document.addEventListener('reset', () => queueMicrotask(refresh));
  document.addEventListener('toggle', event => {
    if (event.target instanceof HTMLDetailsElement && event.target.open && !event.target.classList.contains('task-menu')) animate(event.target, [{ opacity: .65, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }], 240);
  }, true);
  window.addEventListener('resize', close);
  document.addEventListener('scroll', event => { if (openControl && event.target !== openControl.popup) position(openControl); }, true);
  window.workoUI = { refresh, close, animate, view: element => {
    close();
    animate(element, [{ opacity: .45, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], 380);
  } };
  refresh();
})();
