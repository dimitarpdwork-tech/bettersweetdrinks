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
    return \`\${Number(liters.toFixed(liters >= 10 ? 0 : 2))} L\`;
  }
  const rounded = ml >= 100 ? Math.round(ml / 5) * 5 : ml >= 20 ? Math.round(ml) : Math.round(ml * 2) / 2;
  return \`\${Number(rounded.toFixed(rounded < 10 && !Number.isInteger(rounded) ? 1 : 0))} ml\`;
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
      replacement = \`\${fractionLabel(scaled)} \${unit}\`;
    }
    const token = \`__BSDQ\${protectedIndex++}__\`;
    protectedValues.push(replacement);
    return token;
  });
  text = text.replace(amountRe, (match, amount, offset, full) => {
    const after = full.slice(offset + match.length);
    if (/^\s*(?:%|proof\b|abv\b)/i.test(after)) return match;
    const value = parseAmount(amount);
    if (!Number.isFinite(value)) return match;
    return fractionLabel(value * ratio);
  });
  protectedValues.forEach((value, index) => { text = text.replace(\`__BSDQ\${index}__\`, value); });
  return text;
}
function servingLabel(baseText, servings) {
  const base = String(baseText || '').trim();
  const countMatch = base.match(/\d+(?:\.\d+)?/);
  let noun = countMatch ? base.replace(countMatch[0], '').trim() : 'serving';
  if (!noun) noun = 'serving';
  if (servings === 1) noun = noun.replace(/s\b/i, '');
  else if (!/s\b/i.test(noun)) noun += 's';
  return \`\${Number(servings.toFixed(Number.isInteger(servings) ? 0 : 1))} \${noun}\`;
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
  const checklistKey = \`bsd-checklist:\${recipeId}\`;
  let checked = [];
  try {
    const stored = JSON.parse(localStorage.getItem(checklistKey) || '[]');
    if (Array.isArray(stored)) checked = stored.filter(Number.isInteger);
  } catch {}
  boxes.forEach((box, index) => { box.checked = checked.includes(index); });

  const updateChecklist = () => {
    const active = boxes.map((box,index) => box.checked ? index : null).filter(index => index !== null);
    if (counter) counter.textContent = \`\${active.length} of \${boxes.length} ready\`;
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
  const status = section.querySelector('[data-listing-status]');
  if (!grid || !sort || !calorieFilter) return;
  const original = [...grid.querySelectorAll('.card')];
  const originalOrder = new Map(original.map((card, index) => [card, index]));
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
  const render = () => {
    const visible = original.filter(card => !calorieFilter.value || card.dataset.calorieBand === calorieFilter.value);
    if (sort.value === 'calories-asc') visible.sort(compareMetric('calories', 1));
    else if (sort.value === 'calories-desc') visible.sort(compareMetric('calories', -1));
    else if (sort.value === 'abv-asc') visible.sort(compareMetric('abv', 1));
    else if (sort.value === 'abv-desc') visible.sort(compareMetric('abv', -1));
    else visible.sort((a, b) => originalOrder.get(a) - originalOrder.get(b));
    const visibleSet = new Set(visible);
    original.forEach(card => { card.hidden = !visibleSet.has(card); });
    [...visible, ...original.filter(card => !visibleSet.has(card))].forEach(card => grid.append(card));
    if (status) status.textContent = `${visible.length} recipe${visible.length === 1 ? '' : 's'} shown.`;
  };
  sort.addEventListener('change', render);
  calorieFilter.addEventListener('change', render);
  render();
});

const input = document.querySelector('#recipe-search');
if (input) {
  const status = document.querySelector('#search-status');
  const results = document.querySelector('#search-results');
  const category = document.querySelector('#category-filter');
  const calorie = document.querySelector('#calorie-filter');
  const sort = document.querySelector('#sort-filter');
  const savedFilter = document.querySelector('#saved-filter');
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  if ([...category.options].some(option => option.value === params.get('category'))) category.value = params.get('category');
  if ([...calorie.options].some(option => option.value === params.get('calories'))) calorie.value = params.get('calories');
  if ([...sort.options].some(option => option.value === params.get('sort'))) sort.value = params.get('sort');
  savedFilter.setAttribute('aria-pressed', String(params.get('saved') === '1'));
  let entries = null;
  function display() {
    if (!entries) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySaved = savedFilter.getAttribute('aria-pressed') === 'true';
    const found = entries.filter(p => words.every(word => p.text.toLowerCase().includes(word)) && (!category.value || p.categories.includes(category.value)) && (!calorie.value || p.calorieBand === calorie.value) && (!onlySaved || saved.has(p.url)));
    const metricSort = (key, direction) => (a, b) => {
      const av = Number.isFinite(Number(a[key])) && a[key] !== null ? Number(a[key]) : null;
      const bv = Number.isFinite(Number(b[key])) && b[key] !== null ? Number(b[key]) : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return direction * (av - bv);
    };
    if (sort.value === 'title') found.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort.value === 'calories-asc') found.sort(metricSort('calories', 1));
    else if (sort.value === 'calories-desc') found.sort(metricSort('calories', -1));
    else if (sort.value === 'abv-asc') found.sort(metricSort('abv', 1));
    else if (sort.value === 'abv-desc') found.sort(metricSort('abv', -1));
    status.textContent = `${found.length} ${onlySaved ? 'saved ' : ''}recipe${found.length === 1 ? '' : 's'} found.`;
    const fragment = document.createDocumentFragment();
    for (const p of found) {
      const card = document.createElement('article'); card.className = 'card';
      card.dataset.calories = p.calories ?? '';
      card.dataset.abv = p.abv ?? '';
      card.dataset.calorieBand = p.calorieBand ?? '';
      const photo = document.createElement('div'); photo.className = 'card-photo';
      const imageLink = document.createElement('a'); imageLink.href = p.url; imageLink.tabIndex = -1; imageLink.setAttribute('aria-hidden', 'true');
      if (p.image) { const img = document.createElement('img'); Object.assign(img, {src:p.image, alt:p.title, loading:'lazy', width:480, height:480}); imageLink.append(img); }
      const save = document.createElement('button'); save.className = 'save-button'; save.dataset.save = p.url; save.setAttribute('aria-label', `Save ${p.title}`);
      photo.append(imageLink, save);
      const label = document.createElement('p'); label.className = 'eyebrow card-category'; label.textContent = (p.categories[0] || 'Drinks').replaceAll('-', ' ');
      const heading = document.createElement('h2'); const a = document.createElement('a'); a.href = p.url; a.textContent = p.title.split('|')[0].trim(); heading.append(a);
      const facts = document.createElement('p'); facts.className = 'card-facts';
      if (p.calories != null) { const kcal = document.createElement('span'); kcal.textContent = `≈ ${p.calories} kcal`; facts.append(kcal); }
      if (p.abv != null) { const abv = document.createElement('span'); abv.textContent = `≈ ${p.abv}% ABV`; facts.append(abv); }
      const desc = document.createElement('p'); desc.textContent = p.description.length > 155 ? p.description.slice(0, 152) + '…' : p.description;
      const parts = [photo, label, heading]; if (facts.children.length) parts.push(facts); parts.push(desc);
      card.append(...parts); fragment.append(card);
    }
    if (!found.length) { const message = document.createElement('p'); message.className = 'empty-state'; message.textContent = onlySaved ? 'No saved recipes match. Save a drink from the collection, or clear your filters.' : 'No matches yet. Try a different ingredient or choose All drinks.'; fragment.append(message); }
    results.replaceChildren(fragment); updateSaveButtons();
    const state = new URLSearchParams();
    if (input.value.trim()) state.set('q', input.value.trim());
    if (category.value) state.set('category', category.value);
    if (calorie.value) state.set('calories', calorie.value);
    if (sort.value !== 'newest') state.set('sort', sort.value);
    if (onlySaved) state.set('saved', '1');
    history.replaceState(null, '', location.pathname + (state.size ? '?' + state : ''));
  }
  renderSearch = display;
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(display, 120); });
  category.addEventListener('change', display); calorie.addEventListener('change', display); sort.addEventListener('change', display);
  savedFilter.addEventListener('click', () => { savedFilter.setAttribute('aria-pressed', String(savedFilter.getAttribute('aria-pressed') !== 'true')); display(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { input.value = ''; category.value = ''; calorie.value = ''; sort.value = 'newest'; savedFilter.setAttribute('aria-pressed', 'false'); display(); input.focus(); });
  fetch(input.dataset.index).then(response => { if (!response.ok) throw Error('Search unavailable'); return response.json(); }).then(data => { entries = data; display(); }).catch(() => { status.textContent = 'Search could not load. Refresh to retry, or browse All recipes in the footer.'; });
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
