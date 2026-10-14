const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function equal(a,b){if(a===b)return true;if(a===undefined||b===undefined)return false;if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,index)=>equal(value,b[index]));if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equal(a[key],b[key]));}return false}
function keyed(arrays){for(const key of ['admissionId','id'])if(arrays.every(rows=>rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row[key]==='string'&&row[key])&&new Set(rows.map(row=>row[key])).size===rows.length))return key;return null}
export function mergeBoard30(base,local,remote){
 const conflicts=[];
 function merge(before,mine,theirs,path){
  if(equal(mine,before))return copy(theirs);if(equal(theirs,before)||equal(mine,theirs))return copy(mine);
  if(before===undefined&&mine&&theirs&&typeof mine==='object'&&typeof theirs==='object'&&!Array.isArray(mine)&&!Array.isArray(theirs))before={};
  if(before&&mine&&theirs&&typeof before==='object'&&typeof mine==='object'&&typeof theirs==='object'){
   if(!Array.isArray(before)&&!Array.isArray(mine)&&!Array.isArray(theirs)){const result={};for(const key of new Set([...Object.keys(before),...Object.keys(mine),...Object.keys(theirs)])){const value=merge(before[key],mine[key],theirs[key],path+'/'+key);if(value!==undefined)result[key]=value;}return result;}
   if([before,mine,theirs].every(Array.isArray)){const key=keyed([before,mine,theirs]);if(key){const maps=[before,mine,theirs].map(rows=>new Map(rows.map(row=>[row[key],row]))),result=[];for(const id of new Set([...mine.map(row=>row[key]),...theirs.map(row=>row[key]),...before.map(row=>row[key])])){const value=merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),path+'/'+id);if(value!==undefined)result.push(value);}return result;}}
  }
  conflicts.push(path||'/');return copy(mine);
 }
 const data=merge(base,local,remote,'');return {data,conflicts};
}
export const pause30=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function retryDelay30(attempt){return Math.min(1500,80*2**attempt)+Math.floor(Math.random()*160);}
export function admissionSignature30(data){return JSON.stringify((data?.patients||[]).map(patient=>[patient.admissionId,patient.mrn,patient.name,patient.doa,patient.toa]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));}
