"""Build the editable Better Sweet Drinks content into a static website."""
import json,os,re,shutil,math,html,zipfile,hashlib
from pathlib import Path
from urllib.parse import urlsplit
from datetime import date
import yaml,markdown
from bs4 import BeautifulSoup,NavigableString
from jinja2 import Environment,FileSystemLoader,select_autoescape

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'dist'
def read(path):return json.loads((ROOT/path).read_text())
site=read('data/site.json'); BASE=os.getenv('SITE_URL',site['url']).rstrip('/')
seasonal_hubs=read('data/seasonal_hubs.json')
PREFIX=urlsplit(BASE).path.rstrip('/'); PRODUCTION=os.getenv('PRODUCTION','false').lower()=='true'
def link(path):return PREFIX+'/'+path.lstrip('/')
def absolute(path):return BASE+'/'+path.lstrip('/')
if OUT.exists():shutil.rmtree(OUT)
OUT.mkdir(parents=True)
for archive in sorted((ROOT/'assets').glob('legacy-media-*.zip')):
    with zipfile.ZipFile(archive) as z:
        for entry in z.infolist():
            target=(OUT/entry.filename).resolve()
            if not target.is_relative_to(OUT.resolve()):raise ValueError('Unsafe media archive path')
        z.extractall(OUT)
shutil.copytree(ROOT/'public',OUT,dirs_exist_ok=True)
env=Environment(loader=FileSystemLoader(ROOT/'templates'),autoescape=select_autoescape(['html']))
site['url']=BASE
env.globals.update(site=site,link=link,year=date.today().year,preview=not PRODUCTION)
global_schemas=[
    {'@context':'https://schema.org','@type':'WebSite','name':site['title'],'url':BASE+'/',
     'description':site['description'],'potentialAction':{'@type':'SearchAction','target':BASE+'/search/?q={search_term_string}','query-input':'required name=search_term_string'}},
    {'@context':'https://schema.org','@type':'Organization','name':site['title'],'url':BASE+'/',
     **({'logo':absolute(site['logo'])} if site.get('logo','').startswith('/') else ({'logo':site['logo']} if site.get('logo') else {}))}
]
env.globals['global_schemas']=global_schemas
def image_srcset(path):
    original=OUT/path.lstrip('/')
    variants={}
    base_stem=re.sub(r'-\d+x\d+$','',original.stem)
    for candidate in original.parent.glob(base_stem+'-*x*'+original.suffix):
        match=re.search(r'-(\d+)x(\d+)$',candidate.stem)
        if not match:continue
        width=int(match.group(1))
        if 240<=width<=1600:variants[width]=candidate
    return ', '.join(f"{link('/'+str(candidate.relative_to(OUT)))} {width}w" for width,candidate in sorted(variants.items()))
env.globals['image_srcset']=image_srcset
def asset_link(path):
    fingerprint=hashlib.sha256((OUT/path.lstrip('/')).read_bytes()).hexdigest()[:12]
    return link(path)+'?v='+fingerprint
env.globals['asset_link']=asset_link
docs=[]
for kind in ['posts','pages']:
    for p in (ROOT/'content'/kind).glob('*.md'):
        parts=p.read_text().split('---',2);d=yaml.safe_load(parts[1])
        if d.get('draft'):continue
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]*',d['slug']):raise ValueError('Unsafe slug: '+d['slug'])
        d.update(kind=kind,body=markdown.markdown(parts[2],extensions=['extra','sane_lists','toc']),url='/'+d['slug']+'/')
        # Restore WordPress table-of-contents anchors lost during HTML-to-Markdown conversion.
        body=BeautifulSoup(d['body'],'html.parser')
        normalize=lambda value:' '.join(value.split()).casefold()
        for anchor in body.select('a[href^="#"]'):
            old_id=anchor['href'][1:]
            if not old_id or body.find(id=old_id):continue
            matching=[h for h in body.find_all(re.compile('^h[1-6]$')) if normalize(h.get_text(' ',strip=True))==normalize(anchor.get_text(' ',strip=True))]
            if len(matching)==1:
                marker=body.new_tag('span',id=old_id);matching[0].insert_before(marker)
        # Separate imported bold labels that run directly into the next sentence.
        for strong in body.find_all('strong'):
            following=strong.next_sibling
            if isinstance(following,NavigableString) and following and following[0].isupper() and len(strong.get_text())>5:
                following.replace_with(' '+str(following))
        # Build a real table of contents while retaining all original heading anchors.
        d['toc']=[]
        used_ids={el.get('id') for el in body.select('[id]')}
        for index,heading in enumerate(body.find_all('h2'),1):
            if not heading.get('id'):
                hid=f'section-{index}'
                while hid in used_ids:hid+='-section'
                heading['id']=hid;used_ids.add(hid)
            d['toc'].append({'id':heading['id'],'title':heading.get_text(' ',strip=True)})
        d['readingMinutes']=max(1,math.ceil(len(body.get_text(' ',strip=True).split())/220))
        for index,img in enumerate(body.find_all('img')):
            # The first editorial image is often visible before any scrolling.
            # Give known WordPress derivatives intrinsic size to reserve space.
            img['loading']='eager' if index==0 else 'lazy'
            img['decoding']='async'
            if index==0:img['fetchpriority']='high'
            match=re.search(r'-(\d+)x(\d+)\.[a-z0-9]+(?:\?|$)',img.get('src',''),re.I)
            if match and not img.has_attr('width') and not img.has_attr('height'):
                img['width'],img['height']=match.groups()
        d['body']=str(body)
        docs.append(d)
