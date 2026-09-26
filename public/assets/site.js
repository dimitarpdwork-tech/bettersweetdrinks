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
const FRACTION_VALUE = {'½':0.5,'¼':0.25,'¾':0.75,'⅓':1/3,'⅔':2/3,'⅛':0.125,'⅜':0.375,'⅝':0.625,'⅞':0.875};
const VOLUME_ML = {oz:29.5735,ounce:29.5735,ounces:29.5735,ml:1,milliliter:1,milliliters:1,cl:10,cup:240,cups:240,tbsp:15,tablespoon:15,tablespoons:15,tsp:5,teaspoon:5,teaspoons:5,shot:44,shots:44,dash:0.9,dashes:0.9};
const UNIT_RE = /^(oz|ounce|ounces|ml|milliliter|milliliters|cl|cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|shot|shots|dash|dashes)\b/i;
const parseNumber = raw => {
  raw = raw.trim();
  if (FRACTION_VALUE[raw] !== undefined) return FRACTION_VALUE[raw];
  if (/^\d+\s+\d+\/\d+$/.test(raw)) { const parts=raw.split(/\s+/); const frac=parts[1].split('/').map(Number); return Number(parts[0]) + frac[0]/frac[1]; }
  if (/^\d+\/\d+$/.test(raw)) { const parts=raw.split('/').map(Number); return parts[0]/parts[1]; }
  const value=Number(raw); return Number.isFinite(value)?value:null;
};
const formatAmount = value => {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value-Math.round(value))<0.03) return String(Math.round(value));
  const whole=Math.floor(value), fraction=value-whole;
  const options=[[0.125,'⅛'],[0.25,'¼'],[1/3,'⅓'],[0.375,'⅜'],[0.5,'½'],[0.625,'⅝'],[2/3,'⅔'],[0.75,'¾'],[0.875,'⅞']];
  const best=options.reduce((a,b)=>Math.abs(b[0]-fraction)<Math.abs(a[0]-fraction)?b:a);
  if (Math.abs(best[0]-fraction)<0.055) return (whole?whole+' ':'')+best[1];
  return value<10?value.toFixed(1).replace(/\.0$/,''):String(Math.round(value));
};
const parseIngredient = text => {
  const match=text.match(/^\s*((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d+(?:\.\d+)?)|[½¼¾⅓⅔⅛⅜⅝⅞])\s*/);
  if(!match) return null; const amount=parseNumber(match[1]); if(amount===null) return null;
  const rest=text.slice(match[0].length), unitMatch=rest.match(UNIT_RE);
  const unit=unitMatch?unitMatch[1].toLowerCase():'', tail=(unitMatch?rest.slice(unitMatch[0].length):rest).replace(/^\s+/,'');
  return {amount,unit,tail};
};
const transformIngredient = (original,multiplier,units) => {
  const parsed=parseIngredient(original); if(!parsed) return original;
  let amount=parsed.amount*multiplier, unit=parsed.unit;
  if(units==='metric' && unit && VOLUME_ML[unit]) { amount*=VOLUME_ML[unit]; unit='ml'; if(amount>=1000){amount/=1000;unit='L';} }
  const amountText=(units==='metric'&&unit==='ml')?(amount<10?amount.toFixed(1).replace(/\.0$/,''):String(Math.round(amount))):formatAmount(amount);
  return [amountText,unit,parsed.tail].filter(Boolean).join(' ');
};

