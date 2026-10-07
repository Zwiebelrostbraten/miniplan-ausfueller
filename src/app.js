import { assignServices, defaultMinimumYears } from './core/assignment.js';
import { parsePeople, parseTemplate, fillTemplate } from './core/assignment-ods.js';
const el=id=>document.getElementById(id);
let template=null,services=null,people=null,output=null,revision=0;
const versions={template:0,people:0};
el('minimum-years').value=Object.entries(defaultMinimumYears).map(([role,years])=>`${role} = ${years}`).join('\n');
function settings(){
 const entries=el('minimum-years').value.split('\n').filter(line=>line.trim()).map(line=>{
  const match=line.match(/^\s*(.+?)\s*=\s*(\d+)\s*$/);
  if(!match||Number(match[2])>100) throw new Error('Mindestdauer: bitte „Rolle = Jahre“ mit 0 bis 100 angeben.');
  return [match[1],Number(match[2])];
 });return Object.fromEntries(entries);
}
function invalidate(){revision++;output=null;el('download').disabled=true;el('plan-preview').hidden=true;el('create-plan').disabled=!(services&&people);el('message').textContent='';}
for(const kind of ['template','people']) el(`${kind}-input`).addEventListener('change',async event=>{
 const version=++versions[kind];if(kind==='template'){template=null;services=null;}else people=null;
 invalidate();const file=event.target.files[0];el(`${kind}-name`).textContent=file?.name??'ODS-Datei auswählen';if(!file)return;
 try{
  if(!/\.ods$/i.test(file.name))throw new Error('Bitte eine ODS-Datei auswählen.');
  const bytes=await file.arrayBuffer();if(version!==versions[kind])return;
  if(kind==='template'){services=parseTemplate(bytes);template=bytes;}else people=parsePeople(bytes);
  invalidate();el('message').textContent=services&&people?'Beide Dateien geladen. Plan kann eingeteilt werden.':'Datei gelesen. Bitte die zweite ODS-Datei auswählen.';
 }catch(error){if(version===versions[kind])el('message').textContent=error.message;}
});
el('minimum-years').addEventListener('input',invalidate);
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
el('create-plan').addEventListener('click',async()=>{
 invalidate();const version=revision;el('create-plan').disabled=true;
 try{
  const result=assignServices(services,people,settings());const bytes=await fillTemplate(template,result,people);
  if(version!==revision)return;output=bytes;el('download').disabled=false;
  const names=new Map(people.map(p=>[p.id,p.name]));
  el('plan-preview').innerHTML=`<h3>Einteilungsbericht</h3><p>${result.filled} belegte / ${result.unfilled} unbelegte Personenplätze</p>${result.conflicts.length?`<ul>${result.conflicts.map(c=>`<li>${escape(c.date)} · ${escape(c.role)} · Zeile ${c.row+1}: ${escape(c.reason)}</li>`).join('')}</ul>`:'<p>Keine Pflichtkonflikte.</p>'}<details><summary>Vorschau der Rollen (${result.assignments.length})</summary><div class="table-scroll"><table><thead><tr><th>Datum</th><th>Rolle</th><th>Namen</th></tr></thead><tbody>${result.assignments.map(a=>`<tr><td>${escape(a.date)}</td><td>${escape(a.role)}</td><td>${escape(a.marker??a.people.map(id=>names.get(id)).join(', '))}</td></tr>`).join('')}</tbody></table></div></details><details open><summary>Faire Verteilung pro Person</summary><p>Abstand zwischen den letzten beiden Einteilungen; „–“ bei weniger als zwei Diensten.</p><div class="table-scroll"><table><thead><tr><th>Name</th><th>Beitrittsjahr</th><th>Dienste</th><th>Letzter Abstand (Tage)</th></tr></thead><tbody>${result.distribution.map(p=>`<tr><td>${escape(p.name)}</td><td>${p.year}</td><td>${p.count}</td><td>${p.lastGap??'–'}</td></tr>`).join('')}</tbody></table></div></details>`;
  el('plan-preview').hidden=false;el('message').textContent='Einteilung und ODS-Ausgabe vorbereitet.';
 }catch(error){el('message').textContent=error.message;}finally{if(version===revision)el('create-plan').disabled=!(services&&people);}
});
el('download').addEventListener('click',()=>{
 if(!output)return;const url=URL.createObjectURL(new Blob([output],{type:'application/vnd.oasis.opendocument.spreadsheet'}));const a=document.createElement('a');a.href=url;a.download='Miniplan-eingeteilt.ods';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
