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

document.querySelectorAll('[data-open-comments]').forEach(link => link.addEventListener('click', () => {
  const comments = document.querySelector('#reader-comments');
  if (comments) comments.open = true;
}));
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

const quantityFractions = {
  '½':0.5,'¼':0.25,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875
};
const unitMl = {
  ml:1, milliliter:1, milliliters:1, cl:10,
  oz:29.5735, ounce:29.5735, ounces:29.5735,
  cup:240, cups:240,
  tbsp:15, tablespoon:15, tablespoons:15,
  tsp:5, teaspoon:5, teaspoons:5,
  shot:44, shots:44
};
const unitPattern = '(ml|milliliters?|cl|oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|shots?)';
const amountUnitRe = new RegExp('(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])\\s*' + unitPattern, 'gi');
const amountRe = /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞])/g;

function parseAmount(value) {
  const text = String(value).trim();
  if (quantityFractions[text] !== undefined) return quantityFractions[text];
  if (text.includes(' ') && text.includes('/')) {
    const [whole, fraction] = text.split(/\s+/, 2);
    return Number(whole) + parseAmount(fraction);
  }
  if (text.includes('/')) {
    const [a,b] = text.split('/');
    return Number(a) / Number(b);
  }
  return Number(text);
}
function fractionLabel(value) {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 8) / 8;
  const whole = Math.floor(rounded + 1e-8);
  const fraction = Math.round((rounded - whole) * 8);
  const labels = {1:'1/8',2:'1/4',3:'3/8',4:'1/2',5:'5/8',6:'3/4',7:'7/8'};
  if (!fraction) return String(whole);
  return (whole ? whole + ' ' : '') + labels[fraction];
}
function metricLabel(ml) {
  if (ml >= 1000) {
    const liters = ml / 1000;
    return `${Number(liters.toFixed(liters >= 10 ? 0 : 2))} L`;
  }
  const rounded = ml >= 100 ? Math.round(ml / 5) * 5 : ml >= 20 ? Math.round(ml) : Math.round(ml * 2) / 2;
  return `${Number(rounded.toFixed(rounded < 10 && !Number.isInteger(rounded) ? 1 : 0))} ml`;
}
function scaleIngredient(original, ratio, units) {
  let protectedIndex = 0;
  const protectedValues = [];
  let text = original.replace(amountUnitRe, (match, amount, unit) => {
    const scaled = parseAmount(amount) * ratio;
    let replacement;
    if (units === 'metric') {
      replacement = metricLabel(scaled * (unitMl[unit.toLowerCase()] || 1));
    } else {
      replacement = `${fractionLabel(scaled)} ${unit}`;
    }
    const token = `__BSDQ${String.fromCharCode(65 + protectedIndex++)}__`;
    protectedValues.push(replacement);
    return token;
  });
  text = text.replace(amountRe, (match, amount, offset, full) => {
    const before = full.slice(0, offset);
    const after = full.slice(offset + match.length);
    if (/:\s*$/.test(before) || /^\s*:/.test(after) || /^\s*(?:%|proof\b|abv\b)/i.test(after)) return match;
    const value = parseAmount(amount);
    if (!Number.isFinite(value)) return match;
    return fractionLabel(value * ratio);
  });
  protectedValues.forEach((value, index) => { text = text.replace(`__BSDQ${String.fromCharCode(65 + index)}__`, value); });
  return text;
}
function servingLabel(baseText, servings) {
  const base = String(baseText || '').trim();
  const countMatch = base.match(/\d+(?:\.\d+)?/);
  let noun = countMatch ? base.replace(countMatch[0], '').trim() : 'serving';
  if (!noun) noun = 'serving';
  if (servings === 1) noun = noun.replace(/s\b/i, '');
  else if (!/s\b/i.test(noun)) noun += 's';
  return `${Number(servings.toFixed(Number.isInteger(servings) ? 0 : 1))} ${noun}`;
}
let preferredUnits = 'us';
try {
  const storedUnits = localStorage.getItem('bsd-unit-system');
  if (storedUnits === 'metric' || storedUnits === 'us') preferredUnits = storedUnits;
} catch {}

