export function englishDigits26(value){return String(value??'').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));}
export function onCallReport26(schedules,currentDate,currentAttendance,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid month.');
 const dates={...schedules};if(currentDate)dates[currentDate]={...(dates[currentDate]||{}),attendance:currentAttendance};
 const rows=new Map();let recordedDays=0;
 for(const [date,schedule] of Object.entries(dates)){
  const parsed=new Date(date+'T00:00:00Z');if(!date.startsWith(month+'-')||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)continue;
  const attendance=schedule?.attendance||{};let recorded=false;
  for(const shift of ['Day','Evening','Night'])for(const [name,state] of Object.entries(attendance[shift]||{})){
   if(!name.trim()||!state)continue;recorded=true;if(state!=='On-call')continue;
   if(!rows.has(name))rows.set(name,{name,shifts:0,dates:new Set(),entries:[]});
   const row=rows.get(name);row.shifts++;row.dates.add(date);row.entries.push({date,shift});
  }
  if(recorded)recordedDays++;
 }
 const people=[...rows.values()].map(row=>({...row,days:row.dates.size,dates:undefined,entries:row.entries.sort((a,b)=>a.date.localeCompare(b.date)||['Day','Evening','Night'].indexOf(a.shift)-['Day','Evening','Night'].indexOf(b.shift))})).sort((a,b)=>b.shifts-a.shifts||a.name.localeCompare(b.name,'en'));
 return {month,people,shifts:people.reduce((sum,row)=>sum+row.shifts,0),staff:people.length,recordedDays};
}
