export const defaultMinimumYears = { Fahnen: 5, 'gr. Fahnen': 5, Laternen: 5, 'gr. Kreuz': 5, Palmstecken: 5, 'kl. Kreuz': 4, 'kleines Kreuz': 4 };
export function currentCohort(year, date) { return date >= `${year}-08-01` && date <= `${year + 1}-08-31`; }
export function membershipYears(year, date) { return Number(date.slice(0,4)) - year - (date.slice(5) < '08-01' ? 1 : 0); }
export function roleSize(name) { return /^(kl\. Kreuz|kleines Kreuz|Lautspr\.|Lautsprecher)$/i.test(name) ? 1 : 2; }
const day = date => Date.parse(`${date}T00:00:00Z`) / 86400000;
const compare = (a,b) => { for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return b[i]-a[i]; return 0; };

export function assignServices(services, people, minimumYears = defaultMinimumYears) {
 const persons=[...people].sort((a,b)=>a.id.localeCompare(b.id));
 const stats=new Map(persons.map(p=>[p.id,{...p,count:0,last:null,lastGap:null}]));
 const assignments=[], conflicts=[]; let filled=0,unfilled=0;
 const youngest=Math.max(...persons.map(p=>p.year),0);
 for(const s of [...services].sort((a,b)=>a.date.localeCompare(b.date)||String(a.time??'').localeCompare(String(b.time??'')))) {
  if(s.type==='Wochendienst') continue;
  if(['Tauffeier','Trauung'].includes(s.type)) { for(const r of s.roles) assignments.push({date:s.date,row:r.row,role:r.name,people:[],marker:'Wochendienst'}); continue; }
  const eligible=persons.filter(p=>p.preference!=='NO_SERVICE' && !(new Date(`${s.date}T00:00:00Z`).getUTCDay()===0 && p.weekly) && (s.type!=='SchGD'||currentCohort(p.year,s.date)));
  const groups=s.roles.map((r,index)=>{
   const size=roleSize(r.name), incense=/^\(?Rf\.\)?$/i.test(r.name);
   const candidates=eligible.filter(p=>membershipYears(p.year,s.date)>=(minimumYears[r.name]??0));
   const options=[];
   for(let i=0;i<candidates.length;i++) for(let j=size===1?i:i+1;j<candidates.length;j++) {
    const pair=size===1?[candidates[i]]:[candidates[i],candidates[j]];
    if(incense && !pair.some((p,index)=>p.incense&&pair.some((other,otherIndex)=>otherIndex!==index&&membershipYears(other.year,s.date)>=3))) continue;
    options.push(pair); if(size===1) break;
   }
   return {r,index,size,options,incense};
  }).sort((a,b)=>a.options.length-b.options.length||a.index-b.index);
  function score(chosen) {
   const selected=chosen.flat(); let fairness=0,gap=0,households=0,wishes=0;
   for(const p of selected) {const st=stats.get(p.id), weight=1+Math.max(0,p.year-(youngest-15))/5; fairness-=(2*st.count+1)/weight; gap+=st.last===null?60:Math.min(60,day(s.date)-st.last);}
   for(let i=0;i<selected.length;i++) for(let j=i+1;j<selected.length;j++) {const a=selected[i],b=selected[j];if(a.household && a.household===b.household) households++;if(a.preference===`PAIR:${b.id}`&&b.preference===`PAIR:${a.id}`) wishes+=10;if(a.preference===`PREF:${b.id}`||b.preference===`PREF:${a.id}`) wishes++;}
   return [selected.length,Math.round(fairness*1e8)/1e8,gap,households,wishes];
  }
  let beam=[{chosen:[],used:new Set(),score:score([])}];
  for(const g of groups) {
   const next=new Map();
   for(const state of beam) for(const pair of [...g.options,[]]) {
    if(pair.some(p=>state.used.has(p.id))) continue;
    const chosen=[...state.chosen,pair],used=new Set([...state.used,...pair.map(p=>p.id)]),rank=score(chosen),key=[...used].sort().join('|');
    const existing=next.get(key);if(!existing||compare(rank,existing.score)<0) next.set(key,{chosen,used,score:rank});
   }
   beam=[...next.values()].sort((a,b)=>compare(a.score,b.score)).slice(0,400);
  }
  let best=beam[0];
  // Exhaustive feasibility search if the bounded optimization missed a full solution.
  // Also proves the maximum number of places when a service cannot be completed.
  if(best.score[0]<groups.reduce((sum,g)=>sum+g.size,0)) {
   const memo=new Map();
   function search(index,used) {
    if(index===groups.length) return {chosen:[],count:0};
    const key=`${index}:${[...used].sort().join('|')}`;if(memo.has(key)) return memo.get(key);
    const g=groups[index];let result={chosen:[],count:-1};
    for(const pair of [...g.options,[]]) {if(pair.some(p=>used.has(p.id))) continue;const tail=search(index+1,new Set([...used,...pair.map(p=>p.id)]));const count=tail.count+pair.length;if(count>result.count) result={chosen:[pair,...tail.chosen],count};if(count===groups.slice(index).reduce((n,x)=>n+x.size,0)) break;}
    memo.set(key,result);return result;
   }
   const exact=search(0,new Set());if(exact.count>best.score[0]) best={chosen:exact.chosen};
  }
  groups.forEach((g,i)=>{
   const pair=best.chosen[i];assignments.push({date:s.date,row:g.r.row,role:g.r.name,people:pair.map(p=>p.id)});
   filled+=pair.length;unfilled+=g.size-pair.length;
   if(pair.length<g.size) conflicts.push({date:s.date,role:g.r.name,row:g.r.row,reason:s.type==='SchGD'&&!eligible.length?'Kein aktueller Jahrgang für diesen SchGD.':!g.options.length?`Keine zulässigen Kandidaten: ${g.incense?'Rauchfass-Schulung und mindestens drei volle Mitgliedsjahre':`Mindestdauer ${minimumYears[g.r.name]??0} Jahre, Ausschlüsse und Jahrgang`} prüfen.`:'Zu wenige verschiedene zulässige Personen im Gottesdienst; Doppelbelegung ausgeschlossen.'});
   for(const p of pair) {const st=stats.get(p.id);st.count++;st.lastGap=st.last===null?null:day(s.date)-st.last;st.last=day(s.date);}
  });
 }
 return {assignments,conflicts,filled,unfilled,distribution:[...stats.values()].map(({id,name,year,count,lastGap})=>({id,name,year,count,lastGap}))};
}
