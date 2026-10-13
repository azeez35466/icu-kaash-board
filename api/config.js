export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 // These two values are public client configuration. Supabase RLS remains
 // the access boundary; never put a service_role/secret key here.
 const url=process.env.SUPABASE_URL||'https://loglkembtayyhiypmdcm.supabase.co';
 const key=process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_jxB8zfea2Pbq74MEsZGImQ_HYdLFtdn';
 const unit=process.env.ICU_UNIT_ID;
 if(!url||!key||!unit)return res.status(503).json({error:'Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and ICU_UNIT_ID in Vercel.'});
 return res.status(200).json({url,publishableKey:key,unitId:unit});
}
