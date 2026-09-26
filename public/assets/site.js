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
  const commentFormWrap = panel.querySelector('[data-comment-form]');
  const api = endpoint + '/api/recipes/' + encodeURIComponent(slug);

  let ratedRecipes = new Set();
  try {
    const stored = JSON.parse(localStorage.getItem('bsd-rated-recipes') || '[]');
    if (Array.isArray(stored)) ratedRecipes = new Set(stored.filter(value => typeof value === 'string'));
  } catch {}
  if (ratedRecipes.has(slug) && commentFormWrap) commentFormWrap.hidden = false;

  const safeText = value => typeof value === 'string' ? value : '';
  const renderRating = data => {
    const average = Number(data.rating?.average || 0);
    const count = Number(data.rating?.count || 0);
    summary.textContent = count
      ? `${average.toFixed(1)} out of 5 from ${count} rating${count === 1 ? '' : 's'}.`
      : 'No ratings yet. Be the first to rate it.';
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
    commentForm.querySelectorAll('input,textarea,button').forEach(el => el.disabled = true);
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
      ratedRecipes.add(slug);
      try { localStorage.setItem('bsd-rated-recipes', JSON.stringify([...ratedRecipes])); } catch {}
      if (commentFormWrap) {
        commentFormWrap.hidden = false;
        commentFormWrap.scrollIntoView({behavior:'smooth', block:'nearest'});
        const nameField = commentFormWrap.querySelector('input[name="name"]');
        window.setTimeout(() => nameField?.focus({preventScroll:true}), 350);
      }
    } catch {
      ratingStatus.textContent = 'Your rating could not be saved. Please try again later.';
    } finally {
      ratingButtons.forEach(item => item.disabled = false);
    }
  }));

  commentForm.addEventListener('submit', async event => {
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
