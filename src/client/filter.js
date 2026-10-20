// The live filter, the page's only script: as the user types, it hides the skills whose name and
// description lack a word of the text, marks the words in the others and keeps the heading's count
// true. It never asks the server: the list was fetched once, by the scan. Plain JavaScript, served as is.

/** The words the user typed, lower-cased: the filter matches each of them on its own. */
function words(query) {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/** `text` as HTML, every occurrence of each of `words` in a `<mark>`, ignoring case; overlaps merge. */
function marked(text, words) {
  const haystack = text.toLowerCase();
  const found = [];
  for (const word of words) {
    for (let at = haystack.indexOf(word); at >= 0; at = haystack.indexOf(word, at + 1)) found.push([at, at + word.length]);
  }
  found.sort(([a], [b]) => a - b);
  let html = '';
  let from = 0;
  for (const [start, end] of found) {
    if (end <= from) continue;
    const begin = Math.max(start, from);
    html += `${escape(text.slice(from, begin))}<mark>${escape(text.slice(begin, end))}</mark>`;
    from = end;
  }
  return html + escape(text.slice(from));
}

function escape(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Wires the field to the list: `#filter`, `.skills > li` with their `.name` and `.description`, the
 * heading's `.count` and the `.empty` message. Applies the field's text at once, then on input.
 * @param {{ getElementById(id: string): any; querySelector(selector: string): any; querySelectorAll(selector: string): Iterable<any> }} root
 */
export function install(root) {
  const field = root.getElementById('filter');
  const count = root.querySelector('.count');
  const empty = root.querySelector('.empty');
  if (!field || !count || !empty) return;
  // What each skill shows, as served: the text to match and to mark.
  const items = [...root.querySelectorAll('.skills > li')].map((item) => ({
    item,
    texts: ['.name', '.description']
      .map((selector) => item.querySelector(selector))
      .filter(Boolean)
      .map((element) => ({ element, text: element.textContent })),
  }));
  const total = `${items.length} ${items.length === 1 ? 'skill' : 'skills'}`;
  const apply = () => {
    const typed = words(field.value);
    let shown = 0;
    for (const { item, texts } of items) {
      const haystack = texts.map(({ text }) => text.toLowerCase()).join('\n');
      const hit = typed.every((word) => haystack.includes(word));
      item.hidden = !hit;
      if (hit) shown++;
      for (const { element, text } of texts) element.innerHTML = marked(text, hit ? typed : []);
    }
    count.textContent = typed.length > 0 ? `${shown} of ${total}` : total;
    empty.hidden = shown > 0 || typed.length === 0;
  };
  field.addEventListener('input', apply);
  apply();
}

if (typeof document !== 'undefined') install(document);
