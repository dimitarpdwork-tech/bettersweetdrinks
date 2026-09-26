"""Check migrated URLs, local links/media, recipe schema and public-file boundaries."""
import json,os,re
from pathlib import Path
from urllib.parse import urlsplit,unquote
from bs4 import BeautifulSoup
import yaml
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist'
prefix=urlsplit(os.getenv('SITE_URL','')).path.rstrip('/')
errors=[];warnings=[];recipes=0;pages=0
report=json.loads((ROOT/'migration-report.json').read_text())
for p in report['urls']:
    if not (OUT/p['slug']/'index.html').is_file():errors.append('Missing original page /'+p['slug']+'/')
for file in OUT.rglob('*.html'):
    soup=BeautifulSoup(file.read_text(),'html.parser');pages+=1
    if not soup.title:errors.append(str(file.relative_to(OUT))+': missing title')
    relpath=str(file.relative_to(OUT))
    robots=soup.find('meta',attrs={'name':'robots'})
    noindex=robots and 'noindex' in robots.get('content','').lower()
    # Canonical/description/H1/alt SEO requirements apply to indexable public pages,
    # not redirect stubs, the CMS admin shell, 404 pages or preview noindex output.
    seo_page=not noindex and not relpath.startswith('admin/') and relpath not in ('404.html','404/index.html')
    if seo_page:
        canonical=soup.find('link',rel='canonical')
        if not canonical or not canonical.get('href'):errors.append(relpath+': missing canonical')
        description=soup.find('meta',attrs={'name':'description'})
        if not description or not description.get('content','').strip():errors.append(relpath+': missing meta description')
        h1=soup.find_all('h1')
        if len(h1)!=1:warnings.append({'page':relpath,'issue':f'{len(h1)} H1 elements'})
        for img in soup.find_all('img'):
            if not img.has_attr('alt'):warnings.append({'page':relpath,'issue':'image missing alt text','target':img.get('src','')})
    for anchor in soup.select('a[href^="#"]'):
        fragment=unquote(anchor['href'][1:])
        if fragment and not soup.find(id=fragment) and not soup.find('a',attrs={'name':fragment}):
            errors.append(str(file.relative_to(OUT))+': missing fragment '+fragment)
    for el in soup.find_all(True):
        if el.name=='img' and urlsplit(el.get('src','')).scheme in ('http','https'):
            errors.append(str(file.relative_to(OUT))+': externally hosted image '+el['src'])
        for attr in ['src','href','data-index']:
            value=el.get(attr,'')
            if not value.startswith('/') or value.startswith('//'):continue
            path=unquote(urlsplit(value).path)
            if prefix and path.startswith(prefix+'/'):path=path[len(prefix):]
            target=OUT/path.lstrip('/')
            exists=target.is_file() or (target/'index.html').is_file()
            if not exists:
                item={'page':str(file.relative_to(OUT)),'target':value}
                (warnings if attr=='href' else errors).append(item)
    for schema in soup.select('script[type="application/ld+json"]'):
        try:data=json.loads(schema.string or '')
        except ValueError:errors.append(str(file.relative_to(OUT))+': invalid schema');continue
        if data.get('@type')=='Recipe':
            recipes+=1
            if not data.get('recipeIngredient') or not data.get('recipeInstructions'):errors.append('Recipe missing ingredients or instructions '+data.get('name',''))
            for field in ['image','author','datePublished','dateModified','recipeYield','mainEntityOfPage']:
                if not data.get(field):warnings.append({'page':str(file.relative_to(OUT)),'issue':'Recipe schema missing '+field,'recipe':data.get('name','')})
            for step in data.get('recipeInstructions',[]):
                anchor=urlsplit(step.get('url','')).fragment
                if anchor and not soup.find(id=anchor):errors.append('Missing recipe step anchor '+anchor)
    if re.search(r'\[(?:mv_create|penci_recipe|contact-form-7)\b',soup.get_text()):errors.append(str(file.relative_to(OUT))+': leftover shortcode')
for file in ROOT.rglob('*'):
    rel=file.relative_to(ROOT)
    # Legacy WordPress/database dumps are private migration artifacts. The feedback
    # service's checked-in schema.sql is intentional application source code.
    forbidden=(file.suffix=='.wpress' or file.name in ['wp-config.php','tables.json'] or (file.suffix=='.sql' and (not rel.parts or rel.parts[0] != 'feedback')))
    if file.is_file() and forbidden:errors.append('Private file in source '+str(rel))
published_posts=(yaml.safe_load(file.read_text().split('---',2)[1]) for file in (ROOT/'content/posts').glob('*.md'))
expected_recipes=sum(len(post.get('recipeIds',[])) for post in published_posts if not post.get('draft'))
if recipes!=expected_recipes:errors.append(f'Expected {expected_recipes} recipes, got {recipes}')
result={'htmlPages':pages,'recipeSchemas':recipes,'errors':errors,'unresolvedOriginalLinks':warnings}
(ROOT/'verification-report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'htmlPages':pages,'recipeSchemas':recipes,'errors':len(errors),'unresolvedOriginalLinks':len(warnings)}))
if errors:print(json.dumps(errors[:20],indent=2));raise SystemExit(1)
