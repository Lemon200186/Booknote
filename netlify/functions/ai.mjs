// Netlify Function: AI proxy for the reading-notes app.
// Verifies the Supabase login, then calls the Anthropic API with a server-side key.
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json'}});
const SB=process.env.SUPABASE_URL||'https://gxlssxjgazujdzxxmexs.supabase.co';
const PK=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_V7Lt7C4FjMYnezRCRNedRQ_Cdxp_a1R';
const MODELS={quick:process.env.MODEL_QUICK||'claude-haiku-5-5',default:process.env.MODEL_DEFAULT||'claude-sonnet-5-5'};
export default async (req)=>{
  if(req.method!=='POST')return json({error:'method not allowed',code:'invalid_request'},405);
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!token)return json({error:'请先登录',code:'session_expired'},401);
  if(!process.env.ANTHROPIC_API_KEY)return json({error:'服务器还没有配置 ANTHROPIC_API_KEY',code:'not_declared'},503);
  const allow=(process.env.ALLOWED_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!allow.length)return json({error:'服务器还没有配置 ALLOWED_EMAILS（允许使用 AI 的邮箱）',code:'not_declared'},503);
  let user;
  try{const u=await fetch(SB+'/auth/v1/user',{headers:{apikey:PK,Authorization:'Bearer '+token}});if(!u.ok)return json({error:'登录已过期，请刷新页面重新登录',code:'session_expired'},401);user=await u.json()}
  catch(e){return json({error:'登录校验失败',code:'upstream_error'},502)}
  if(!allow.includes(String(user.email||'').toLowerCase()))return json({error:'这个账号没有开通 AI 功能',code:'sampling_disabled'},403);
  let b;try{b=await req.json()}catch(e){return json({error:'bad json',code:'invalid_request'},400)}
  const prompt=String(b.prompt||'');
  if(!prompt||prompt.length>40000)return json({error:'内容为空或太长',code:'prompt_too_large'},400);
  const imgs=(Array.isArray(b.images)?b.images:[]).slice(0,2).filter(i=>i&&i.data&&i.data.length<5.5e6);
  const content=[...imgs.map(i=>({type:'image',source:{type:'base64',media_type:i.media_type||'image/jpeg',data:i.data}})),{type:'text',text:prompt}];
  const model=MODELS[b.tier==='quick'?'quick':'default'];
  let r;
  try{r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model,max_tokens:b.json?300:1200,messages:[{role:'user',content}]})})}
  catch(e){return json({error:'无法连接 AI 服务',code:'upstream_error'},502)}
  if(r.status===429)return json({error:'请求太频繁，请稍后再试',code:'rate_limited'},429);
  if(!r.ok){let m='';try{m=(await r.json()).error.message}catch(e){}return json({error:'AI 服务出错：'+m.slice(0,120),code:'upstream_error'},502)}
  const j=await r.json();
  const text=(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
  if(!text.trim())return json({error:'AI 没有返回内容',code:'empty_completion'},502);
  return json({text});
};