# Convert standalone WordPress embed URLs into useful links on the static site.
titles={d['url']:d['title'] for d in docs}
for d in docs:
    body=BeautifulSoup(d['body'],'html.parser')
    for paragraph in body.find_all('p'):
        value=paragraph.get_text(strip=True)
        if paragraph.find(True) or not re.fullmatch(r'https?://(?:www\.)?bettersweetdrinks\.com/[^\s]+',value):continue
        target=urlsplit(value)
        anchor=body.new_tag('a',href=target.path+('?' + target.query if target.query else '')+('#'+target.fragment if target.fragment else ''))
        anchor.string=titles.get(target.path,value)
        paragraph.clear();paragraph.append(anchor)
    d['body']=str(body)
posts=sorted([d for d in docs if d['kind']=='posts'],key=lambda d:(str(d['publishDate']),int(d['id'])),reverse=True)
recipes={p.stem:json.loads(p.read_text()) for p in (ROOT/'content/recipes').glob('*.json')}
ingredient_profiles=read('data/ingredient_profiles.json')['profiles']
comments=read('data/comments.json');tax=read('data/taxonomies.json');redirects=read('data/redirects.json')

FRACTIONS={'½':' 1/2','¼':' 1/4','¾':' 3/4','⅓':' 1/3','⅔':' 2/3','⅛':' 1/8','⅜':' 3/8','⅝':' 5/8','⅞':' 7/8'}
UNIT_ML={'ml':1,'milliliter':1,'milliliters':1,'cl':10,'ounce':29.5735,'ounces':29.5735,'oz':29.5735,
         'cup':240,'cups':240,'tablespoon':15,'tablespoons':15,'tbsp':15,'teaspoon':5,'teaspoons':5,'tsp':5,
         'shot':44,'shots':44,'part':30,'parts':30,'dash':0.9,'dashes':0.9,'scoop':120,'scoops':120}
UNIT_PATTERN='|'.join(sorted((re.escape(v) for v in UNIT_ML),key=len,reverse=True))
AMOUNT_RE=re.compile(r'(?<![\w.])(\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)\s*(?:of\s+)?('+UNIT_PATTERN+r')\b',re.I)
ALCOHOL_HINT_RE=re.compile(r'\b(vodka|gin|rum|tequila|whisk(?:e)?y|bourbon|brandy|cognac|liqueur|schnapps|vermouth|aperol|campari|prosecco|champagne|wine|beer|lager|ale|cachaca|cachaça|sake|sherry|absinthe)\b',re.I)

def number_value(value):
    value=value.strip()
    if ' ' in value and '/' in value:
        whole,fraction=value.split(None,1);return float(whole)+number_value(fraction)
    if '/' in value:
        a,b=value.split('/',1);return float(a)/float(b)
    return float(value)

def ingredient_amount_ml(value):
    normalized=str(value)
    for symbol,replacement in FRACTIONS.items():normalized=normalized.replace(symbol,replacement)
    match=AMOUNT_RE.search(normalized)
    return number_value(match.group(1))*UNIT_ML[match.group(2).lower()] if match else None

def ingredient_profile(value):
    # Explanatory text after a colon/parenthesis can mention another ingredient.
    # Match the actual ingredient label first so "Prosecco ... Aperol" stays Prosecco.
    core=str(value).lower().split(':',1)[0].split('(',1)[0]
    matches=[]
    for profile in ingredient_profiles:
        for term in profile['match']:
            if re.search(r'(?<!\\w)'+re.escape(term.lower())+r'(?!\\w)',core):
                matches.append((len(term),profile))
    return max(matches,key=lambda item:item[0])[1] if matches else None

def recipe_yield_count(value):
    match=re.search(r'\d+(?:\.\d+)?',str(value or ''))
    return max(1.0,float(match.group())) if match else 1.0

