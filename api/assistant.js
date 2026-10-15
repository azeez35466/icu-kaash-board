import {assistantQuestions31} from '../public/assistant-data31.js';
const roles=new Set(['admin','doctor','charge_nurse','nurse','pct']);
const json=async response=>{try{return await response.json()}catch{return null}};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key,ICU_UNIT_ID:unit,OPENAI_API_KEY:apiKey,OPENAI_MODEL:model,OPENAI_ASSISTANT_ENABLED:enabled}=process.env;
 if(!url||!key||!unit)return res.status(503).json({error:'Application database is not configured.'});
 const authorization=req.headers.authorization;if(!/^Bearer [^\s]+$/.test(authorization||''))return res.status(401).json({error:'Sign in required.'});
 let body=req.body||{};if(typeof body==='string'){try{body=JSON.parse(body)}catch{return res.status(400).json({error:'Invalid request.'})}}
 if(body===null||Array.isArray(body)||typeof body!=='object')return res.status(400).json({error:'Invalid request.'});
 const {question='shift',shift='Day',language='en'}=body;
 if(req.method==='POST'&&(Object.keys(body).some(k=>!['question','shift','language'].includes(k))||!Object.hasOwn(assistantQuestions31,question)||!['Day','Evening','Night'].includes(shift)||!['en','ar'].includes(language)))return res.status(400).json({error:'Choose one of the supported statistical questions.'});
 const headers={apikey:key,Authorization:authorization,'Content-Type':'application/json'};
 const deadline=AbortSignal.timeout(45000);
 const database=async(path,options={})=>{const response=await fetch(url+path,{...options,headers,signal:AbortSignal.any([deadline,AbortSignal.timeout(10000)])});const data=await json(response);if(!response.ok){const e=Error('Database request failed.');e.status=response.status;throw e;}return data;};
 try{
  const user=await database('/auth/v1/user');if(!user?.id)return res.status(401).json({error:'Sign in again.'});
  const membership=await database('/rest/v1/kaash_members?unit_id=eq.'+encodeURIComponent(unit)+'&user_id=eq.'+encodeURIComponent(user.id)+'&select=role');
  if(!Array.isArray(membership)||!roles.has(membership[0]?.role))return res.status(403).json({error:'Unit membership required.'});
  const configured=enabled==='true'&&Boolean(apiKey&&model);
  if(req.method==='GET')return res.status(200).json({enabled:configured,scope:'aggregate-statistics-only',handover:'local-only'});
  if(!configured)return res.status(503).json({error:'OpenAI explanation is not enabled yet. Local summaries and handover drafts remain available.',code:'ASSISTANT_NOT_CONFIGURED'});
  const quota=await database('/rest/v1/rpc/kaash_assistant_quota',{method:'POST',body:JSON.stringify({p_unit:unit})});if(quota?.allowed!==true)return res.status(429).json({error:'Assistant daily allowance reached. Local summaries remain available.'});
  const facts=await database('/rest/v1/rpc/kaash_assistant_statistics',{method:'POST',body:JSON.stringify({p_unit:unit,p_shift:shift})});if(!facts||typeof facts.occupied!=='number')throw Error('Current statistics unavailable.');
  const tool={type:'function',name:'get_verified_unit_statistics',description:'Read the authenticated unit aggregate statistics. No names, identifiers or clinical free text.',strict:true,parameters:{type:'object',properties:{},required:[],additionalProperties:false}};
  const instructions='You explain recorded ICU operational statistics. Use only the supplied tool facts. Never infer diagnoses, severity, missing observations, safety, staffing adequacy, prognosis or treatment. Missing data is unknown. On-call counts availability, not hours or call-outs. Admission percentages compare complete periods; never divide by zero or call this a WHO population rate. Distinguish current occupancy from historical admissions. Cite board revision and capturedAt. No writes or clinical recommendations. Answer concisely in '+(language==='ar'?'Arabic with English digits.':'English.');
  const call=async input=>{const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,max_output_tokens:1800,instructions,...input}),signal:AbortSignal.any([deadline,AbortSignal.timeout(20000)])});const data=await json(response);if(!response.ok||!data||data.status!=='completed')throw Error('OpenAI explanation unavailable. Try again later; recorded source values remain available.');return data;};
  const input=[{role:'user',content:assistantQuestions31[question]}];
  const first=await call({input,tools:[tool],tool_choice:{type:'function',name:tool.name},parallel_tool_calls:false});
  const calls=(first.output||[]).filter(item=>item.type==='function_call');let args;try{args=JSON.parse(calls[0]?.arguments)}catch{}if(calls.length!==1||calls[0].name!==tool.name||!args||Array.isArray(args)||typeof args!=='object'||Object.keys(args).length)throw Error('Unexpected assistant tool request.');
  const response=await call({input:[...input,...first.output,{type:'function_call_output',call_id:calls[0].call_id,output:JSON.stringify(facts)}],tools:[tool],tool_choice:'none'});
  const answer=(response.output||[]).filter(item=>item.type==='message').flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text).join('\n');if(!answer)throw Error('No explanation returned.');
  return res.status(200).json({answer:answer.slice(0,14000),facts,generatedBy:'OpenAI',readOnly:true});
 }catch(error){const code=error.status===401?401:502;return res.status(code).json({error:code===401?'Session expired. Sign in again.':error.message.startsWith('OpenAI')||error.message.startsWith('Unexpected')||error.message==='No explanation returned.'?error.message:'Assistant unavailable. Use the recorded summaries and try again later.'});}
}
