/* Progressive enhancement: article text and category browsing also work without JS. */
const menu = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
navigation?.addEventListener('click', event => {
  if (!event.target.closest('a') || menu?.getAttribute('aria-expanded') !== 'true') return;
  navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false');
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    navigation.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); menu.focus();
  }
});
document.querySelectorAll('[data-print]').forEach(button => button.addEventListener('click', () => window.print()));

const THEME_KEY='bsd-theme';
const themeToggle=document.querySelector('[data-theme-toggle]');
const themeLabel=document.querySelector('[data-theme-label]');
const themeIcon=document.querySelector('[data-theme-icon]');
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
const getThemePreference=()=>{try{return localStorage.getItem(THEME_KEY)||'system';}catch{return 'system';}};
const applyTheme=preference=>{
  const resolved=preference==='dark'||(preference==='system'&&systemTheme.matches)?'dark':'light';
  document.documentElement.dataset.theme=resolved;
  document.documentElement.dataset.themePreference=preference;
  if(themeLabel) themeLabel.textContent=preference[0].toUpperCase()+preference.slice(1);
  if(themeIcon) themeIcon.textContent=preference==='system'?'◐':preference==='dark'?'☾':'☀';
  if(themeToggle) themeToggle.setAttribute('aria-label','Theme: '+preference+'. Activate to change theme.');
  const meta=document.querySelector('#theme-color-meta');
  if(meta) meta.content=resolved==='dark'?'#171315':'#b8273e';
};
applyTheme(getThemePreference());
themeToggle?.addEventListener('click',()=>{
  const order=['system','light','dark'];
  const current=getThemePreference();
  const next=order[(order.indexOf(current)+1)%order.length];
  try{localStorage.setItem(THEME_KEY,next);}catch{}
  applyTheme(next);
});
systemTheme.addEventListener?.('change',()=>{if(getThemePreference()==='system')applyTheme('system');});