def estimate_recipe(recipe):
    calories=ethanol_ml=liquid_ml=0.0
    mapped=quantified=0
    skip_remainder=False
    ingredient_text=' '.join(str(v) for v in recipe.get('ingredients',[]))
    for raw in recipe.get('ingredients',[]):
        line=' '.join(str(raw).split()); lower=line.lower()
        # Imported recipes sometimes include a complete syrup/garnish sub-recipe after
        # the drink itself. Do not count that batch when only a small amount is used.
        if mapped and (re.match(r'^(?:diy|homemade)\b.*syrup',lower) or
                       (not re.search(r'\d',lower) and re.search(r'(?:optional|garnish|topping|rim)\s*:?\s*$',lower))):
            skip_remainder=True
        if skip_remainder:continue
        if 'for garnish' in lower or lower.startswith(('garnish','optional')):continue
        amount=ingredient_amount_ml(line)
        if amount is None:continue
        quantified+=1
        profile=ingredient_profile(line)
        if not profile:continue
        mapped+=1
        calories+=amount*float(profile.get('kcalPer100ml',0))/100
        if profile.get('liquid',True):
            liquid_ml+=amount
            ethanol_ml+=amount*float(profile.get('abv',0))/100
    coverage=mapped/quantified if quantified else 0
    servings=recipe_yield_count(recipe.get('yield'))
    manual_nutrition=recipe.get('nutrition') or {}
    manual_cal_value=recipe.get('calories') if recipe.get('calories') not in (None,'') else manual_nutrition.get('calories','')
    manual_cal_match=re.search(r'\d+(?:\.\d+)?',str(manual_cal_value))
    manual_calories=round(float(manual_cal_match.group())) if manual_cal_match else None
    estimated_calories=round(calories/servings) if coverage>=0.6 and mapped else None
    calories_per_serving=manual_calories if manual_calories is not None else estimated_calories

    manual_abv=recipe.get('abv')
    try:manual_abv=float(manual_abv) if manual_abv not in (None,'') else None
    except (TypeError,ValueError):manual_abv=None
    abv=None
    if manual_abv is not None:
        abv=round(manual_abv,1)
    elif liquid_ml and coverage>=0.6:
        # Account for typical water picked up from ice during preparation.
        instructions=BeautifulSoup(recipe.get('instructions',''),'html.parser').get_text(' ',strip=True).lower()
        if ethanol_ml:
            dilution=0.25 if 'shake' in instructions else 0.20 if 'stir' in instructions else 0.15 if 'blend' in instructions else 0.10 if 'ice' in ingredient_text.lower() else 0
        else:dilution=0
        abv=round(100*ethanol_ml/(liquid_ml*(1+dilution)),1)
        if abv==0 and ALCOHOL_HINT_RE.search(ingredient_text):abv=None

    band=None
    if calories_per_serving is not None:
        band='under-100' if calories_per_serving<100 else '100-199' if calories_per_serving<200 else '200-plus'
    return {'estimatedCalories':calories_per_serving,'estimatedAbv':abv,'calorieBand':band,
            'caloriesEstimated':manual_calories is None and calories_per_serving is not None,
            'abvEstimated':manual_abv is None and abv is not None,'estimateCoverage':round(coverage,2)}

for recipe in recipes.values():
    recipe.update(estimate_recipe(recipe))
    recipe['servingCount']=recipe_yield_count(recipe.get('yield'))

def duration_minutes(value):
    match=re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?',str(value or '').upper())
    if not match:return None
    hours,minutes,seconds=(int(v or 0) for v in match.groups())
    return hours*60+minutes+(1 if seconds>=30 else 0)

SPIRIT_GROUPS=[
    ('vodka',['vodka']),('gin',['gin']),('rum',['rum','cachaça','cachaca']),
    ('tequila',['tequila','mezcal']),('whiskey',['whiskey','whisky','bourbon','rye']),
    ('brandy',['brandy','cognac']),('wine',['prosecco','champagne','wine','vermouth']),
    ('liqueur',['liqueur','aperol','campari','amaretto','schnapps','curacao','curaçao'])
]
PANTRY_STOP={'fresh','chilled','optional','garnish','garnishes','ice','water','to','taste','for','and','or','plus','of','the','a','an','oz','ounce','ounces','ml','milliliter','milliliters','cup','cups','tbsp','tablespoon','tablespoons','tsp','teaspoon','teaspoons'}

