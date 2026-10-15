export const assistantQuestions31={occupancy:'Explain current bed occupancy and documentation completeness.',admissions:'Explain recorded weekly and monthly ICU admissions and their limitations.',oncall:'Summarize recorded on-call availability for this calendar month.',shift:'Summarize current shift workload, pending tasks and handover receipt counts.'};
export const riyadhDay31=(now=new Date())=>new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const text=value=>typeof value==='string'?value.trim():'';
const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(text(value))?value:null;
const instant=value=>{if(!text(value))return NaN;return Date.parse(value+(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)?'':'+03:00'))};
export function aggregate31(board={},report=null,{shift='Day',now=new Date(),revision=null}={}){
 const date=riyadhDay31(now),month=date.slice(0,7),patients=(Array.isArray(board.patients)?board.patients:[]).filter(p=>p&&text(p.name)&&text(p.mrn)&&!p.status);
 const saved=board.scheduleDate===date?{rn:board.shiftRNs,attendance:board.shiftAttendance}:board.scheduleByDate4?.[date];
 const rn=saved?.rn?.[shift]||{},loads=new Map();let unassigned=0,pending=0,overdue=0,unreceived=0,missing=0;
 for(const p of patients){const assigned=text(rn[p.bed]);if(assigned)loads.set(assigned,(loads.get(assigned)||0)+1);else unassigned++;
  if(!text(p.diagnosis)||!text(p.doa))missing++;
  for(const t of Array.isArray(p.tasks)?p.tasks:[])if(t.status!=='Completed'){pending++;const at=instant(t.due);if(Number.isFinite(at)&&at<now.getTime())overdue++;}
  const h=(Array.isArray(p.handovers)?p.handovers:[]).filter(h=>h.shift===shift&&Number.isFinite(instant(h.createdAt))&&riyadhDay31(new Date(instant(h.createdAt)))===date).at(-1);if(h&&!h.receivedAt)unreceived++;
 }
 const dates={...(board.scheduleByDate4||{})};if(board.scheduleDate)dates[board.scheduleDate]={attendance:board.shiftAttendance};
 let oncall=0,recordedDays=0;const staff=new Set();for(const [at,row]of Object.entries(dates)){if(!day(at)||!at.startsWith(month+'-'))continue;let recorded=false;for(const period of ['Day','Evening','Night'])for(const [name,state]of Object.entries(row?.attendance?.[period]||{})){if(!name.trim()||!state)continue;recorded=true;if(state==='On-call'){oncall++;staff.add(name)}}if(recorded)recordedDays++;}
 const admissionKeys=['this_week','this_month','last_week','preceding_week','last_month','preceding_month','week_change','month_change','missing_dates','future_dates'];
 return {capturedAt:now.toISOString(),revision:number(revision),date,shift,capacity:28,occupied:patients.length,available:Math.max(0,28-patients.length),occupancyPercent:Math.round(patients.length/28*1000)/10,patientsMissingDiagnosisOrAdmissionDate:missing,bedsWithoutRN:unassigned,assignedRNs:loads.size,pendingTasks:pending,overdueTasks:overdue,handoversAwaitingReceipt:unreceived,oncall:{month,recordedShifts:oncall,staffCount:staff.size,recordedDays},admissions:report?{...Object.fromEntries(admissionKeys.map(key=>[key,number(report[key])])),today:day(report.today),week_start:day(report.week_start),month_start:day(report.month_start)}:null};
}
export function localSummary31(f){return [`Recorded shift summary · DRAFT`,`${f.date} · ${f.shift} · board revision ${f.revision??'unknown'} · captured ${f.capturedAt}`,`Occupied: ${f.occupied}/${f.capacity} (${f.occupancyPercent}%). Available: ${f.available}.`,`Beds without an assigned RN: ${f.bedsWithoutRN}. Assigned RNs: ${f.assignedRNs}.`,`Pending tasks: ${f.pendingTasks}. Overdue recorded due times: ${f.overdueTasks}.`,`Handovers awaiting receipt today in this shift: ${f.handoversAwaitingReceipt}.`,`Patients missing diagnosis or admission date: ${f.patientsMissingDiagnosisOrAdmissionDate}.`,`On-call ${f.oncall.month}: ${f.oncall.recordedShifts} recorded shifts across ${f.oncall.staffCount} staff; ${f.oncall.recordedDays} days have attendance entries.`,`Counts describe recorded data, not clinical severity or completed work that was not documented.`].join('\n');}
export function handoverDraft31(patient,{shift='Day',date=riyadhDay31()}={}){
 if(!patient)return 'Select an active admission.';
 const value=key=>text(patient[key])||'Not documented';
 const tasks=(patient.tasks||[]).filter(t=>t.status!=='Completed');
 const handover=(patient.handovers||[]).filter(h=>h.shift===shift&&Number.isFinite(instant(h.createdAt))&&riyadhDay31(new Date(instant(h.createdAt)))===date).at(-1);
 return [`HANDOVER DRAFT · REVIEW REQUIRED`,`${date} · ${shift} · ${value('bed')}`,`Patient: ${value('name')} · MRN: ${value('mrn')}`,`Recorded diagnosis: ${value('diagnosis')}`,`Admission: ${value('doa')} ${value('toa')}`,`Code status: ${value('code')}`,`Oxygen support: ${value('oxygen')}`,`Precautions: ${value('precautions')}`,'',`Pending recorded tasks (${tasks.length}):`,...tasks.map(t=>`• ${text(t.title)||'Untitled task'} · Owner: ${text(t.owner)||'Not documented'} · Due: ${text(t.due)||'Not documented'}`),'',`Recorded handover for this date/shift: ${text(handover?.summary)||'Not documented'}`,'','Generated locally from recorded fields. No AI request. Verify against the patient record; this draft does not mark handover as given or received.'].join('\n');
}
