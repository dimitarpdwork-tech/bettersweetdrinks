"""Check migrated URLs, local links/media, recipe schema and public-file boundaries."""
import json,os,re
from pathlib import Path
from urllib.parse import urlsplit,unquote
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'dist'
prefix=urlsplit(os.getenv('SITE_URL','')).path.rstrip('/')
errors=[];warnings=[];recipes=0;pages=0
report=json.loads((ROOT/'migration-report.json').read_text())
for p in report['urls']:
    if not (OUT/p['slug']/'index.html').is_file():errors.append('Missing original page /'+p['slug']+'/')
for file in OUT.rglob('*.html'):
    soup=BeautifulSoup(file.read_text(),'html.parser');pages+=1
    if not soup.title:errors.append(str(file.relative_to(OUT))+': missing title')
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
            for step in data.get('recipeInstructions',[]):
                anchor=urlsplit(step.get('url','')).fragment
                if anchor and not soup.find(id=anchor):errors.append('Missing recipe step anchor '+anchor)
    if re.search(r'\[(?:mv_create|penci_recipe|contact-form-7)\b',soup.get_text()):errors.append(str(file.relative_to(OUT))+': leftover shortcode')
for file in ROOT.rglob('*'):
    if file.is_file() and (file.suffix in ['.sql','.wpress'] or file.name in ['wp-config.php','tables.json']):errors.append('Private file in source '+str(file.relative_to(ROOT)))
if recipes!=report['linkedRecipes']:errors.append(f'Expected {report["linkedRecipes"]} recipes, got {recipes}')
result={'htmlPages':pages,'recipeSchemas':recipes,'errors':errors,'unresolvedOriginalLinks':warnings}
(ROOT/'verification-report.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'htmlPages':pages,'recipeSchemas':recipes,'errors':len(errors),'unresolvedOriginalLinks':len(warnings)}))
if errors:print(json.dumps(errors[:20],indent=2));raise SystemExit(1)