def recipe_discovery_meta(recipe):
    ingredient_text=' '.join(str(v).lower() for v in recipe.get('ingredients',[]))
    spirit='none'
    for name,terms in SPIRIT_GROUPS:
        if any(re.search(r'(?<!\w)'+re.escape(term)+r'(?!\w)',ingredient_text) for term in terms):
            spirit=name;break
    abv=recipe.get('estimatedAbv')
    alcohol_type='non-alcoholic' if abv is not None and float(abv)==0 else 'alcoholic' if abv is not None and float(abv)>0 else ('alcoholic' if ALCOHOL_HINT_RE.search(ingredient_text) else 'unknown')
    flavors=[]
    flavor_rules={
        'fruity':['berry','blackberry','blueberry','strawberry','raspberry','mango','pineapple','peach','apple','orange','grapefruit','lemon','lime','watermelon','cherry'],
        'coffee':['coffee','espresso','cold brew'],
        'creamy':['cream','milk','half-and-half','coconut cream','ice cream'],
        'fizzy':['soda','sparkling','prosecco','champagne','ginger beer','ginger ale','tonic'],
        'citrus':['lemon','lime','orange','grapefruit'],
        'sweet':['syrup','honey','caramel','chocolate','cookie butter']
    }
    for flavor,terms in flavor_rules.items():
        if any(term in ingredient_text for term in terms):flavors.append(flavor)
    pantry=[]
    for raw in recipe.get('ingredients',[]):
        raw_lower=str(raw).lower()
        if 'for garnish' in raw_lower or raw_lower.startswith(('garnish','optional','ice ')) or raw_lower in {'ice','ice cubes'}:continue
        text=re.sub(r'^\s*(?:\d+(?:[./]\d+)?|\d+\s+\d+/\d+|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(?:oz|ounce|ounces|ml|milliliters?|cl|cups?|tbsp|tablespoons?|tsp|teaspoons?|shots?|parts?|dashes?|scoops?)?\s*','',raw_lower)
        text=re.sub(r'\([^)]*\)',' ',text)
        words=[w for w in re.findall(r"[a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ'-]+",text) if w not in PANTRY_STOP]
        phrase=' '.join(words[:4]).strip()
        if phrase:pantry.append(phrase)
    return {'timeMinutes':duration_minutes(recipe.get('totalTime') or recipe.get('prepTime')),
            'alcoholType':alcohol_type,'baseSpirit':spirit,'flavorTags':flavors,'pantryIngredients':pantry}
for recipe in recipes.values():recipe.update(recipe_discovery_meta(recipe))

def heading_key(value):
    return re.sub(r'[^a-z0-9]+',' ',str(value).lower()).strip()

def section_after_heading(heading):
    level=int(heading.name[1])
    nodes=[]
    current=heading.next_sibling
    while current is not None:
        next_node=current.next_sibling
        name=getattr(current,'name',None)
        if name and re.fullmatch(r'h[1-6]',name) and int(name[1])<=level:break
        nodes.append(current)
        current=next_node
    return nodes

def remove_heading_section(heading,keep_html=False):
    nodes=section_after_heading(heading)
    content=''.join(str(node) for node in nodes).strip() if keep_html else ''
    heading.decompose()
    for node in nodes:
        try:node.extract()
        except AttributeError:pass
    return content

def remove_ingredient_block(heading):
    anchor=heading.get('id','')
    level=int(heading.name[1])
    current=heading.next_sibling
    heading.decompose()
    while current is not None:
        next_node=current.next_sibling
        name=getattr(current,'name',None)
        if name and re.fullmatch(r'h[1-6]',name) and int(name[1])<=level:break
        # Legacy imports sometimes wrap later sub-sections inside blockquotes/divs.
        # Stop before any container that already contains another heading so we only
        # remove the ingredient list/table itself.
        if hasattr(current,'find_all') and current.find(['h1','h2','h3','h4','h5','h6']):break
        try:current.extract()
        except AttributeError:pass
        current=next_node
    return anchor

