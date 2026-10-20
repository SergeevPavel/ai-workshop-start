// The live filter, the page's only script: as the user types, it hides the skills whose name and
// description lack the typed characters in order, and keeps the heading's count true. It never
// asks the server: the list was fetched once, by the scan. Plain JavaScript, served as is.

/** True when `query`'s characters appear in order in `text`, ignoring case and spaces. */
export function matches(text, query) {
  const haystack = text.replace(/\s+/g, '').toLowerCase();
  const needle = query.replace(/\s+/g, '').toLowerCase();
  let from = 0;
  for (const char of needle) {
    from = haystack.indexOf(char, from);
    if (from < 0) return false;
    from += char.length;
  }
  return true;
}

/**
 * Wires the field to the list: `#filter`, `.skills > li` with `data-name` and `data-description`,
 * the heading's `.count` and the `.empty` message. Applies the field's text at once, then on input.
 * @param {{ getElementById(id: string): any; querySelector(selector: string): any; querySelectorAll(selector: string): Iterable<any> }} root
 */
export function install(root) {
  const field = root.getElementById('filter');
  const count = root.querySelector('.count');
  const empty = root.querySelector('.empty');
  const items = [...root.querySelectorAll('.skills > li')];
  if (!field || !count || !empty) return;
  const total = `${items.length} ${items.length === 1 ? 'skill' : 'skills'}`;
  const apply = () => {
    const query = field.value.trim();
    let shown = 0;
    for (const item of items) {
      const hit = matches(item.dataset.name ?? '', query) || matches(item.dataset.description ?? '', query);
      item.hidden = !hit;
      if (hit) shown++;
    }
    count.textContent = query ? `${shown} of ${total}` : total;
    empty.hidden = shown > 0 || !query;
  };
  field.addEventListener('input', apply);
  apply();
}

if (typeof document !== 'undefined') install(document);