const toastRegion=document.querySelector('[data-toast-region]');
let toastTimer=null;
const showToast=(message,tone='default')=>{
  if(!toastRegion||!message)return;
  clearTimeout(toastTimer);
  const toast=document.createElement('div');
  toast.className='toast'+(tone!=='default'?' toast-'+tone:'');
  toast.textContent=message;
  toastRegion.replaceChildren(toast);
  requestAnimationFrame(()=>toast.classList.add('show'));
  toastTimer=setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),180);},3200);
};

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
const PANTRY_KEY = 'bsd-pantry-items';
const readPantry = () => {
  try {
    const data = JSON.parse(localStorage.getItem(PANTRY_KEY) || '[]');
    return new Set(Array.isArray(data) ? data.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().toLowerCase()) : []);
  } catch { return new Set(); }
};
const writePantry = pantry => {
  try { localStorage.setItem(PANTRY_KEY, JSON.stringify([...pantry])); return true; } catch { return false; }
};
const SHOPPING_KEY = 'bsd-shopping-items';
const SHOPPING_CHECKED_KEY = 'bsd-shopping-checked';
const readShopping = () => {
  try {
    const data=JSON.parse(localStorage.getItem(SHOPPING_KEY) || '[]');
    return new Set(Array.isArray(data) ? data.filter(value=>typeof value==='string' && value.trim()).map(value=>value.trim().toLowerCase()) : []);
  } catch { return new Set(); }
};
const writeShopping = shopping => {
  try { localStorage.setItem(SHOPPING_KEY, JSON.stringify([...shopping])); return true; } catch { return false; }
};
const readShoppingChecked = () => {
  try {
    const data=JSON.parse(localStorage.getItem(SHOPPING_CHECKED_KEY) || '[]');
    return new Set(Array.isArray(data) ? data.filter(value=>typeof value==='string') : []);
  } catch { return new Set(); }
};
const writeShoppingChecked = checked => {
  try { localStorage.setItem(SHOPPING_CHECKED_KEY, JSON.stringify([...checked])); } catch {}
};
function updateNavBarBadge(){
  const shopping=readShopping();
  const total=saved.size+shopping.size;
  document.querySelectorAll('[data-nav-bar-count]').forEach(badge=>{
    badge.hidden=total===0;
    badge.textContent=total>99?'99+':String(total);
  });
  document.querySelectorAll('[data-nav-my-bar],[data-mobile-my-bar]').forEach(link=>{
    link.setAttribute('aria-label',total ? 'My Bar: '+saved.size+' saved recipe'+(saved.size===1?'':'s')+' and '+shopping.size+' shopping item'+(shopping.size===1?'':'s') : 'My Bar');
  });
}
const pantryCovers = (ingredient, pantry) => [...pantry].some(term=>ingredient.includes(term)||term.includes(ingredient));
const shoppingHas = (ingredient, shopping) => [...shopping].some(term=>ingredient.includes(term)||term.includes(ingredient));
const addShoppingItems = items => {
  const pantry=readPantry(), shopping=readShopping();
  let added=0;
  items.map(value=>String(value).trim().toLowerCase()).filter(Boolean).forEach(item=>{
    if(pantryCovers(item,pantry) || shoppingHas(item,shopping)) return;
    shopping.add(item);added+=1;
  });
  writeShopping(shopping);
  updateNavBarBadge();
  return added;
};
const pantryScore = (recipe, pantry) => {
  const terms=[...pantry].map(value=>value.toLowerCase());
  const ingredients=(recipe.pantryIngredients||[]).map(value=>value.toLowerCase());
  const missing=ingredients.filter(ingredient=>!terms.some(term=>ingredient.includes(term)||term.includes(ingredient)));
  const matched=terms.filter(term=>ingredients.some(ingredient=>ingredient.includes(term)||term.includes(ingredient)));
  return {missing, matched};
};
function updateSaveButtons() {
  document.querySelectorAll('[data-save]').forEach(button => {
    const active = saved.has(button.dataset.save);
    button.hidden = false;
    button.setAttribute('aria-pressed', String(active));
    button.textContent = active ? 'Saved' : 'Save';
  });
}
let renderSearch = null;
let renderMyBar = null;
let renderRecipeShoppingButtons = null;
document.addEventListener('click', event => {
  const button = event.target.closest('[data-save]');
  if (!button) return;
  const url = button.dataset.save;
  saved.has(url) ? saved.delete(url) : saved.add(url);
  let persistent = true;
  try { localStorage.setItem('bsd-saved-recipes', JSON.stringify([...saved])); } catch { persistent = false; }
  updateSaveButtons();
  const saveMessage=persistent ? (saved.has(url) ? 'Recipe saved.' : 'Removed from saved recipes.') : 'Could not save permanently in this browser.';
  saveStatus.textContent=saveMessage;
  showToast(saveMessage,persistent?'success':'warning');
  updateNavBarBadge();
  if (document.querySelector('#saved-filter')?.getAttribute('aria-pressed') === 'true') renderSearch?.();
  renderMyBar?.();
});
updateSaveButtons();
updateNavBarBadge();
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
    if(servingLabel) { let label=originalServingLabel.replace(/^\d+(?:\.\d+)?/,String(servings)); if(servings!==1) label=label.replace(/\b(cocktail|drink|serving|glass)\b$/i,'$1s'); servingLabel.textContent=label; }
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
function createRecipeCard(p, options={}) {
  const card=document.createElement('article'); card.className='card';
  card.dataset.calories=p.calories??''; card.dataset.abv=p.abv??''; card.dataset.calorieBand=p.calorieBand??'';
  const photo=document.createElement('div'); photo.className='card-photo';
  const imageLink=document.createElement('a'); imageLink.href=p.url; imageLink.tabIndex=-1; imageLink.setAttribute('aria-hidden','true');
  if(p.image){const img=document.createElement('img');Object.assign(img,{src:p.image,alt:p.title,loading:'lazy',width:480,height:480});imageLink.append(img);}
  const save=document.createElement('button'); save.className='save-button'; save.dataset.save=p.url; save.setAttribute('aria-label','Save '+p.title);
  photo.append(imageLink,save);
  const label=document.createElement('p'); label.className='eyebrow card-category'; label.textContent=(p.categories?.[0]||'Drinks').replaceAll('-',' ');
  const heading=document.createElement('h2'); const link=document.createElement('a'); link.href=p.url; link.textContent=p.title.split('|')[0].trim(); heading.append(link);
  const facts=document.createElement('p'); facts.className='card-facts';
  if(p.calories!=null){const kcal=document.createElement('span');kcal.textContent='≈ '+p.calories+' kcal';facts.append(kcal);}
  if(p.abv!=null){const abv=document.createElement('span');abv.textContent='≈ '+p.abv+'% ABV';facts.append(abv);}
  const parts=[photo,label,heading];
  if(facts.children.length) parts.push(facts);
  if(options.status){const status=document.createElement('p');status.className='pantry-match';status.textContent=options.status;parts.push(status);}
  if(options.shoppingItems?.length){
    const shopping=readShopping();
    const pantry=readPantry();
    const pending=options.shoppingItems.filter(item=>!pantryCovers(String(item).toLowerCase(),pantry)&&!shoppingHas(String(item).toLowerCase(),shopping));
    const shop=document.createElement('button');shop.type='button';shop.className='quiet-button card-shopping-button';
    if(pending.length){
      shop.dataset.addShopping=JSON.stringify(pending);
      shop.textContent=options.shoppingLabel || (pending.length===1 ? 'Add missing item to list' : 'Add '+pending.length+' missing items');
    }else{
      shop.disabled=true;shop.textContent='Missing items already listed';
    }
    parts.push(shop);
  }
  const desc=document.createElement('p');desc.textContent=p.description.length>155?p.description.slice(0,152)+'…':p.description;parts.push(desc);
  const more=document.createElement('a');more.className='read-more';more.href=p.url;more.textContent='Make this drink ↗';parts.push(more);
  card.append(...parts);
  return card;
}