def prepare_recipe_editorial(doc):
    if not doc.get('recipeIds'):return
    primary=recipes.get(str(doc['recipeIds'][0]))
    if not primary:return
    body=BeautifulSoup(doc.get('body',''),'html.parser')

    # Use the opening editorial paragraph as the concise hero description, then remove
    # it from the lower article so readers do not see the same intro twice.
    intro=''
    for node in list(body.contents):
        name=getattr(node,'name',None)
        if name and re.fullmatch(r'h[1-6]',name):break
        if name=='p' and node.get_text(' ',strip=True):
            intro=str(node);node.decompose();break
    doc['recipeIntro']=intro or '<p>'+html.escape(doc.get('description',''))+'</p>'

    # The recipe hero owns the main drink image. Remove a matching inline copy from
    # migrated article content to avoid showing the same photo again a few lines later.
    image_targets={str(primary.get('image') or ''),str(doc.get('featuredImage') or '')}-{''}
    for img in list(body.find_all('img')):
        if img.get('src','') not in image_targets:continue
        parent=img.parent
        if getattr(parent,'name',None) in ('p','figure') and not parent.get_text(' ',strip=True):
            parent.decompose()
        else:img.decompose()
        break

    # Remove imported hand-written tables of contents near the top. The site creates
    # its own TOC later, and keeping both creates broken links when recipe sections move.
    for node in list(body.contents):
        name=getattr(node,'name',None)
        if name and re.fullmatch(r'h[1-6]',name):break
        if name in ('ol','ul'):
            anchors=node.find_all('a',href=re.compile(r'^#'))
            if len(anchors)>=2:node.decompose()

    # Extract the complete method section first so nested headings/tips stay together.
    method_heading=None
    for heading in list(body.find_all(re.compile(r'^h[2-4]$'))):
        key=heading_key(heading.get_text(' ',strip=True))
        if key in {'instructions','directions','method','steps'} or key.startswith('how to make'):
            method_heading=heading;break

    method_html=''
    doc['recipeMethodAnchor']=''
    doc['recipeIngredientAnchor']=''
    if method_heading is not None:
        doc['recipeMethodAnchor']=method_heading.get('id','')
        method_html=remove_heading_section(method_heading,keep_html=True)
        method_soup=BeautifulSoup(method_html,'html.parser')
        for heading in list(method_soup.find_all(re.compile(r'^h[2-5]$'))):
            key=heading_key(heading.get_text(' ',strip=True))
            if key=='ingredients' or key.startswith('ingredients '):
                doc['recipeIngredientAnchor']=remove_ingredient_block(heading)
                break
        # Keep the recipe method concise. Legacy articles often bundled bottle
        # comparisons, serving ideas and tips inside one giant "How to make" section.
        # Pull the actual ordered steps into the recipe workspace and return the rest
        # to the editorial article below it.
        method_core=method_soup.find('ol')
        if method_core is not None:
            method_html=str(method_core)
            method_core.decompose()
        else:
            step_nodes=[p for p in method_soup.find_all('p',recursive=True) if re.match(r'^\s*step\s*\d+',p.get_text(' ',strip=True),re.I)]
            if step_nodes:
                method_html=''.join(str(node) for node in step_nodes)
                for node in step_nodes:node.decompose()
            else:
                method_html=''
        # Remove any legacy Instructions/Step-by-step block left behind after the
        # concise method was extracted, preventing the same directions appearing twice.
        for heading in list(method_soup.find_all(re.compile(r'^h[2-5]$'))):
            key=heading_key(heading.get_text(' ',strip=True))
            if key in {'instructions','directions','steps'} or 'step by step' in key:
                remove_heading_section(heading)
        remainder=str(method_soup).strip()
        if BeautifulSoup(remainder,'html.parser').get_text(' ',strip=True):
            remainder_soup=BeautifulSoup(remainder,'html.parser')
            for node in reversed(list(remainder_soup.contents)):
                body.insert(0,node)

    # Some shorter recipes put Ingredients before How-to as a separate top-level block.
    # Remove only that ingredient block, leaving the rest of the editorial article intact.
    ingredient_heading=None
    for heading in list(body.find_all(re.compile(r'^h[2-4]$'))):
        key=heading_key(heading.get_text(' ',strip=True))
        if key=='ingredients' or key.startswith('ingredients '):
            ingredient_heading=heading;break
    if ingredient_heading is not None:
        anchor=remove_ingredient_block(ingredient_heading)
        if anchor:doc['recipeIngredientAnchor']=anchor

    doc['recipeMethod']=method_html or primary.get('instructions','')
    doc['recipeMethodFromArticle']=bool(method_html)

    # Rebuild the TOC from only the remaining editorial material. Ingredients and the
    # method now have dedicated, prominent UI and should not appear twice in navigation.
    doc['toc']=[]
    used_ids={el.get('id') for el in body.select('[id]')}
    for index,heading in enumerate(body.find_all('h2'),1):
        if not heading.get('id'):
            hid=f'editorial-section-{index}'
            while hid in used_ids:hid+='-section'
            heading['id']=hid;used_ids.add(hid)
        doc['toc'].append({'id':heading['id'],'title':heading.get_text(' ',strip=True)})
    doc['body']=str(body).strip()
    doc['hasEditorialBody']=bool(body.get_text(' ',strip=True) or body.find(['img','table','ul','ol','blockquote']))

for doc in docs:prepare_recipe_editorial(doc)

