// Netlify Function: optional AI proxy for the reading-notes app.
// POST  -> run a prompt (text / JSON / image) with the configured provider.
// GET   -> tell the browser whether AI is enabled for the signed-in user.
// Providers (checked in this order): Gemini (free tier available) -> Anthropic (paid).
// Without any key configured, AI is simply reported as "off" and the app hides AI features.
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
const SB=process.env.SUPABASE_URL||'https://gxlssxjgazujdzxxmexs.supabase.co';
const PK=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_V7Lt7C4FjMYnezRCRNedRQ_Cdxp_a1R';
const env=k=>String(process.env[k]||'').trim();
const provider=()=>env('GEMINI_API_KEY')?'gemini':env('ANTHROPIC_API_KEY')?'anthropic':'';
const allow=()=>env('ALLOWED_EMAILS').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

async function whoami(req){
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return {err:json({error:'请先登录',code:'session_expired'},401)};
  try{
    const u=await fetch(SB+'/auth/v1/user',{headers:{apikey:PK,Authorization:'Bearer '+token}});
    if(!u.ok)return {err:json({error:'登录已过期，请刷新页面重新登录',code:'session_expired'},401)};
    return {user:await u.json()};
  }catch(e){return {err:json({error:'登录校验失败',code:'upstream_error'},502)}}
}

async function callGemini(prompt,imgs,wantJson,signal){
  const model=env('GEMINI_MODEL')||'gemini-flash-lite-latest';
  const parts=[...imgs.map(i=>({inline_data:{mime_type:i.media_type||'image/jpeg',data:i.data}})),{text:prompt}];
  const gen={maxOutputTokens:wantJson?600:1500};
  if(wantJson)gen.responseMimeType='application/json';
  const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',signal,headers:{'x-goog-api-key':env('GEMINI_API_KEY'),'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:gen})});
  if(!r.ok){let m='';try{m=(await r.json()).error.message}catch(e){}return {status:r.status,msg:m,model,provider:'gemini'}}
  const j=await r.json();
  const text=((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(p=>p.text||'').join('');
  return {text};
}
async function callAnthropic(prompt,imgs,wantJson,signal,tier){
  const model=tier==='quick'?(env('MODEL_QUICK')||'claude-haiku-5-5'):(env('MODEL_DEFAULT')||'claude-sonnet-5-5');
  const content=[...imgs.map(i=>({type:'image',source:{type:'base64',media_type:i.media_type||'image/jpeg',data:i.data}})),{type:'text',text:prompt}];
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal,headers:{'x-api-key':env('ANTHROPIC_API_KEY'),'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:wantJson?200:500,messages:[{role:'user',content}]})});
  if(!r.ok){let m='';try{m=(await r.json()).error.message}catch(e){}return {status:r.status,msg:m,model,provider:'anthropic'}}
  const j=await r.json();
  return {text:(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('')};
}
function explain(e){
  const {status,msg,model,provider}=e;
  let hint='';
  if(provider==='anthropic'){hint=status===401?'API key 无效，请检查环境变量 ANTHROPIC_API_KEY。':status===404?'模型名称不可用：'+model+'。':/credit/i.test(msg)?'Anthropic 账户余额不足。':''}
  else{hint=(status===400&&/API key/i.test(msg))||status===401||status===403?'Gemini API key 无效或无权限，请检查环境变量 GEMINI_API_KEY。':status===404?'模型不可用：'+model+'。请在环境变量 GEMINI_MODEL 里改成 Google AI Studio 里列出的免费 Flash 模型名。':status===429?'免费额度暂时用完了，请稍后再试。':''}
  return (provider==='gemini'?'Gemini':'Claude')+' 服务出错（'+status+'）：'+String(hint||msg).slice(0,160);
}

export default async (req)=>{
  const p=provider(),list=allow();
  if(req.method==='GET'){
    const w=await whoami(req);if(w.err)return w.err;
    const email=String(w.user.email||'').toLowerCase();
    return json({enabled:!!p&&list.length>0&&list.includes(email),provider:p||null});
  }
  if(req.method!=='POST')return json({error:'method not allowed',code:'invalid_request'},405);
  const w=await whoami(req);if(w.err)return w.err;
  if(!p)return json({error:'服务器还没有配置 AI（需要设置 GEMINI_API_KEY 或 ANTHROPIC_API_KEY）',code:'not_declared'},503);
  if(!list.length)return json({error:'服务器还没有配置 ALLOWED_EMAILS（允许使用 AI 的邮箱）',code:'not_declared'},503);
  if(!list.includes(String(w.user.email||'').toLowerCase()))return json({error:'这个账号没有开通 AI 功能',code:'sampling_disabled'},403);
  let b;try{b=await req.json()}catch(e){return json({error:'bad json',code:'invalid_request'},400)}
  const prompt=String(b.prompt||'');
  if(!prompt||prompt.length>40000)return json({error:'内容为空或太长',code:'prompt_too_large'},400);
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(i=>i&&i.data&&i.data.length<5.5e6);
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),8500);
  let out;
  try{out=p==='gemini'?await callGemini(prompt,imgs,!!b.json,ctl.signal):await callAnthropic(prompt,imgs,!!b.json,ctl.signal,b.tier)}
  catch(e){
    clearTimeout(timer);console.error('ai fetch failed',p,e&&e.name,e&&e.message);
    if(e&&e.name==='AbortError')return json({error:'AI 响应超过了 Netlify 免费函数的 10 秒限制。可以换一个更快的模型（Gemini 请把 GEMINI_MODEL 改成 Flash-Lite 系列）后重新部署。',code:'upstream_error'},504);
    return json({error:'无法连接 AI 服务：'+String(e&&e.message).slice(0,80),code:'upstream_error'},502);
  }
  clearTimeout(timer);
  if(out.status){console.error('ai error',out.provider,out.status,out.msg,out.model);if(out.status===429&&out.provider==='anthropic')return json({error:'请求太频繁，请稍后再试',code:'rate_limited'},429);return json({error:explain(out),code:out.status===429?'rate_limited':'upstream_error'},out.status===429?429:502)}
  if(!String(out.text||'').trim())return json({error:'AI 没有返回内容',code:'empty_completion'},502);
  return json({text:out.text});
};
