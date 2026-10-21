// The page's only script: the live filter and the cluster checkbox. As the user types, the filter
// hides the skills whose name and description lack a word of the text, marks the words in the
// others and keeps the heading's count true. The checkbox moves the cards into the clusters the
// scan computed, carried in the page, and back. It never asks the server: the list was fetched
// once, by the scan. Plain JavaScript, served as is.

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
 * Wires the field and the checkbox to the list: `#filter`, `#cluster`, `.skills > li` with their
 * `.name` and `.description`, the repository heading's `.count`, the `.empty` message and each `.cluster`
 * section with its list. A card's `data-cluster` names its cluster, as the section's does; none
 * is the ones on their own. Applies the field and the checkbox at once, then on input and change.
 * @param {{ getElementById(id: string): any; querySelector(selector: string): any; querySelectorAll(selector: string): Iterable<any> }} root
 */
export function install(root) {
  const field = root.getElementById('filter');
  const toggle = root.getElementById('cluster');
  const count = root.querySelector('.repository .count');
  const empty = root.querySelector('.empty');
  const list = root.querySelector('.skills');
  if (!field || !toggle || !count || !empty || !list) return;
  // What each skill shows, as served: the text to match and to mark. In the list's order, by name.
  const items = [...root.querySelectorAll('.skills > li')].map((item) => ({
    item,
    texts: ['.name', '.description']
      .map((selector) => item.querySelector(selector))
      .filter(Boolean)
      .map((element) => ({ element, text: element.textContent })),
  }));
  const clusters = [...root.querySelectorAll('.cluster')].map((section) => ({
    section,
    list: section.querySelector('ul'),
    items: items.filter(({ item }) => item.dataset.cluster === section.dataset.cluster),
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
    for (const { section, items } of clusters) section.hidden = !toggle.checked || items.every(({ item }) => item.hidden);
  };
  // Appending moves a card: into its cluster's list, or back into the list, in order; nothing is copied.
  const regroup = () => {
    if (toggle.checked) for (const cluster of clusters) cluster.list.append(...cluster.items.map(({ item }) => item));
    else list.append(...items.map(({ item }) => item));
    apply();
  };
  field.addEventListener('input', apply);
  toggle.addEventListener('change', regroup);
  regroup();
}

if (typeof document !== 'undefined') install(document);
