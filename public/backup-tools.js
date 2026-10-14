const FORMAT='ICU-KAASH-ENCRYPTED-UNIT',ITERATIONS=310000;
const encoder=new TextEncoder(),decoder=new TextDecoder();
function b64(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
function bytes64(text){if(typeof text!=='string'||text.length>32*1024*1024)throw Error('Invalid backup chunk.');return Uint8Array.from(atob(text),character=>character.charCodeAt(0))}
async function derive(password,salt){if(typeof password!=='string'||password.length<12)throw Error('Use a backup passphrase of at least 12 characters.');const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function compress(bytes,mode){if(mode==='none')return bytes;return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())}
async function expand(bytes,mode){if(mode==='none')return bytes;const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32*1024*1024){await reader.cancel();throw Error('Expanded backup chunk is too large.');}chunks.push(value)}const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length}return result}
export async function createBackupWriter(password){
 const header={format:FORMAT,version:1,backupId:crypto.randomUUID(),iterations:ITERATIONS,salt:b64(crypto.getRandomValues(new Uint8Array(16))),compression:typeof CompressionStream==='function'?'gzip':'none'};
 const key=await derive(password,bytes64(header.salt));let sequence=0,totalBytes=0;const parts=[JSON.stringify(header)+'\n'];
 return {header,async add(section,payload){
  const raw=encoder.encode(JSON.stringify(payload));if(raw.length>32*1024*1024)throw Error('Backup page is too large to verify safely.');
  const iv=crypto.getRandomValues(new Uint8Array(12)),data=await compress(raw,header.compression);
  if(data.length>16*1024*1024)throw Error('Backup page is too large. Use a smaller export page.');
  const additionalData=encoder.encode(`${header.backupId}:${sequence}:${section}`),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},key,data));
  const line=JSON.stringify({seq:sequence++,section,iv:b64(iv),data:b64(encrypted)})+'\n';totalBytes+=line.length;
  if(totalBytes>128*1024*1024)throw Error('This unit export exceeds the browser limit of 128 MB. Use a database backup for this data volume.');parts.push(line);
 },finish(){return new Blob(parts,{type:'application/x-icu-kaash-backup'})},get sequence(){return sequence}};
}
async function* readLines(blob){const reader=blob.stream().getReader();let buffer='';const decode=new TextDecoder();try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decode.decode(value,{stream:true});if(buffer.length>32*1024*1024)throw Error('Backup line exceeds the size limit.');let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);if(line.trim())yield line}}buffer+=decode.decode();if(buffer.trim())yield buffer;}finally{reader.releaseLock()}}
export async function verifyBackup(blob,password){
 if(blob.size>128*1024*1024)throw Error('Backup exceeds the browser verification limit.');
 const lines=readLines(blob);const first=await lines.next();if(first.done)throw Error('Backup is empty.');const header=JSON.parse(first.value);
 if(header.format!==FORMAT||header.version!==1||header.iterations!==ITERATIONS||!['gzip','none'].includes(header.compression))throw Error('Unsupported backup format.');
 const salt=bytes64(header.salt);if(salt.length!==16)throw Error('Invalid backup salt.');const key=await derive(password,salt);
 let expected=0,manifest,footer,counts={records:0,audit:0,linen_moves:0};const recordKeys=new Set(),auditRevisions=new Set(),moveIDs=new Set();
 for await(const line of lines){
  if(footer)throw Error('Unexpected data after backup footer.');const chunk=JSON.parse(line);
  if(chunk.seq!==expected++||!['manifest','records','audit','linen_moves','footer'].includes(chunk.section))throw Error('Backup sequence is invalid.');
  const iv=bytes64(chunk.iv);if(iv.length!==12)throw Error('Invalid encryption IV.');let decrypted;
  try{decrypted=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:encoder.encode(`${header.backupId}:${chunk.seq}:${chunk.section}`)},key,bytes64(chunk.data)))}catch{throw Error('Incorrect passphrase or damaged backup.');}
  const payload=JSON.parse(decoder.decode(await expand(decrypted,header.compression)));
  if(chunk.section==='manifest'){
   if(manifest||chunk.seq!==0||payload.format!=='ICU-KAASH-UNIT-SNAPSHOT'||payload.version!==1||!Array.isArray(payload.board?.patients)||!Array.isArray(payload.linen_stock))throw Error('Invalid unit manifest.');
   const beds=new Set(),ids=new Set();for(const patient of payload.board.patients){if(!patient.name||!patient.mrn||!patient.admissionId||beds.has(patient.bed)||ids.has(patient.admissionId))throw Error('Active patient identities or beds are invalid.');beds.add(patient.bed);ids.add(patient.admissionId)}
   const items=new Set();for(const stock of payload.linen_stock){if(stock.unit_id!==payload.unit_id||items.has(stock.item)||!['gowns','blankets','sheets'].includes(stock.item)||['clean','in_use','dirty','laundry'].some(bucket=>!Number.isInteger(stock[bucket])||stock[bucket]<0))throw Error('Invalid linen balances.');items.add(stock.item)}
   manifest=payload;
  }else if(chunk.section==='footer'){if(!manifest)throw Error('Missing manifest.');footer=payload;
  }else{
   if(!manifest||!Array.isArray(payload))throw Error('Invalid backup section.');
   for(const row of payload){if(row.unit_id!==manifest.unit_id)throw Error('Backup contains another unit.');
    if(chunk.section==='records'){if(!row.admission_key||!row.data?.name||!row.data?.mrn||recordKeys.has(row.admission_key))throw Error('Invalid or duplicate archived record.');recordKeys.add(row.admission_key)}
    else if(chunk.section==='audit'){if(!Number.isSafeInteger(row.revision)||row.revision>manifest.revision||!Array.isArray(row.changes)||auditRevisions.has(row.revision))throw Error('Invalid change-history row.');auditRevisions.add(row.revision)}
    else {if(!row.id||!Number.isInteger(row.quantity)||row.quantity<0||moveIDs.has(row.id))throw Error('Invalid linen movement.');moveIDs.add(row.id)}
   }
   counts[chunk.section]+=payload.length;
  }
 }
 if(!manifest||!footer||footer.chunks!==expected-1||footer.unit_id!==manifest.unit_id||footer.revision!==manifest.revision)throw Error('Backup is incomplete.');
 for(const [section,property] of Object.entries({records:'records_count',audit:'audit_count',linen_moves:'linen_moves_count'})){if(!Number.isSafeInteger(manifest[property])||manifest[property]<0||counts[section]!==manifest[property]||counts[section]!==footer.counts?.[section])throw Error('Backup row counts do not match.');}
 return {unit:manifest.unit_name,unitId:manifest.unit_id,revision:manifest.revision,capturedAt:manifest.captured_at,patients:manifest.board.patients.length,counts,linenItems:manifest.linen_stock.length};
}