document.querySelectorAll('.recipe').forEach(recipe => {
  const boxes = [...recipe.querySelectorAll('.ingredients input')];
  const counter = recipe.querySelector('.ingredient-count');
  const reset = recipe.querySelector('[data-reset]');
  const recipeId = recipe.dataset.recipeId || recipe.id || location.pathname;
  const checklistKey = `bsd-checklist:${recipeId}`;
  let checked = [];
  try {
    const stored = JSON.parse(localStorage.getItem(checklistKey) || '[]');
    if (Array.isArray(stored)) checked = stored.filter(Number.isInteger);
  } catch {}
  boxes.forEach((box, index) => { box.checked = checked.includes(index); });

  const updateChecklist = () => {
    const active = boxes.map((box,index) => box.checked ? index : null).filter(index => index !== null);
    if (counter) counter.textContent = `${active.length} of ${boxes.length} ready`;
    if (reset) reset.hidden = active.length === 0;
    try { localStorage.setItem(checklistKey, JSON.stringify(active)); } catch {}
  };
  boxes.forEach(box => box.addEventListener('change', updateChecklist));
  if (reset) reset.addEventListener('click', () => {
    boxes.forEach(box => { box.checked = false; });
    try { localStorage.removeItem(checklistKey); } catch {}
    updateChecklist();
  });
  updateChecklist();

  const ingredientNodes = [...recipe.querySelectorAll('[data-ingredient-original]')];
  const servingValue = recipe.querySelector('[data-servings-value]');
  const minus = recipe.querySelector('[data-servings-minus]');
  const plus = recipe.querySelector('[data-servings-plus]');
  const unitButtons = [...recipe.querySelectorAll('[data-unit-system]')];
  const summaries = [...recipe.querySelectorAll('[data-serving-summary]')];
  const baseServings = Math.max(1, Number(recipe.dataset.baseServings || 1));
  let servings = baseServings;
  let unitSystem = preferredUnits;
  const renderQuantities = () => {
    const ratio = servings / baseServings;
    ingredientNodes.forEach(node => {
      node.textContent = scaleIngredient(node.dataset.ingredientOriginal || node.textContent, ratio, unitSystem);
    });
    if (servingValue) servingValue.textContent = Number(servings.toFixed(Number.isInteger(servings) ? 0 : 1));
    summaries.forEach(node => { node.textContent = servingLabel(recipe.dataset.yieldText, servings); });
    if (minus) minus.disabled = servings <= 1;
    unitButtons.forEach(button => {
      const active = button.dataset.unitSystem === unitSystem;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };
  minus?.addEventListener('click', () => { servings = Math.max(1, servings - 1); renderQuantities(); });
  plus?.addEventListener('click', () => { servings = Math.min(24, servings + 1); renderQuantities(); });
  unitButtons.forEach(button => button.addEventListener('click', () => {
    unitSystem = button.dataset.unitSystem;
    preferredUnits = unitSystem;
    try { localStorage.setItem('bsd-unit-system', unitSystem); } catch {}
    document.querySelectorAll('[data-unit-system]').forEach(item => {
      const active = item.dataset.unitSystem === unitSystem;
      item.classList.toggle('selected', active);
      item.setAttribute('aria-pressed', String(active));
    });
    ingredientNodes.forEach(node => {
      node.textContent = scaleIngredient(node.dataset.ingredientOriginal || node.textContent, servings/baseServings, unitSystem);
    });
  }));
  renderQuantities();
});
document.querySelectorAll('[data-sortable-listing]').forEach(section => {
  const grid = section.querySelector('.grid');
  const sort = section.querySelector('[data-listing-sort]');
  const calorieFilter = section.querySelector('[data-calorie-filter]');
  const alcoholFilter = section.querySelector('[data-alcohol-filter]');
  const timeFilter = section.querySelector('[data-time-filter]');
  const spiritFilter = section.querySelector('[data-spirit-filter]');
  const flavorFilter = section.querySelector('[data-flavor-filter]');
  const status = section.querySelector('[data-listing-status]');
  const loadMore = section.querySelector('[data-listing-more]');
  if (!grid || !sort || !calorieFilter) return;
  const original = [...grid.querySelectorAll('.card')];
  const originalOrder = new Map(original.map((card, index) => [card, index]));
  const pageSize = Math.max(1, Number(section.dataset.pageSize || original.length));
  let shownLimit = pageSize;
  const metric = (card, key) => {
    const raw = card.dataset[key];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const compareMetric = (key, direction) => (a, b) => {
    const av = metric(a, key), bv = metric(b, key);
    if (av === null && bv === null) return originalOrder.get(a) - originalOrder.get(b);
    if (av === null) return 1;
    if (bv === null) return -1;
    return direction * (av - bv) || originalOrder.get(a) - originalOrder.get(b);
  };
  const matchesFilters = card => {
    if (calorieFilter.value && card.dataset.calorieBand !== calorieFilter.value) return false;
    if (alcoholFilter?.value && card.dataset.alcohol !== alcoholFilter.value) return false;
    if (timeFilter?.value) {
      const minutes = metric(card, 'time');
      if (minutes === null || minutes > Number(timeFilter.value)) return false;
    }
    if (spiritFilter?.value && card.dataset.spirit !== spiritFilter.value) return false;
    if (flavorFilter?.value && !(card.dataset.flavors || '').split(/\s+/).includes(flavorFilter.value)) return false;
    return true;
  };
  const render = (resetLimit = false) => {
    if (resetLimit) shownLimit = pageSize;
    const matched = original.filter(matchesFilters);
    if (sort.value === 'calories-asc') matched.sort(compareMetric('calories', 1));
    else if (sort.value === 'calories-desc') matched.sort(compareMetric('calories', -1));
    else if (sort.value === 'abv-asc') matched.sort(compareMetric('abv', 1));
    else if (sort.value === 'abv-desc') matched.sort(compareMetric('abv', -1));
    else matched.sort((a, b) => originalOrder.get(a) - originalOrder.get(b));
    const visible = matched.slice(0, shownLimit);
    const visibleSet = new Set(visible);
    original.forEach(card => { card.hidden = !visibleSet.has(card); });
    [...matched, ...original.filter(card => !matched.includes(card))].forEach(card => grid.append(card));
    if (status) status.textContent = matched.length
      ? `${visible.length} of ${matched.length} recipe${matched.length === 1 ? '' : 's'} shown.`
      : 'No recipes match these filters.';
    if (loadMore) loadMore.hidden = visible.length >= matched.length;
  };
  const resetAndRender = () => render(true);
  [calorieFilter, alcoholFilter, timeFilter, spiritFilter, flavorFilter, sort].filter(Boolean).forEach(control => control.addEventListener('change', resetAndRender));
  loadMore?.addEventListener('click', () => { shownLimit += pageSize; render(false); });
  render();
});

const input = document.querySelector('#recipe-search');
if (input) {
  const status = document.querySelector('#search-status');
  const results = document.querySelector('#search-results');
  const category = document.querySelector('#category-filter');
  const calorie = document.querySelector('#calorie-filter');
  const alcohol = document.querySelector('#alcohol-filter');
  const time = document.querySelector('#time-filter');
  const spirit = document.querySelector('#spirit-filter');
  const flavor = document.querySelector('#flavor-filter');
  const sort = document.querySelector('#sort-filter');
  const savedFilter = document.querySelector('#saved-filter');
  const searchMore = document.querySelector('#search-more');
  const pantryInput = document.querySelector('#pantry-input');
  const pantryFind = document.querySelector('#pantry-find');
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  if (pantryInput) pantryInput.value = params.get('pantry') || '';
  if ([...category.options].some(option => option.value === params.get('category'))) category.value = params.get('category');
  if ([...calorie.options].some(option => option.value === params.get('calories'))) calorie.value = params.get('calories');
  if ([...alcohol.options].some(option => option.value === params.get('alcohol'))) alcohol.value = params.get('alcohol');
  if ([...time.options].some(option => option.value === params.get('time'))) time.value = params.get('time');
  if ([...spirit.options].some(option => option.value === params.get('spirit'))) spirit.value = params.get('spirit');
  if ([...flavor.options].some(option => option.value === params.get('style'))) flavor.value = params.get('style');
  if ([...sort.options].some(option => option.value === params.get('sort'))) sort.value = params.get('sort');
  savedFilter.setAttribute('aria-pressed', String(params.get('saved') === '1'));
  let entries = null;
  const searchPageSize = 24;
  let searchLimit = searchPageSize;
  const pantryBasics = /^(?:ice\b|water\b|sparkling water\b|club soda\b|salt\b|pepper\b|garnish\b|optional\b)/i;
  const pantryTerms = () => (pantryInput?.value || '').split(',').map(value => value.trim().toLowerCase()).filter(value => value.length >= 2);
  const pantryScore = (recipe, terms) => {
    const lines = (recipe.ingredients || []).map(value => String(value).toLowerCase()).filter(value => !pantryBasics.test(value));
    let matched = 0;
    const matchedTerms = new Set();
    for (const line of lines) {
      const hit = terms.find(term => line.includes(term) || term.includes(line.replace(/^[^a-z]+|[^a-z]+$/g,'')));
      if (hit) { matched += 1; matchedTerms.add(hit); }
    }
    return {matched, missing:Math.max(0, lines.length - matched), pantryHits:matchedTerms.size};
  };
  const metricSort = (key, direction) => (a, b) => {
    const av = Number.isFinite(Number(a[key])) && a[key] !== null ? Number(a[key]) : null;
    const bv = Number.isFinite(Number(b[key])) && b[key] !== null ? Number(b[key]) : null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return direction * (av - bv);
  };
  function display(resetLimit = false) {
    if (!entries) return;
    if (resetLimit) searchLimit = searchPageSize;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySaved = savedFilter.getAttribute('aria-pressed') === 'true';
    const pantry = pantryTerms();
    const found = entries.filter(p => {
      if (!words.every(word => p.text.toLowerCase().includes(word))) return false;
      if (category.value && !p.categories.includes(category.value)) return false;
      if (calorie.value && p.calorieBand !== calorie.value) return false;
      if (alcohol.value && p.alcoholType !== alcohol.value) return false;
      if (time.value && (p.timeMinutes == null || Number(p.timeMinutes) > Number(time.value))) return false;
      if (spirit.value && p.baseSpirit !== spirit.value) return false;
      if (flavor.value && !(p.flavors || []).includes(flavor.value)) return false;
      if (onlySaved && !saved.has(p.url)) return false;
      if (pantry.length) {
        p._pantry = pantryScore(p, pantry);
        if (!p._pantry.pantryHits) return false;
      } else {
        p._pantry = null;
      }
      return true;
    });
    if (pantry.length) {
      found.sort((a,b) => a._pantry.missing - b._pantry.missing || b._pantry.matched - a._pantry.matched);
    } else if (sort.value === 'title') found.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort.value === 'calories-asc') found.sort(metricSort('calories', 1));
    else if (sort.value === 'calories-desc') found.sort(metricSort('calories', -1));
    else if (sort.value === 'abv-asc') found.sort(metricSort('abv', 1));
    else if (sort.value === 'abv-desc') found.sort(metricSort('abv', -1));
    const visible = found.slice(0, searchLimit);
    if (found.length) {
      status.textContent = pantry.length
        ? `Showing ${visible.length} of ${found.length} best matches for what you have.`
        : `Showing ${visible.length} of ${found.length} ${onlySaved ? 'saved ' : ''}recipe${found.length === 1 ? '' : 's'}.`;
    } else {
      status.textContent = pantry.length
        ? 'No good pantry matches yet. Try fewer or broader ingredient names.'
        : (onlySaved ? 'No saved recipes match these filters.' : 'No recipes match these filters.');
    }
    const fragment = document.createDocumentFragment();
    for (const p of visible) {
      const card = document.createElement('article'); card.className = 'card';
      card.dataset.calories = p.calories ?? '';
      card.dataset.abv = p.abv ?? '';
      card.dataset.calorieBand = p.calorieBand ?? '';
      card.dataset.alcohol = p.alcoholType ?? '';
      card.dataset.time = p.timeMinutes ?? '';
      card.dataset.spirit = p.baseSpirit ?? '';
      card.dataset.flavors = (p.flavors || []).join(' ');
      const photo = document.createElement('div'); photo.className = 'card-photo';
      const imageLink = document.createElement('a'); imageLink.href = p.url; imageLink.tabIndex = -1; imageLink.setAttribute('aria-hidden', 'true');
      if (p.image) { const img = document.createElement('img'); Object.assign(img, {src:p.image, alt:p.title, loading:'lazy', decoding:'async', width:480, height:480}); imageLink.append(img); }
      const save = document.createElement('button'); save.className = 'save-button'; save.dataset.save = p.url; save.setAttribute('aria-label', `Save ${p.title}`);
      photo.append(imageLink, save);
      const label = document.createElement('p'); label.className = 'eyebrow card-category'; label.textContent = (p.categories[0] || 'Drinks').replaceAll('-', ' ');
      const heading = document.createElement('h2'); const a = document.createElement('a'); a.href = p.url; a.textContent = p.title.split('|')[0].trim(); heading.append(a);
      const facts = document.createElement('p'); facts.className = 'card-facts';
      if (p.calories != null) { const kcal = document.createElement('span'); kcal.textContent = `≈ ${p.calories} kcal`; facts.append(kcal); }
      if (p.abv != null) { const abv = document.createElement('span'); abv.textContent = `≈ ${p.abv}% ABV`; facts.append(abv); }
      let pantryFit = null;
      if (pantry.length && p._pantry) {
        pantryFit = document.createElement('p'); pantryFit.className = 'pantry-fit';
        pantryFit.textContent = p._pantry.missing === 0 ? 'You have everything you need' : `Missing ${p._pantry.missing} ingredient${p._pantry.missing === 1 ? '' : 's'}`;
      }
      const desc = document.createElement('p'); desc.textContent = p.description.length > 155 ? p.description.slice(0, 152) + '…' : p.description;
      const cta = document.createElement('a'); cta.className = 'read-more'; cta.href = p.url; cta.append('Make this drink ', Object.assign(document.createElement('span'), {textContent:'↗'}));
      const parts = [photo, label, heading]; if (facts.children.length) parts.push(facts); if (pantryFit) parts.push(pantryFit); parts.push(desc, cta);
      card.append(...parts); fragment.append(card);
    }
    if (!found.length) {
      const message = document.createElement('p'); message.className = 'empty-state';
      message.textContent = pantry.length ? 'Try broader names such as “rum”, “lemon” or “coffee”, or remove one ingredient.' : (onlySaved ? 'No saved recipes match. Save a drink from the collection, or clear your filters.' : 'No matches yet. Try fewer filters or a different ingredient.');
      fragment.append(message);
    }
    results.replaceChildren(fragment); updateSaveButtons();
    if (searchMore) searchMore.hidden = visible.length >= found.length;
    const state = new URLSearchParams();
    if (input.value.trim()) state.set('q', input.value.trim());
    if (pantry.length && pantryInput?.value.trim()) state.set('pantry', pantryInput.value.trim());
    if (category.value) state.set('category', category.value);
    if (calorie.value) state.set('calories', calorie.value);
    if (alcohol.value) state.set('alcohol', alcohol.value);
    if (time.value) state.set('time', time.value);
    if (spirit.value) state.set('spirit', spirit.value);
    if (flavor.value) state.set('style', flavor.value);
    if (sort.value !== 'newest' && !pantry.length) state.set('sort', sort.value);
    if (onlySaved) state.set('saved', '1');
    history.replaceState(null, '', location.pathname + (state.size ? '?' + state : ''));
  }
  renderSearch = () => display(false);
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => display(true), 120); });
  pantryInput?.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); display(true); } });
  pantryFind?.addEventListener('click', () => display(true));
  [category, calorie, alcohol, time, spirit, flavor, sort].forEach(control => control.addEventListener('change', () => display(true)));
  savedFilter.addEventListener('click', () => { savedFilter.setAttribute('aria-pressed', String(savedFilter.getAttribute('aria-pressed') !== 'true')); display(true); });
  searchMore?.addEventListener('click', () => { searchLimit += searchPageSize; display(false); });
  document.querySelector('#clear-filters').addEventListener('click', () => {
    input.value = ''; if (pantryInput) pantryInput.value = ''; category.value = ''; calorie.value = ''; alcohol.value = ''; time.value = ''; spirit.value = ''; flavor.value = ''; sort.value = 'newest';
    savedFilter.setAttribute('aria-pressed', 'false'); display(true); input.focus();
  });
  fetch(input.dataset.index).then(response => { if (!response.ok) throw Error('Search unavailable'); return response.json(); }).then(data => { entries = data; display(true); }).catch(() => {
    status.textContent = 'Search could not load. Refresh to retry, or browse All recipes in the footer.';
  });
}


