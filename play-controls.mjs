const shortcuts = {Digit1: 0.25, Digit2: 0.4, Digit3: 0.6, Digit4: 1};

export function timeScaleShortcut(event) {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target?.closest('input, select, textarea, [contenteditable]')) return;
  return shortcuts[event.code];
}

export function timeScaleLabel(value) {
  return Number(value).toLocaleString('pt-BR') + '×';
}
