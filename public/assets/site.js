/* Progressive enhancement: article text and category browsing also work without JS. */
const menu = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus();
  }
});
document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));
const saveStatus = document.querySelector('.save-status');
let saved = new Set();
try {
  const data = JSON.parse(localStorage.getItem('bsd-saved-recipes') || '[]');
  if (Array.isArray(data)) saved = new Set(data.filter(value => typeof value === 'string'));
} catch { /* Browsing and saving in memory still work if storage is unavailable. */ }
function updateSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(button => {
    const active = saved.has(button.dataset.save);
    button.hidden = false;
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Saved' : 'Save';
  });
}
let renderSearch = null;
document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const url = button.dataset.save;
  saved.has(url) ? saved.delete(url) : saved.add(url);
  let persistent = true;
  try { localStorage.setItem('bsd-saved-recipes', JSON.stringify([...saved])); } catch { persistent = false; }
  updateSaveButtons();
  saveStatus.textContent = persistent ? (saved.has(url) ? 'Recipe saved in this browser.' : 'Recipe removed from saved recipes.') : 'Browser storage is unavailable. This selection will last until you leave this page.';
  if (document.querySelector('#saved-filter')?.getAttribute('aria-pressed') === 'true') renderSearch?.();
});
updateSaveButtons();
const focusButton = document.querySelector('[data-focus]');
if (focusButton) {
  focusButton.hidden = false;
  focusButton.addEventListener('click', () => {
    const active = document.body.classList.toggle('recipe-focus');
    focusButton.setAttribute('aria-pressed', String(active));
    focusButton.textContent = active ? 'Show full article' : 'Recipe mode';
  });
}
document.querySelectorAll('.recipe').forEach(recipe => {
  const boxes = [...recipe.querySelectorAll('.ingredients input')];
  const counter = recipe.querySelector('.ingredient-count');
  const reset = recipe.querySelector('[data-reset]');
  const update = () => { counter.textContent = `${boxes.filter(box => box.checked).length} of ${boxes.length} ready`; };
  boxes.forEach(box => box.addEventListener('change', update));
  reset.hidden = false;
  reset.addEventListener('click', () => { boxes.forEach(box => { box.checked = false; }); update(); });
  update();
});
const input = document.querySelector('#recipe-search');
if (input) {
  const status = document.querySelector('#search-status');
  const results = document.querySelector('#search-results');
  const category = document.querySelector('#category-filter');
  const sort = document.querySelector('#sort-filter');
  const savedFilter = document.querySelector('#saved-filter');
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  if ([...category.options].some(option => option.value === params.get('category'))) category.value = params.get('category');
  savedFilter.setAttribute('aria-pressed', String(params.get('saved') === '1'));
  let entries = null;
  function display() {
    if (!entries) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySaved = savedFilter.getAttribute('aria-pressed') === 'true';
    const found = entries.filter(p => words.every(word => p.text.toLowerCase().includes(word)) && (!category.value || p.categories.includes(category.value)) && (!onlySaved || saved.has(p.url)));
    if (sort.value === 'title') found.sort((a, b) => a.title.localeCompare(b.title));
    status.textContent = `${found.length} ${onlySaved ? 'saved ' : ''}recipe${found.length === 1 ? '' : 's'} found.`;
    const fragment = document.createDocumentFragment();
    for (const p of found) {
      const card = document.createElement('article'); card.className = 'card';
      const photo = document.createElement('div'); photo.className = 'card-photo';
      const imageLink = document.createElement('a'); imageLink.href = p.url; imageLink.tabIndex = -1; imageLink.setAttribute('aria-hidden', 'true');
      if (p.image) { const img = document.createElement('img'); Object.assign(img, {src:p.image, alt:p.title, loading:'lazy', width:480, height:480}); imageLink.append(img); }
      const save = document.createElement('button'); save.className = 'save-button'; save.dataset.save = p.url; save.setAttribute('aria-label', `Save ${p.title}`);
      photo.append(imageLink, save);
      const label = document.createElement('p'); label.className = 'eyebrow card-category'; label.textContent = (p.categories[0] || 'Drinks').replaceAll('-', ' ');
      const heading = document.createElement('h2'); const a = document.createElement('a'); a.href = p.url; a.textContent = p.title.split('|')[0].trim(); heading.append(a);
      const desc = document.createElement('p'); desc.textContent = p.description.length > 155 ? p.description.slice(0, 152) + '…' : p.description;
      card.append(photo, label, heading, desc); fragment.append(card);
    }
    if (!found.length) { const message = document.createElement('p'); message.className = 'empty-state'; message.textContent = onlySaved ? 'No saved recipes match. Save a drink from the collection, or clear your filters.' : 'No matches yet. Try a different ingredient or choose All drinks.'; fragment.append(message); }
    results.replaceChildren(fragment); updateSaveButtons();
    const state = new URLSearchParams();
    if (input.value.trim()) state.set('q', input.value.trim());
    if (category.value) state.set('category', category.value);
    if (onlySaved) state.set('saved', '1');
    history.replaceState(null, '', location.pathname + (state.size ? '?' + state : ''));
  }
  renderSearch = display;
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(display, 120); });
  category.addEventListener('change', display); sort.addEventListener('change', display);
  savedFilter.addEventListener('click', () => { savedFilter.setAttribute('aria-pressed', String(savedFilter.getAttribute('aria-pressed') !== 'true')); display(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { input.value = ''; category.value = ''; sort.value = 'newest'; savedFilter.setAttribute('aria-pressed', 'false'); display(); input.focus(); });
  fetch(input.dataset.index).then(response => { if (!response.ok) throw Error('Search unavailable'); return response.json(); }).then(data => { entries = data; display(); }).catch(() => { status.textContent = 'Search could not load. Refresh to retry, or browse All recipes in the footer.'; });
}