related_stopwords={'recipe','recipes','drink','drinks','cocktail','cocktails','homemade','copycat','easy','make','with','without','how','the','and','for','from','best','iced','cold','ice','water','fresh','optional','garnish','chilled','syrup'}
def related_words(value):return set(re.findall(r'[a-z]{4,}',value.lower()))-related_stopwords
for p in posts:
    p['titleWords']=related_words(p['title'])
    p['ingredientWords']=related_words(' '.join(' '.join(recipes[str(rid)]['ingredients']) for rid in p['recipeIds']))
    primary=recipes.get(str(p['recipeIds'][0])) if p.get('recipeIds') else None
    p['calories']=primary.get('estimatedCalories') if primary else None
    p['abv']=primary.get('estimatedAbv') if primary else None
    p['calorieBand']=primary.get('calorieBand') if primary else None
    p['timeMinutes']=primary.get('timeMinutes') if primary else None
    p['alcoholType']=primary.get('alcoholType') if primary else 'unknown'
    p['baseSpirit']=primary.get('baseSpirit') if primary else 'none'
    p['flavorTags']=primary.get('flavorTags',[]) if primary else []
    p['pantryIngredients']=primary.get('pantryIngredients',[]) if primary else []
def related_posts(post):
    ranked=[]
    for candidate in posts:
        if candidate['id']==post['id'] or not set(candidate['categories'])&set(post['categories']):continue
        score=(8*len(set(candidate['tags'])&set(post['tags']))
               +4*len(candidate['titleWords']&post['titleWords'])
               +len(candidate['ingredientWords']&post['ingredientWords']))
        if score:ranked.append((score,candidate))
    ranked.sort(key=lambda item:item[0],reverse=True)
    return [candidate for _,candidate in ranked[:3]]
categories=[t for t in tax['category'] if any(t['slug'] in p['categories'] for p in posts)]
env.globals['categories']=categories
env.globals['article_count']=len(posts)
for p in posts:
    p['displayTitle']=re.split(r'\s*[|]\s*',p['title'])[0]
    p['displayTitle']=re.sub(r'\s*[-–]\s*Better\s*Sweet\s*Drinks.*$','',p['displayTitle'],flags=re.I)
    p['cardImage']=p['featuredImage']
    original=OUT/p['featuredImage'].lstrip('/')
    thumb=original.with_name(original.stem+'-480x480'+original.suffix)
    if thumb.exists():p['cardImage']='/'+str(thumb.relative_to(OUT))
urls=[]
def render(path,template,**kw):
    target=OUT/path.strip('/')/'index.html' if path!='/' else OUT/'index.html'
    if target.exists():raise ValueError('Duplicate output: '+path)
    target.parent.mkdir(parents=True,exist_ok=True)
    canonical=kw.pop('canonical',absolute(path)); noindex=kw.pop('noindex',False) or not PRODUCTION
    raw_title=kw.pop('title',site['title'])
    title=re.sub(r'\s*[-|–]\s*Better\s*Sweet\s*Drinks.*$','',raw_title,flags=re.I).strip()
    description=BeautifulSoup(kw.pop('description',site['description']),'html.parser').get_text(' ',strip=True)
    if len(description)>160:description=description[:157].rsplit(' ',1)[0]+'…'
    output=env.get_template(template).render(canonical=canonical,noindex=noindex,path=path,title=title,description=description,**kw)
    # Rebase original WordPress root URLs for GitHub project previews.
    if PREFIX:
        output=re.sub(r'((?:href|src|action)=\")/(?!/)',lambda m:m[1]+PREFIX+'/' ,output)
        output=output.replace(PREFIX+PREFIX+'/',PREFIX+'/')
    target.write_text(output)
    if not noindex:urls.append(canonical)
