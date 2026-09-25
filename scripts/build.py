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
def image_srcset(path):
    original=OUT/path.lstrip('/')
    variants=[]
    for width in (360,480,720,768,1024):
        # Use the available square derivatives for consistently cropped listing thumbnails.
        candidate=original.with_name(f'{original.stem}-{width}x{width}{original.suffix}')
        if candidate.exists():variants.append(f"{link('/'+str(candidate.relative_to(OUT)))} {width}w")
    return ', '.join(variants)
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
comments=read('data/comments.json');tax=read('data/taxonomies.json');redirects=read('data/redirects.json')
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
            instructions.append({'@type':'HowToStep','text':step.get_text(' ',strip=True),'url':absolute(d['url'])+'#'+step['id']})
        r['instructions']=str(soup);cards.append(r)
        schema={'@context':'https://schema.org','@type':'Recipe','name':r['title'],'description':r['description'],'author':{'@type':'Person','name':r['author'] or d['author']},'recipeIngredient':r['ingredients'],'recipeInstructions':instructions,'recipeYield':r['yield'],'image':absolute(r['image']) if r['image'].startswith('/') else r['image'],'datePublished':str(d['publishDate']),'url':absolute(d['url'])+'#recipe-'+str(rid)}
        for k in ['prepTime','cookTime','totalTime','nutrition','keywords']:
            if r.get(k):schema[k]=r[k]
        schemas.append(schema)
    schemas.insert(0,{'@context':'https://schema.org','@type':'BlogPosting' if d['kind']=='posts' else 'WebPage','headline':d['title'],'description':d['description'],'datePublished':str(d['publishDate']),'dateModified':str(d['updatedDate']),'author':{'@type':'Person','name':d['author']},'url':absolute(d['url'])})
    schemas.append({'@context':'https://schema.org','@type':'BreadcrumbList','itemListElement':[{'@type':'ListItem','position':1,'name':'Home','item':BASE+'/'},{'@type':'ListItem','position':2,'name':d['title'],'item':absolute(d['url'])}]})
    if d['featuredImage']:
        schemas[0]['image']=absolute(d['featuredImage'])
    related=[p for p in posts if p['id']!=d['id'] and set(p['categories'])&set(d['categories'])][:3]
    render(d['url'],'article.html',title=d['seoTitle'],description=d['description'],image=d['featuredImage'],canonical=d.get('canonicalUrl') or absolute(d['url']),noindex=d.get('noindex',False),doc=d,recipes=cards,comments=comments.get(str(d['id']),[]),related=related,schemas=schemas)
def listing(path,title,items,**kwargs):
    render(path,'listing.html',title=title,description=('Browse '+title.lower()+'. Find ingredients, step-by-step instructions and ideas for your next drink.'),items=items,schemas=[],**kwargs)
pages=math.ceil(len(posts)/10)
for n in range(1,pages+1):
    path='/' if n==1 else f'/page/{n}/'
    listing(path,'Latest drink recipes' if n==1 else f'Latest drink recipes — Page {n}',posts[(n-1)*10:n*10],page=n,pages=pages)
listing('/recipes/','All drink recipes',posts)
for kind in ['category','post_tag']:
    for term in tax[kind]:
        selected=[p for p in posts if term['slug'] in p['categories' if kind=='category' else 'tags']]
        if selected:listing(('/' if kind=='category' else '/tag/')+term['slug']+'/',term['name'],selected,noindex=kind!='category')
for author in sorted({p['authorSlug'] for p in posts}):
    selected=[p for p in posts if p['authorSlug']==author]
    listing('/author/'+author+'/',selected[0]['author'],selected,noindex=True)
render('/search/','search.html',title='Search recipes',description='Find your next drink recipe.',schemas=[],noindex=True)
render('/404/','message.html',title='Page not found',description='Try searching for a drink recipe.',schemas=[],noindex=True)
shutil.copy2(OUT/'404/index.html',OUT/'404.html')
for src,dst in redirects.items():
    dest=OUT/src/'index.html';dest.parent.mkdir(exist_ok=True)
    dest.write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Recipe moved</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url='+html.escape(link(dst+'/'))+'"><link rel="canonical" href="'+html.escape(absolute(dst+'/'))+'"></head><body><a href="'+html.escape(link(dst+'/'))+'">Continue to recipe</a></body></html>')
(OUT/'_redirects').write_text('\n'.join('/'+s+'/ /'+d+'/ 301' for s,d in redirects.items())+'\n')
search=[{'title':p['title'],'url':link(p['url']),'description':p['description'],'image':link(p['cardImage']) if p['cardImage'] else '', 'categories':p['categories'], 'date':str(p['publishDate']), 'text':' '.join([p['title'],p['description'],*p['categories'],*[v for rid in p['recipeIds'] for v in recipes[str(rid)]['ingredients']]])} for p in posts]
(OUT/'search-index.json').write_text(json.dumps(search,ensure_ascii=False))
(OUT/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+html.escape(u)+'</loc></url>' for u in urls)+'</urlset>')
(OUT/'robots.txt').write_text('User-agent: *\n'+('Disallow: /admin/\nDisallow: /search/\nSitemap: '+BASE+'/sitemap.xml\n' if PRODUCTION else 'Disallow: /\n'))
(OUT/'.nojekyll').touch()
if PRODUCTION and urlsplit(BASE).hostname=='bettersweetdrinks.com':(OUT/'CNAME').write_text('bettersweetdrinks.com\n')
repo=os.getenv('GITHUB_REPOSITORY',site.get('repository',''))
admin=OUT/'admin';admin.mkdir(exist_ok=True)
if repo:
    config=yaml.safe_load((ROOT/'cms/config.yml').read_text());config['backend']['repo']=repo;config['site_url']=BASE;config['display_url']=BASE
    (admin/'config.yml').write_text(yaml.safe_dump(config,sort_keys=False))
    shutil.copy2(ROOT/'cms/index.html',admin/'index.html')
else:(admin/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Editor setup pending</title><h1>Editor setup pending</h1><p>The editor will be enabled when this website is connected to its GitHub repository.</p></html>')
print(json.dumps({'articles':len(posts),'pages':len(docs)-len(posts),'recipeCards':sum(len(d['recipeIds']) for d in docs),'htmlPages':len(list(OUT.rglob('*.html'))),'production':PRODUCTION,'base':BASE}))