document.addEventListener('click',event=>{
  const button=event.target.closest('[data-add-shopping]');
  if(!button)return;
  let items=[];
  try{items=JSON.parse(button.dataset.addShopping||'[]');}catch{}
  if(!Array.isArray(items)||!items.length)return;
  const added=addShoppingItems(items);
  const message=added ? (added===1?'Added 1 ingredient to your shopping list.':'Added '+added+' ingredients to your shopping list.') : 'Those ingredients are already in My Bar or on your shopping list.';
  if(saveStatus) saveStatus.textContent=message;
  showToast(message,added?'success':'default');
  renderMyBar?.();renderRecipeShoppingButtons?.();
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
  const storedPantry=readPantry();
  if(storedPantry.size) pantryInput.value=[...storedPantry].join(', ');
  let entries = null;
  let pantryMode = false;
  const pantryTerms = () => pantryInput.value.split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  function display() {
    if (!entries) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const onlySaved = savedFilter.getAttribute('aria-pressed') === 'true';
    let found = entries.filter(p => words.every(word => p.text.toLowerCase().includes(word)) && (!category.value || p.categories.includes(category.value)) && (!calorie.value || p.calorieBand === calorie.value) && (!alcohol.value || p.alcoholType === alcohol.value) && (!time.value || (time.value === 'quick' && p.timeMinutes != null && Number(p.timeMinutes) <= 10)) && (!spirit.value || p.baseSpirit === spirit.value) && (!flavor.value || (p.flavorTags || []).includes(flavor.value)) && (!onlySaved || saved.has(p.url)));
    if (pantryMode) {
      const pantry=new Set(pantryTerms());
      found = found.map(p => {
        const score=pantryScore(p,pantry);
        return {...p,pantryMissing:score.missing.length,pantryMatched:score.matched.length};
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
      const pantryStatus=pantryMode ? (p.pantryMissing===0 ? 'You can make this now' : 'Missing 1 ingredient') : '';
      fragment.append(createRecipeCard(p,{status:pantryStatus,shoppingItems:pantryMode&&p.pantryMissing===1 ? pantryScore(p,new Set(pantryTerms())).missing : []}));
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
  pantrySearch.addEventListener('click',()=>{const pantry=new Set(pantryTerms());writePantry(pantry);pantryMode=pantry.size>0;pantryClear.hidden=!pantryMode;display();});
  pantryInput.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();pantrySearch.click();}});
  pantryClear.addEventListener('click',()=>{pantryMode=false;pantryClear.hidden=true;display();});
  savedFilter.addEventListener('click', () => { savedFilter.setAttribute('aria-pressed', String(savedFilter.getAttribute('aria-pressed') !== 'true')); display(); });
  document.querySelector('#clear-filters').addEventListener('click', () => { input.value=''; category.value=''; calorie.value=''; alcohol.value=''; time.value=''; spirit.value=''; flavor.value=''; sort.value='newest'; savedFilter.setAttribute('aria-pressed','false'); pantryMode=false; pantryInput.value=[...readPantry()].join(', '); pantryClear.hidden=true; display(); input.focus(); });
  fetch(input.dataset.index).then(response => { if (!response.ok) throw Error('Search unavailable'); return response.json(); }).then(data => { entries = data; display(); }).catch(() => { status.textContent = 'Search could not load. Refresh to retry, or browse All recipes in the footer.'; });
}


renderRecipeShoppingButtons=()=>{
  document.querySelectorAll('[data-add-recipe-missing]').forEach(button=>{
    const recipe=button.closest('.recipe');
    const data=recipe?.querySelector('[data-recipe-pantry]');
    if(!data){button.hidden=true;return;}
    let required=[];
    try{required=JSON.parse(data.textContent||'[]');}catch{}
    const pantry=readPantry(), shopping=readShopping();
    const missing=required.map(value=>String(value).trim().toLowerCase()).filter(Boolean).filter(item=>!pantryCovers(item,pantry));
    const pending=missing.filter(item=>!shoppingHas(item,shopping));
    button.hidden=false;
    if(!missing.length){button.disabled=true;button.textContent='Everything is in My Bar';delete button.dataset.addShopping;}
    else if(!pending.length){button.disabled=true;button.textContent='Missing ingredients are on your list';delete button.dataset.addShopping;}
    else{
      button.disabled=false;
      button.textContent=pending.length===1?'Add 1 missing ingredient':'Add '+pending.length+' missing ingredients';
      button.dataset.addShopping=JSON.stringify(pending);
    }
  });
};
renderRecipeShoppingButtons();

const myBar=document.querySelector('[data-my-bar]');
if(myBar){
  const indexUrl=myBar.dataset.index;
  const savedGrid=myBar.querySelector('[data-bar-saved]');
  const readyGrid=myBar.querySelector('[data-bar-ready]');
  const nearGrid=myBar.querySelector('[data-bar-near]');
  const pantryList=myBar.querySelector('[data-bar-pantry-list]');
  const pantryForm=myBar.querySelector('[data-bar-pantry-form]');
  const pantryInput=myBar.querySelector('#bar-pantry-input');
  const clearPantry=myBar.querySelector('[data-bar-clear-pantry]');
  const savedCount=myBar.querySelector('[data-bar-saved-count]');
  const pantryCount=myBar.querySelector('[data-bar-pantry-count]');
  const readyCount=myBar.querySelector('[data-bar-ready-count]');
  const readyStatus=myBar.querySelector('[data-bar-ready-status]');
  const shoppingList=myBar.querySelector('[data-shopping-list]');
  const shoppingActions=myBar.querySelector('[data-shopping-actions]');
  const shoppingForm=myBar.querySelector('[data-shopping-add-form]');
  const shoppingInput=myBar.querySelector('#shopping-add-input');
  const shoppingToPantry=myBar.querySelector('[data-shopping-to-pantry]');
  const shoppingRemoveChecked=myBar.querySelector('[data-shopping-remove-checked]');
  const shoppingClear=myBar.querySelector('[data-shopping-clear]');
  const shoppingCount=myBar.querySelector('[data-bar-shopping-count]');
  const onboarding=myBar.querySelector('[data-bar-onboarding]');
  let entries=[];

  const renderEmpty=(grid,message)=>{const p=document.createElement('p');p.className='empty-state';p.textContent=message;grid.replaceChildren(p);};
  const renderPantry=pantry=>{
    const fragment=document.createDocumentFragment();
    [...pantry].sort().forEach(item=>{
      const chip=document.createElement('button');chip.type='button';chip.className='pantry-chip';chip.dataset.removePantry=item;
      chip.textContent=item+' ×';chip.setAttribute('aria-label','Remove '+item+' from My Bar');fragment.append(chip);
    });
    pantryList.replaceChildren(fragment);
    clearPantry.hidden=pantry.size===0;
  };
  const renderShopping=()=>{
    const shopping=readShopping(), checked=readShoppingChecked();
    const fragment=document.createDocumentFragment();
    [...shopping].sort().forEach(item=>{
      const row=document.createElement('div');row.className='shopping-item';
      const label=document.createElement('label');
      const box=document.createElement('input');box.type='checkbox';box.dataset.shoppingCheck=item;box.checked=checked.has(item);
      const text=document.createElement('span');text.textContent=item;
      label.append(box,text);
      const remove=document.createElement('button');remove.type='button';remove.className='quiet-button';remove.dataset.removeShopping=item;remove.textContent='Remove';
      row.append(label,remove);fragment.append(row);
    });
    if(shopping.size) shoppingList.replaceChildren(fragment);
    else {const empty=document.createElement('p');empty.className='shopping-empty';empty.textContent='Your shopping list is empty. Add missing ingredients from a recipe or type an item above.';shoppingList.replaceChildren(empty);}
    shoppingActions.hidden=shopping.size===0;
    shoppingCount.textContent=String(shopping.size);
  };
  renderMyBar=()=>{
    if(!entries.length)return;
    const pantry=readPantry();
    const shopping=readShopping();
    const savedRecipes=entries.filter(recipe=>saved.has(recipe.url));
    const scored=entries.map(recipe=>({recipe,...pantryScore(recipe,pantry)})).filter(item=>item.matched.length>0);
    const ready=scored.filter(item=>item.missing.length===0).sort((a,b)=>b.matched.length-a.matched.length);
    const near=scored.filter(item=>item.missing.length===1).sort((a,b)=>b.matched.length-a.matched.length);

    savedCount.textContent=String(savedRecipes.length);pantryCount.textContent=String(pantry.size);readyCount.textContent=String(ready.length);
    if(onboarding) onboarding.hidden=Boolean(savedRecipes.length||pantry.size||shopping.size);
    renderPantry(pantry);
    renderShopping();
    updateNavBarBadge();

    if(ready.length){
      readyGrid.replaceChildren(...ready.slice(0,6).map(item=>createRecipeCard(item.recipe,{status:'Ready with your ingredients'})));
      readyStatus.textContent=ready.length+' recipe'+(ready.length===1?'':'s')+' match everything currently in My Bar.';
    }else{
      renderEmpty(readyGrid,pantry.size?'Nothing is a complete match yet. Add another ingredient and this list will update.':'Add a few bottles, mixers or juices to My Bar to start matching recipes.');
      readyStatus.textContent=pantry.size?'No complete matches yet.':'Add ingredients above and we’ll match them against the recipe collection.';
    }

    if(near.length){
      nearGrid.replaceChildren(...near.slice(0,6).map(item=>createRecipeCard(item.recipe,{status:'Add: '+item.missing[0],shoppingItems:item.missing,shoppingLabel:'Add '+item.missing[0]+' to shopping list'})));
    }else{
      renderEmpty(nearGrid,pantry.size?'No one-ingredient-away matches right now.':'Your near matches will appear here once you add ingredients.');
    }

    if(savedRecipes.length) savedGrid.replaceChildren(...savedRecipes.map(recipe=>{const score=pantryScore(recipe,pantry);return createRecipeCard(recipe,{shoppingItems:score.missing});}));
    else renderEmpty(savedGrid,'You have not saved any recipes yet. Use Save on any drink and it will appear here.');
    updateSaveButtons();
  };

  pantryForm.addEventListener('submit',event=>{
    event.preventDefault();
    const additions=pantryInput.value.split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
    if(!additions.length)return;
    const pantry=readPantry();const before=pantry.size;additions.forEach(item=>pantry.add(item));writePantry(pantry);pantryInput.value='';renderMyBar();showToast((pantry.size-before)+' item'+(pantry.size-before===1?'':'s')+' added to My Bar.','success');
  });
  pantryList.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-pantry]');if(!button)return;
    const pantry=readPantry();pantry.delete(button.dataset.removePantry);writePantry(pantry);renderMyBar();showToast('Removed from My Bar.');
  });
  clearPantry.addEventListener('click',()=>{writePantry(new Set());renderMyBar();showToast('My Bar pantry cleared.');});
  shoppingForm.addEventListener('submit',event=>{
    event.preventDefault();
    const item=shoppingInput.value.trim().toLowerCase();if(!item)return;
    const added=addShoppingItems([item]);shoppingInput.value='';renderMyBar();showToast(added?'Added to shopping list.':'Already in My Bar or shopping list.',added?'success':'default');
  });
  shoppingList.addEventListener('change',event=>{
    const box=event.target.closest('[data-shopping-check]');if(!box)return;
    const checked=readShoppingChecked();
    box.checked?checked.add(box.dataset.shoppingCheck):checked.delete(box.dataset.shoppingCheck);
    writeShoppingChecked(checked);
  });
  shoppingList.addEventListener('click',event=>{
    const button=event.target.closest('[data-remove-shopping]');if(!button)return;
    const shopping=readShopping(),checked=readShoppingChecked();
    shopping.delete(button.dataset.removeShopping);checked.delete(button.dataset.removeShopping);
    writeShopping(shopping);writeShoppingChecked(checked);renderMyBar();showToast('Removed from shopping list.');
  });
  shoppingToPantry.addEventListener('click',()=>{
    const shopping=readShopping(),checked=readShoppingChecked(),pantry=readPantry();
    let moved=0;checked.forEach(item=>{if(shopping.has(item)){pantry.add(item);shopping.delete(item);moved+=1;}});
    writePantry(pantry);writeShopping(shopping);writeShoppingChecked(new Set());renderMyBar();showToast(moved ? 'Moved '+moved+' item'+(moved===1?'':'s')+' to My Bar.' : 'Select items to move.',moved?'success':'default');
  });
  shoppingRemoveChecked.addEventListener('click',()=>{
    const shopping=readShopping(),checked=readShoppingChecked();
    const removed=checked.size;checked.forEach(item=>shopping.delete(item));writeShopping(shopping);writeShoppingChecked(new Set());renderMyBar();showToast(removed ? 'Removed '+removed+' checked item'+(removed===1?'':'s')+'.' : 'Select items to remove.');
  });
  shoppingClear.addEventListener('click',()=>{writeShopping(new Set());writeShoppingChecked(new Set());renderMyBar();showToast('Shopping list cleared.');});
  fetch(indexUrl).then(response=>{if(!response.ok)throw Error();return response.json();}).then(data=>{entries=data;renderMyBar();}).catch(()=>{
    renderEmpty(savedGrid,'My Bar could not load the recipe collection. Refresh to retry.');
    renderEmpty(readyGrid,'Recipe matching is temporarily unavailable.');
    renderEmpty(nearGrid,'Recipe matching is temporarily unavailable.');
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