for d in docs:
    cards=[];schemas=[]
    for rid in d['recipeIds']:
        r=dict(recipes[str(rid)])
        if not r['ingredients'] or not r['instructions']:raise ValueError('Incomplete linked recipe '+str(rid))
        soup=BeautifulSoup(r['instructions'],'html.parser');steps=soup.find_all('li') or soup.find_all('p')
        instructions=[]
        for i,step in enumerate(steps,1):
            step['id']=f'recipe-{rid}-step-{i}'
            text_value=step.get_text(' ',strip=True)
            if not text_value:continue
            instructions.append({'@type':'HowToStep','name':f'Step {i}','text':text_value})
        # Keep only meaningful ingredient strings. Empty/one-character values trigger
        # Recipe rich-result validation warnings and are not useful to readers.
        clean_ingredients=[' '.join(str(v).split()) for v in r.get('ingredients',[]) if len(' '.join(str(v).split()))>=2]
        r['ingredients']=clean_ingredients
        r['instructions']=str(soup)
        # Build a nutrition object for visible details and Recipe JSON-LD. Manual
        # nutrition wins; otherwise add only the calorie value we can estimate.
        nutrition=dict(r.get('nutrition') or {})
        if r.get('estimatedCalories') is not None and not nutrition.get('calories'):
            nutrition['@type']='NutritionInformation'
            nutrition['calories']=str(r['estimatedCalories'])+' kcal'
        r['nutrition']=nutrition
        cards.append(r)
        author_name=r['author'] or d['author']
        recipe_category=(r.get('category') or ', '.join(d.get('categories',[]))).strip()
        tag_keywords=[str(v).replace('-',' ').strip() for v in d.get('tags',[]) if str(v).strip()]
        recipe_keywords=[v.strip() for v in str(r.get('keywords') or '').split(',') if v.strip()]
        combined_keywords=', '.join(dict.fromkeys(recipe_keywords+tag_keywords))
        schema={'@context':'https://schema.org','@type':'Recipe','name':r['title'],'description':r['description'],'author':{'@type':'Organization' if author_name==site['title'] else 'Person','name':author_name},'recipeIngredient':clean_ingredients,'recipeInstructions':instructions,'recipeYield':r['yield'],'image':absolute(r['image']) if r['image'].startswith('/') else r['image'],'datePublished':str(d['publishDate']),'dateModified':str(d['updatedDate']),'mainEntityOfPage':absolute(d['url']),'recipeCategory':recipe_category,'url':absolute(d['url'])+'#recipe-'+str(rid)}
        if combined_keywords:schema['keywords']=combined_keywords
        if r.get('cuisine'):schema['recipeCuisine']=r['cuisine']
        for k in ['prepTime','cookTime','totalTime','nutrition']:
            if r.get(k):schema[k]=r[k]
        schemas.append(schema)
    schemas.insert(0,{'@context':'https://schema.org','@type':'BlogPosting' if d['kind']=='posts' else 'WebPage','headline':d['title'],'description':d['description'],'datePublished':str(d['publishDate']),'dateModified':str(d['updatedDate']),'author':{'@type':'Organization' if d['author']==site['title'] else 'Person','name':d['author']},'publisher':{'@type':'Organization','name':site['title']},'mainEntityOfPage':{'@type':'WebPage','@id':absolute(d['url'])},'url':absolute(d['url'])})
    crumbs=[{'@type':'ListItem','position':1,'name':'Home','item':BASE+'/'}]
    if d.get('categories'):
        cat=next((c for c in categories if c['slug']==d['categories'][0]),None)
        if cat:crumbs.append({'@type':'ListItem','position':2,'name':cat['name'],'item':absolute('/'+cat['slug']+'/')})
    crumbs.append({'@type':'ListItem','position':len(crumbs)+1,'name':d['title'],'item':absolute(d['url'])})
    schemas.append({'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':crumbs})
    if d['featuredImage']:
        schemas[0]['image']=absolute(d['featuredImage'])
    related=related_posts(d)
    seasonal_links=[hub for hub in seasonal_hubs if hub['tag'] in d.get('tags',[])]
    render(d['url'],'article.html',title=d['seoTitle'],description=d['description'],image=d['featuredImage'],canonical=d.get('canonicalUrl') or absolute(d['url']),noindex=d.get('noindex',False),doc=d,recipes=cards,comments=comments.get(str(d['id']),[]),related=related,seasonal_links=seasonal_links,schemas=schemas)
def listing(path,title,items,description=None,schemas=None,**kwargs):
    description=description or ('Browse '+title.lower()+'. Find ingredients, step-by-step instructions and ideas for your next drink.')
    schemas=[] if schemas is None else list(schemas)
    if items:
        schemas.append({'@context':'https://schema.org','@type':'ItemList','name':title,'numberOfItems':len(items),'itemListElement':[{'@type':'ListItem','position':i+1,'url':absolute(item['url']),'name':item['displayTitle']} for i,item in enumerate(items)]})
    render(path,'listing.html',title=title,description=description,items=items,schemas=schemas,**kwargs)
pages=math.ceil(len(posts)/10)
for n in range(1,pages+1):
    path='/' if n==1 else f'/page/{n}/'
    home_kwargs={}
    if n==1:
        home_kwargs={
            'quick_picks':[p for p in posts if p.get('timeMinutes') is not None and p['timeMinutes']<=10][:4],
            'low_cal_picks':[p for p in posts if p.get('calories') is not None and p['calories']<100][:4],
            'zero_proof_picks':[p for p in posts if p.get('alcoholType')=='non-alcoholic'][:4]
        }
    listing(path,'Latest drink recipes' if n==1 else f'Latest drink recipes — Page {n}',posts[(n-1)*10:n*10],page=n,pages=pages,**home_kwargs)
listing('/recipes/','All drink recipes',posts)
for kind in ['category','post_tag']:
    for term in tax[kind]:
        selected=[p for p in posts if term['slug'] in p['categories' if kind=='category' else 'tags']]
        if selected:listing(('/' if kind=='category' else '/tag/')+term['slug']+'/',term['name'],selected,noindex=kind!='category')
