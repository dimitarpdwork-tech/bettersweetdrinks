const jsonHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://bettersweetdrinks.com,https://www.bettersweetdrinks.com')
    .split(',').map(v => v.trim()).filter(Boolean);
  const headers = {...jsonHeaders, 'Vary':'Origin'};
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Methods'] = 'GET,POST,PATCH,OPTIONS';
  headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
  return headers;
}

function response(request, env, body, status=200) {
  return new Response(JSON.stringify(body), {status, headers:corsHeaders(request, env)});
}

function slugOk(slug) { return /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug); }

async function voterHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || '';
  const raw = new TextEncoder().encode(ip + '|' + ua + '|' + (env.HASH_SALT || 'change-me'));
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2,'0')).join('');
}

async function readJson(request) {
  const type = request.headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new Error('Expected JSON');
  return request.json();
}

function authorized(request, env) {
  const header = request.headers.get('Authorization') || '';
  return env.MODERATION_TOKEN && header === 'Bearer ' + env.MODERATION_TOKEN;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:corsHeaders(request, env)});

    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://bettersweetdrinks.com,https://www.bettersweetdrinks.com')
      .split(',').map(v => v.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin) && !url.pathname.startsWith('/api/admin/')) {
      return response(request, env, {error:'Origin not allowed'}, 403);
    }

    const feedbackMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)\/feedback$/);
    if (feedbackMatch && request.method === 'GET') {
      const slug = decodeURIComponent(feedbackMatch[1]);
      if (!slugOk(slug)) return response(request, env, {error:'Invalid recipe'}, 400);
      const rating = await env.DB.prepare(
        'SELECT ROUND(AVG(rating),2) AS average, COUNT(*) AS count FROM ratings WHERE slug=?'
      ).bind(slug).first();
      const comments = await env.DB.prepare(
        "SELECT id,name,body,created_at AS createdAt FROM comments WHERE slug=? AND status='approved' ORDER BY created_at DESC LIMIT 100"
      ).bind(slug).all();
      return response(request, env, {
        rating:{average:Number(rating?.average || 0),count:Number(rating?.count || 0)},
        comments:comments.results || []
      });
    }

    const ratingMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)\/rating$/);
    if (ratingMatch && request.method === 'POST') {
      const slug = decodeURIComponent(ratingMatch[1]);
      if (!slugOk(slug)) return response(request, env, {error:'Invalid recipe'}, 400);
      let body;
      try { body = await readJson(request); } catch { return response(request, env, {error:'Invalid JSON'}, 400); }
      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return response(request, env, {error:'Rating must be 1–5'}, 400);
      const voter = await voterHash(request, env);
      await env.DB.prepare(
        `INSERT INTO ratings(slug,voter_hash,rating,created_at,updated_at)
         VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
         ON CONFLICT(slug,voter_hash) DO UPDATE SET rating=excluded.rating,updated_at=CURRENT_TIMESTAMP`
      ).bind(slug,voter,rating).run();
      const stats = await env.DB.prepare(
        'SELECT ROUND(AVG(rating),2) AS average, COUNT(*) AS count FROM ratings WHERE slug=?'
      ).bind(slug).first();
      return response(request, env, {average:Number(stats?.average || 0),count:Number(stats?.count || 0)});
    }

    const commentMatch = url.pathname.match(/^\/api\/recipes\/([^/]+)\/comments$/);
    if (commentMatch && request.method === 'POST') {
      const slug = decodeURIComponent(commentMatch[1]);
      if (!slugOk(slug)) return response(request, env, {error:'Invalid recipe'}, 400);
      let body;
      try { body = await readJson(request); } catch { return response(request, env, {error:'Invalid JSON'}, 400); }
      if (String(body.website || '').trim()) return response(request, env, {ok:true,status:'pending'}, 202);
      const name = String(body.name || '').trim().replace(/\s+/g,' ');
      const text = String(body.body || '').trim();
      if (name.length < 1 || name.length > 60) return response(request, env, {error:'Name must be 1–60 characters'}, 400);
      if (text.length < 3 || text.length > 1200) return response(request, env, {error:'Comment must be 3–1200 characters'}, 400);
      const voter = await voterHash(request, env);
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM comments WHERE slug=? AND voter_hash=? AND created_at > datetime('now','-60 seconds')"
      ).bind(slug,voter).first();
      if (Number(recent?.count || 0) > 0) return response(request, env, {error:'Please wait before posting another comment'}, 429);
      await env.DB.prepare(
        "INSERT INTO comments(slug,name,body,status,voter_hash,created_at) VALUES(?,?,?,'pending',?,CURRENT_TIMESTAMP)"
      ).bind(slug,name,text,voter).run();
      return response(request, env, {ok:true,status:'pending'}, 202);
    }

    if (url.pathname === '/api/admin/comments' && request.method === 'GET') {
      if (!authorized(request, env)) return response(request, env, {error:'Unauthorized'}, 401);
      const status = ['pending','approved','rejected'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
      const rows = await env.DB.prepare(
        'SELECT id,slug,name,body,status,created_at AS createdAt FROM comments WHERE status=? ORDER BY created_at ASC LIMIT 200'
      ).bind(status).all();
      return response(request, env, {comments:rows.results || []});
    }

    const adminMatch = url.pathname.match(/^\/api\/admin\/comments\/(\d+)$/);
    if (adminMatch && request.method === 'PATCH') {
      if (!authorized(request, env)) return response(request, env, {error:'Unauthorized'}, 401);
      let body;
      try { body = await readJson(request); } catch { return response(request, env, {error:'Invalid JSON'}, 400); }
      if (!['approved','rejected','pending'].includes(body.status)) return response(request, env, {error:'Invalid status'}, 400);
      const id = Number(adminMatch[1]);
      await env.DB.prepare(
        "UPDATE comments SET status=?,approved_at=CASE WHEN ?='approved' THEN CURRENT_TIMESTAMP ELSE approved_at END WHERE id=?"
      ).bind(body.status,body.status,id).run();
      return response(request, env, {ok:true,id,status:body.status});
    }

    if (url.pathname === '/health') return response(request, env, {ok:true});
    return response(request, env, {error:'Not found'}, 404);
  }
};