document.querySelectorAll('.recipe').forEach(recipe => {
  const boxes=[...recipe.querySelectorAll('.ingredients input[type="checkbox"]')];
  const counter=recipe.querySelector('.ingredient-count'), reset=recipe.querySelector('[data-reset]'), tools=recipe.querySelector('[data-recipe-tools]');
  const recipeId=(tools&&tools.dataset.recipeId)||recipe.id||location.pathname, checkKey='bsd-recipe-checks:'+recipeId;
  let checked=new Set();
  try { const stored=JSON.parse(localStorage.getItem(checkKey)||'[]'); if(Array.isArray(stored)) checked=new Set(stored.map(Number)); } catch {}
  boxes.forEach((box,index)=>{if(checked.has(index)) box.checked=true;});
  const updateChecklist=()=>{
    const completed=boxes.filter(box=>box.checked).length;
    if(counter) counter.textContent=completed+' of '+boxes.length+' ready';
    if(reset) reset.hidden=completed===0;
    try { localStorage.setItem(checkKey,JSON.stringify(boxes.map((box,index)=>box.checked?index:null).filter(v=>v!==null))); } catch {}
  };
  boxes.forEach(box=>box.addEventListener('change',updateChecklist));
  if(reset) reset.addEventListener('click',()=>{boxes.forEach(box=>{box.checked=false;});updateChecklist();});
  updateChecklist();
  if(!tools) return;
  const ingredientTexts=[...recipe.querySelectorAll('[data-ingredient-text]')], minus=tools.querySelector('[data-serving-minus]'), plus=tools.querySelector('[data-serving-plus]'), servingCount=tools.querySelector('[data-serving-count]'), servingLabel=recipe.querySelector('[data-serving-label]'), unitButtons=[...tools.querySelectorAll('[data-unit]')];
  const base=Math.max(1,Number(tools.dataset.baseServings)||1); let servings=base, units='us';
  try { units=localStorage.getItem('bsd-unit-system')==='metric'?'metric':'us'; } catch {}
  const originalServingLabel=servingLabel?servingLabel.textContent:'';
  const renderIngredients=()=>{
    const multiplier=servings/base;
    ingredientTexts.forEach(span=>{span.textContent=transformIngredient(span.dataset.original||span.textContent,multiplier,units);});
    if(servingCount) servingCount.textContent=String(servings);
    if(servingLabel) servingLabel.textContent=originalServingLabel.replace(/^\d+(?:\.\d+)?/,String(servings));
    unitButtons.forEach(button=>{const selected=button.dataset.unit===units;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
    if(minus) minus.disabled=servings<=1; if(plus) plus.disabled=servings>=24;
  };
  if(minus) minus.addEventListener('click',()=>{servings=Math.max(1,servings-1);renderIngredients();});
  if(plus) plus.addEventListener('click',()=>{servings=Math.min(24,servings+1);renderIngredients();});
  unitButtons.forEach(button=>button.addEventListener('click',()=>{units=button.dataset.unit;try{localStorage.setItem('bsd-unit-system',units);}catch{}renderIngredients();}));
  renderIngredients();
});
document.querySelectorAll('[data-sortable-listing]').forEach(section => {
  const grid=section.querySelector('.grid'), sort=section.querySelector('[data-listing-sort]'), calorieFilter=section.querySelector('[data-calorie-filter]'), alcoholFilter=section.querySelector('[data-alcohol-filter]'), timeFilter=section.querySelector('[data-time-filter]'), spiritFilter=section.querySelector('[data-spirit-filter]'), status=section.querySelector('[data-listing-status]'), clear=section.querySelector('[data-clear-listing]'), loadMore=section.querySelector('[data-load-more]');
  if(!grid||!sort||!calorieFilter) return;
  const original=[...grid.querySelectorAll('.card')], originalOrder=new Map(original.map((card,index)=>[card,index]));
  const pageSize=Number(section.dataset.clientPaging)||0; let shown=pageSize||Infinity;
  const metric=(card,key)=>{const raw=card.dataset[key];if(raw===undefined||raw==='')return null;const value=Number(raw);return Number.isFinite(value)?value:null;};
  const compareMetric=(key,direction)=>(a,b)=>{const av=metric(a,key),bv=metric(b,key);if(av===null&&bv===null)return originalOrder.get(a)-originalOrder.get(b);if(av===null)return 1;if(bv===null)return -1;return direction*(av-bv)||originalOrder.get(a)-originalOrder.get(b);};
  const matches=card=>(!calorieFilter.value||card.dataset.calorieBand===calorieFilter.value)&&(!alcoholFilter?.value||card.dataset.alcohol===alcoholFilter.value)&&(!timeFilter?.value||(timeFilter.value==='quick'&&metric(card,'time')!==null&&metric(card,'time')<=10))&&(!spiritFilter?.value||card.dataset.spirit===spiritFilter.value);
  const render=()=>{
    let visible=original.filter(matches);
    if(sort.value==='calories-asc')visible.sort(compareMetric('calories',1)); else if(sort.value==='calories-desc')visible.sort(compareMetric('calories',-1)); else if(sort.value==='abv-asc')visible.sort(compareMetric('abv',1)); else if(sort.value==='abv-desc')visible.sort(compareMetric('abv',-1)); else visible.sort((a,b)=>originalOrder.get(a)-originalOrder.get(b));
    const displaySet=new Set(visible.slice(0,shown));
    original.forEach(card=>{card.hidden=!displaySet.has(card);});
    visible.forEach(card=>grid.append(card));
    if(status) status.textContent=Math.min(visible.length,shown)+' of '+visible.length+' recipes shown.';
    if(loadMore){loadMore.hidden=shown>=visible.length;loadMore.textContent='Load more recipes ('+(visible.length-Math.min(visible.length,shown))+' remaining)';}
  };
  [sort,calorieFilter,alcoholFilter,timeFilter,spiritFilter].filter(Boolean).forEach(control=>control.addEventListener('change',()=>{shown=pageSize||Infinity;render();}));
  clear?.addEventListener('click',()=>{[calorieFilter,alcoholFilter,timeFilter,spiritFilter].filter(Boolean).forEach(control=>control.value='');sort.value='default';shown=pageSize||Infinity;render();});
  loadMore?.addEventListener('click',()=>{shown+=pageSize||24;render();});
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
  const pantryInput = document.querySelector('#pantry-input');
  const pantrySearch = document.querySelector('#pantry-search');
  const pantryClear = document.querySelector('#pantry-clear');
  const savedFilter = document.querySelector('#saved-filter');
  const params = new URLSearchParams(location.search);
  input.value = params.get('q') || '';
  if ([...category.options].some(option => option.value === params.get('category'))) category.value = params.get('category');
  if ([...calorie.options].some(option => option.value === params.get('calories'))) calorie.value = params.get('calories');
  if ([...alcohol.options].some(option => option.value === params.get('alcohol'))) alcohol.value = params.get('alcohol');
  if ([...time.options].some(option => option.value === params.get('time'))) time.value = params.get('time');
  if ([...spirit.options].some(option => option.value === params.get('spirit'))) spirit.value = params.get('spirit');
  if ([...flavor.options].some(option => option.value === params.get('flavor'))) flavor.value = params.get('flavor');
  if ([...sort.options].some(option => option.value === params.get('sort'))) sort.value = params.get('sort');
  savedFilter.setAttribute('aria-pressed', String(params.get('saved') === '1'));
  let entries = null;
  let pantryMode = false;
  const pantryTerms = () => pantryInput.value.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  function display() {
    if (!entries) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySaved = savedFilter.getAttribute('aria-pressed') === 'true';
    let found = entries.filter(p => words.every(word => p.text.toLowerCase().includes(word)) && (!category.value || p.categories.includes(category.value)) && (!calorie.value || p.calorieBand === calorie.value) && (!alcohol.value || p.alcoholType === alcohol.value) && (!time.value || (time.value === 'quick' && Number(p.timeMinutes) <= 10)) && (!spirit.value || p.baseSpirit === spirit.value) && (!flavor.value || (p.flavorTags || []).includes(flavor.value)) && (!onlySaved || saved.has(p.url)));
    if (pantryMode) {
      const terms = pantryTerms();
      found = found.map(p => {
        const ingredients=(p.pantryIngredients||[]).map(v=>v.toLowerCase());
        const missing=ingredients.filter(ingredient=>!terms.some(term=>ingredient.includes(term)||term.includes(ingredient))).length;
        const matched=terms.filter(term=>ingredients.some(ingredient=>ingredient.includes(term)||term.includes(ingredient))).length;
        return {...p,pantryMissing:missing,pantryMatched:matched};
      }).filter(p=>p.pantryMatched>0 && p.pantryMissing<=1).sort((a,b)=>a.pantryMissing-b.pantryMissing||b.pantryMatched-a.pantryMatched);
    }
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
    status.textContent = pantryMode ? (found.length ? found.length + ' pantry match' + (found.length===1?'':'es') + ' — exact matches first, then recipes missing one ingredient.' : 'No close pantry matches yet. Add another ingredient or clear pantry mode.') : `${found.length} ${onlySaved ? 'saved ' : ''}recipe${found.length === 1 ? '' : 's'} found.`;
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
      let pantry = null;
      if (pantryMode) { pantry = document.createElement('p'); pantry.className='pantry-match'; pantry.textContent = p.pantryMissing===0 ? 'You can make this now' : 'Missing 1 ingredient'; }
      const desc = document.createElement('p'); desc.textContent = p.description.length > 155 ? p.description.slice(0, 152) + '…' : p.description;
      const more = document.createElement('a'); more.className = 'read-more'; more.href = p.url; more.textContent = 'Make this drink ↗';
      const parts = [photo, label, heading]; if (facts.children.length) parts.push(facts); if (pantry) parts.push(pantry); parts.push(desc, more);
      card.append(...parts); fragment.append(card);
    }
    if (!found.length) { const message = document.createElement('p'); message.className = 'empty-state'; message.textContent = onlySaved ? 'No saved recipes match. Save a drink from the collection, or clear your filters.' : 'No matches yet. Try a different ingredient or choose All drinks.'; fragment.append(message); }
    results.replaceChildren(fragment); updateSaveButtons();
    const state = new URLSearchParams();
    if (input.value.trim()) state.set('q', input.value.trim());
    if (category.value) state.set('category', category.value);
    if (calorie.value) state.set('calories', calorie.value);
    if (alcohol.value) state.set('alcohol', alcohol.value);
    if (time.value) state.set('time', time.value);
    if (spirit.value) state.set('spirit', spirit.value);
    if (flavor.value) state.set('flavor', flavor.value);
    if (sort.value !== 'newest') state.set('sort', sort.value);
    if (onlySaved) state.set('saved', '1');
    history.replaceState(null, '', location.pathname + (state.size ? '?' + state : ''));
  }
  renderSearch = display;
  let debounce;
  input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(display, 120); });
  [category,calorie,alcohol,time,spirit,flavor,sort].forEach(control=>control.addEventListener('change',display));
  pantrySearch.addEventListener('click',()=>{pantryMode=pantryTerms().length>0;pantryClear.hidden=!pantryMode;display();});
  pantryInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();pantrySearch.click();}});
  pantryClear.addEventListener('click',()=>{pantryMode=false;pantryInput.value='';pantryClear.hidden=true;display();});
  savedFilter.addEventListener('click', () => { savedFilter.setAttribute('aria-pressed', String(savedFilter.getAttribute('aria-pressed') !== 'true')); display(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { input.value=''; category.value=''; calorie.value=''; alcohol.value=''; time.value=''; spirit.value=''; flavor.value=''; sort.value='newest'; savedFilter.setAttribute('aria-pressed','false'); pantryMode=false; pantryInput.value=''; pantryClear.hidden=true; display(); input.focus(); });
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
  const commentToggle = panel.querySelector('[data-comment-toggle]');
  const commentCount = panel.querySelector('[data-comment-count]');
  commentToggle?.addEventListener('click', () => {
    if (!commentFormWrap) return;
    commentFormWrap.hidden = !commentFormWrap.hidden;
    commentToggle.textContent = commentFormWrap.hidden ? 'Leave a comment' : 'Hide comment form';
    if (!commentFormWrap.hidden) commentFormWrap.querySelector('input[name="name"]')?.focus({preventScroll:true});
  });
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
    if (commentCount) commentCount.textContent = comments.length ? '(' + comments.length + ')' : '';
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