for hub in seasonal_hubs:
    selected=[p for p in posts if hub['tag'] in p['tags']]
    if not selected:continue
    hub_url='/'+hub['slug']+'/'
    hub_schema={'@context':'https://schema.org','@type':'CollectionPage','name':hub['title'],'description':hub['description'],'url':absolute(hub_url)}
    breadcrumb={'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Home','item':BASE+'/'},{'@type':'ListItem','position':2,'name':hub['title'],'item':absolute(hub_url)}]}
    listing(hub_url,hub['title'],selected,description=hub['description'],schemas=[hub_schema,breadcrumb],hub=hub)
for author in sorted({p['authorSlug'] for p in posts}):
    selected=[p for p in posts if p['authorSlug']==author]
    listing('/author/'+author+'/',selected[0]['author'],selected,noindex=True)
render('/search/','search.html',title='Search recipes',description='Find your next drink recipe.',schemas=[],noindex=True)
render('/my-bar/','my_bar.html',title='My Bar',description='Your saved drink recipes and pantry matches.',schemas=[],noindex=True)
render('/moderate-comments/','moderate.html',title='Moderate comments',description='Private comment moderation tool.',schemas=[],noindex=True)
render('/404/','message.html',title='Page not found',description='Try searching for a drink recipe.',schemas=[],noindex=True)
shutil.copy2(OUT/'404/index.html',OUT/'404.html')
for src,dst in redirects.items():
    dest=OUT/src/'index.html';dest.parent.mkdir(exist_ok=True)
    dest.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Recipe moved</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url='+html.escape(link(dst+'/'))+'"><link rel="canonical" href="'+html.escape(absolute(dst+'/'))+'"></head><body><a href="'+html.escape(link(dst+'/'))+'">Continue to recipe</a></body></html>')
(OUT/'_redirects').write_text('\n'.join('/'+s+'/ /'+d+'/ 301' for s,d in redirects.items())+'\n')
search=[{'title':p['title'],'url':link(p['url']),'description':p['description'],'image':link(p['cardImage']) if p['cardImage'] else '',
         'categories':p['categories'],'date':str(p['publishDate']),'calories':p['calories'],'abv':p['abv'],'calorieBand':p['calorieBand'],
         'timeMinutes':p['timeMinutes'],'alcoholType':p['alcoholType'],'baseSpirit':p['baseSpirit'],'flavorTags':p['flavorTags'],'pantryIngredients':p['pantryIngredients'],
         'text':' '.join([p['title'],p['description'],*p['categories'],*[v for rid in p['recipeIds'] for v in recipes[str(rid)]['ingredients']]])} for p in posts]
(OUT/'search-index.json').write_text(json.dumps(search,ensure_ascii=False))
url_lastmod={absolute(d['url']):str(d['updatedDate']) for d in docs if not d.get('noindex',False)}
sitemap_body=''.join('<url><loc>'+html.escape(u)+'</loc>'+('<lastmod>'+html.escape(url_lastmod[u])+'</lastmod>' if u in url_lastmod else '')+'</url>' for u in urls)
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+sitemap_body+'</urlset>')
(OUT/'sitemap_index.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>'+html.escape(BASE+'/sitemap.xml')+'</loc></sitemap></sitemapindex>')
(OUT/'robots.txt').write_text('User-agent: *\n'+('Disallow: /admin/\nDisallow: /search/\nDisallow: /my-bar/\nDisallow: /moderate-comments/\nSitemap: '+BASE+'/sitemap_index.xml\n' if PRODUCTION else 'Disallow: /\n'))
(OUT/'.nojekyll').touch()
if PRODUCTION and urlsplit(BASE).hostname=='bettersweetdrinks.com':(OUT/'CNAME').write_text('bettersweetdrinks.com\n')
repo=os.getenv('GITHUB_REPOSITORY',site.get('repository',''))
admin=OUT/'admin';admin.mkdir(exist_ok=True)
if repo:
    config=yaml.safe_load((ROOT/'cms/config.yml').read_text());config['backend']['repo']=repo;config['site_url']=BASE;config['display_url']=BASE
    (admin/'config.yml').write_text(yaml.safe_dump(config,sort_keys=False))
    shutil.copy2(ROOT/'cms/index.html',admin/'index.html')
else:(admin/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Editor setup pending</title><h1>Editor setup pending</h1><p>The editor will be enabled when this website is connected to its GitHub repository.</p></html>')
print(json.dumps({'articles':len(posts),'pages':len(docs)-len(posts),'recipeCards':sum(len(d['recipeIds']) for d in docs),'recipesWithCalories':sum(1 for r in recipes.values() if r.get('estimatedCalories') is not None),'recipesWithAbv':sum(1 for r in recipes.values() if r.get('estimatedAbv') is not None),'htmlPages':len(list(OUT.rglob('*.html'))),'production':PRODUCTION,'base':BASE}))