// Reader comments and ratings use the external feedback API so they keep working
// even if the website repository is private.
document.querySelectorAll('[data-feedback]').forEach(async panel => {
  const endpoint = (panel.dataset.endpoint || '').replace(/\/$/, '');
  const slug = panel.dataset.slug;
  if (!endpoint || !slug) return;

  const summary = panel.querySelector('[data-rating-summary]');
  const ratingStatus = panel.querySelector('[data-rating-status]');
  const ratingButtons = [...panel.querySelectorAll('[data-rating-value]')];
  const commentsBox = panel.querySelector('[data-comments]');
  const commentForm = panel.querySelector('[data-comment-form]');
  const commentStatus = panel.querySelector('[data-comment-status]');
  const commentsSummary = panel.querySelector('[data-comments-summary]');
  const api = endpoint + '/api/recipes/' + encodeURIComponent(slug);

  const safeText = value => typeof value === 'string' ? value : '';
  const renderRating = data => {
    const average = Number(data.rating?.average || 0);
    const count = Number(data.rating?.count || 0);
    summary.textContent = count
      ? `${average.toFixed(1)} out of 5 from ${count} rating${count === 1 ? '' : 's'}.`
      : 'No ratings yet. Be the first to rate it.';
    // Keep Recipe structured data aligned with the live, visible reader rating.
    // Google can process JS-generated JSON-LD, and we only expose real ratings.
    document.querySelectorAll('script[data-recipe-schema]').forEach(node => {
      try {
        const schema = JSON.parse(node.textContent);
        if (count > 0) {
          schema.aggregateRating = {
            '@type':'AggregateRating',
            ratingValue:Number(average.toFixed(2)),
            ratingCount:count,
            bestRating:5,
            worstRating:1
          };
        } else {
          delete schema.aggregateRating;
        }
        node.textContent = JSON.stringify(schema);
      } catch {}
    });
  };
  const renderComments = data => {
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const fragment = document.createDocumentFragment();
    if (!comments.length) {
      const p = document.createElement('p');
      p.className = 'comment-empty';
      p.textContent = 'No approved comments yet.';
      fragment.append(p);
    } else {
      for (const item of comments) {
        const article = document.createElement('article');
        article.className = 'reader-comment';
        const meta = document.createElement('p');
        meta.className = 'reader-comment-meta';
        const strong = document.createElement('strong');
        strong.textContent = safeText(item.name) || 'Reader';
        const time = document.createElement('time');
        time.dateTime = safeText(item.createdAt);
        const date = new Date(item.createdAt);
        time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {year:'numeric',month:'short',day:'numeric'});
        meta.append(strong);
        if (time.textContent) meta.append(' · ', time);
        const body = document.createElement('p');
        body.textContent = safeText(item.body);
        article.append(meta, body);
        fragment.append(article);
      }
    }
    commentsBox.replaceChildren(fragment);
    if (commentsSummary) commentsSummary.textContent = comments.length ? ` (${comments.length})` : '';
  };
  const load = async () => {
    const response = await fetch(api + '/feedback', {headers:{'Accept':'application/json'}});
    if (!response.ok) throw Error('Feedback service unavailable');
    const data = await response.json();
    renderRating(data);
    renderComments(data);
  };

  try {
    await load();
  } catch {
    summary.textContent = 'Reader feedback is temporarily unavailable.';
    commentsBox.innerHTML = '<p class="comment-empty">Comments are temporarily unavailable.</p>';
    ratingButtons.forEach(button => button.disabled = true);
    commentForm?.querySelectorAll('input,textarea,button').forEach(el => el.disabled = true);
    return;
  }

  ratingButtons.forEach(button => button.addEventListener('click', async () => {
    const rating = Number(button.dataset.ratingValue);
    ratingButtons.forEach(item => item.disabled = true);
    ratingStatus.textContent = 'Saving your rating…';
    try {
      const response = await fetch(api + '/rating', {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({rating})
      });
      if (!response.ok) throw Error('Could not save rating');
      const data = await response.json();
      renderRating({rating:data});
      ratingStatus.textContent = 'Thanks — your rating has been recorded.';
      ratingButtons.forEach(item => item.classList.toggle('selected', Number(item.dataset.ratingValue) <= rating));

    } catch {
      ratingStatus.textContent = 'Your rating could not be saved. Please try again later.';
    } finally {
      ratingButtons.forEach(item => item.disabled = false);
    }
  }));

  commentForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = commentForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    commentStatus.textContent = 'Submitting your comment…';
    const form = new FormData(commentForm);
    const payload = {
      name:String(form.get('name') || '').trim(),
      body:String(form.get('body') || '').trim(),
      website:String(form.get('website') || '').trim()
    };
    try {
      const response = await fetch(api + '/comments', {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(data.error || 'Could not submit comment');
      commentForm.reset();
      commentStatus.textContent = 'Thanks — your comment was submitted for review.';
    } catch (error) {
      commentStatus.textContent = error.message || 'Your comment could not be submitted. Please try again later.';
    } finally {
      submit.disabled = false;
    }
  });
});
