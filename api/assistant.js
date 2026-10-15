export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 return res.status(410).json({error:'The AI assistant has been removed from ICU KAASH.'});
}
