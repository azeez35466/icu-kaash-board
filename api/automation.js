export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 const {SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:key,ICU_UNIT_ID:unit,N8N_WEBHOOK_URL:webhook,N8N_WEBHOOK_SECRET:secret}=process.env;
 if(!url||!key||!unit||!webhook||!secret)return res.status(503).json({error:'Automation is not configured'});
 if(!req.headers.authorization?.startsWith('Bearer '))return res.status(401).json({error:'Sign in required'});
 if(req.body?.event!=='shift_summary_requested')return res.status(400).json({error:'Unsupported event'});
 try{
 const headers={apikey:key,Authorization:req.headers.authorization};
 const user=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(8000)});if(!user.ok)return res.status(401).json({error:'Invalid session'});
 const result=await fetch(url+'/rest/v1/kaash_members?unit_id=eq.'+encodeURIComponent(unit)+'&select=role',{headers,signal:AbortSignal.timeout(8000)});
 if(!result.ok)return res.status(403).json({error:'Access denied'});const members=await result.json();if(!members.some(m=>['admin','charge_nurse'].includes(m.role)))return res.status(403).json({error:'Access denied'});
 const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json','X-KAASH-Secret':secret},body:JSON.stringify({event:'shift_summary_requested',unitId:unit,requestedAt:new Date().toISOString()}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)return res.status(502).json({error:'Workflow failed'});return res.status(200).json({accepted:true});
 }catch{return res.status(502).json({error:'Automation unavailable'});}
}
