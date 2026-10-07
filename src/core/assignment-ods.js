import * as X from '@e965/xlsx';
import JSZip from 'jszip';
const rows = bytes => {
 if (!String.fromCharCode(...new Uint8Array(bytes).slice(0,2)).startsWith('PK')) throw new Error('Bitte eine ODS-Datei auswählen.');
 const w=X.read(bytes,{type:'array'});
 if(w.bookType!=='ods') throw new Error('Bitte eine ODS-Datei auswählen.');
 return X.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{header:1,defval:'',raw:false});
};
export function parsePeople(bytes) {
 const data=rows(bytes), header=['Person-ID','Haushalts-ID','Nachname','Vorname','Beitrittsjahr','Wochendienst','PREF_CODE','Rauchfass'];
 if(header.some((h,i)=>data[0]?.[i]!==h)) throw new Error('Personendaten: Spaltenüberschriften stimmen nicht.');
 const ids=new Set();
 const people=data.slice(1).filter(r=>r.some(v=>v!=='')).map((r,i)=>{
  const [id,household,last,first,year,weekly,preference,incense]=r.map(v=>String(v).trim());
  if(!id||ids.has(id)) throw new Error(`Zeile ${i+2}: Person-ID fehlt oder ist doppelt.`);
  if(!last||!first||!/^\d{4}$/.test(year)||!['0','1'].includes(weekly)||!['0','1'].includes(incense)||!/^(NONE|NO_SERVICE|(?:PAIR|PREF):.+)$/.test(preference)) throw new Error(`Zeile ${i+2}: Ungültige Personendaten.`);
  ids.add(id);return {id,household,name:`${first} ${last}`,year:Number(year),weekly:weekly==='1',incense:incense==='1',preference};
 });
 if(!people.length) throw new Error('Keine Personen gefunden.');
 for(const p of people) if(/^(PAIR|PREF):/.test(p.preference)&&!ids.has(p.preference.split(':')[1])) throw new Error(`Person-ID im Wunsch von ${p.name} unbekannt.`);
 return people;
}
export function parseTemplate(bytes) {
 const services=[];let current=null;
 rows(bytes).forEach((r,row)=>{
  if(r[1]||r[2]||r[3]) {
   const match=String(r[1]).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
   const date=match?`${match[3]}-${match[2]}-${match[1]}`:'';
   if(!date||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date) throw new Error(`Zeile ${row+1}: Ungültiges Datum.`);
   if(!r[3]) throw new Error(`Zeile ${row+1}: Gottesdiensttyp fehlt.`);
   current={date,time:String(r[2]),type:String(r[3]).trim(),roles:[]};services.push(current);
  } else if(!r.slice(0,5).some(Boolean)) current=null;
  if(r[4]&&current&&current.type!=='Wochendienst') current.roles.push({name:String(r[4]).trim(),row});
 });
 if(!services.length) throw new Error('Keine Gottesdienste in der Vorlage gefunden.');
 return services;
}
const escape = value => value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const repeat = (xml,attr) => Number(xml.match(new RegExp(`${attr}="(\\d+)"`))?.[1]??1);
export async function fillTemplate(bytes,result,people) {
 const zip=await JSZip.loadAsync(bytes);const file=zip.file('content.xml');
 if(!file) throw new Error('ODS-Inhalt fehlt.');
 const names=new Map(people.map(p=>[p.id,p.name]));const assignments=new Map(result.assignments.map(a=>[a.row,a]));
 let rowIndex=0;
 const xml=(await file.async('string')).replace(/<table:table\b[^>]*>[\s\S]*?<\/table:table>/,table=>table.replace(/<table:table-row\b[^>]*(?:\/>|>[\s\S]*?<\/table:table-row>)/g,row=>{
  const count=repeat(row,'table:number-rows-repeated');let out='';
  const hits=[...assignments.keys()].some(i=>i>=rowIndex&&i<rowIndex+count);
  if(!hits){rowIndex+=count;return row;}
  for(let n=0;n<count;n++,rowIndex++) {
   const a=assignments.get(rowIndex);let single=row.replace(/ table:number-rows-repeated="\d+"/,'');
   if(a){let col=0;single=single.replace(/<table:(?:table-cell|covered-table-cell)\b[^>]*(?:\/>|>[\s\S]*?<\/table:(?:table-cell|covered-table-cell)>)/g,cell=>{
    const copies=repeat(cell,'table:number-columns-repeated');const start=col;col+=copies;
    if(start>6||col<=5) return cell;
    let cells='';for(let k=start;k<col;k++) {
     let c=cell.replace(/ table:number-columns-repeated="\d+"/,'');
     if(k===5||k===6){let name=k===5&&a.marker?a.marker:names.get(a.people[k-5])??'';if(/^[=+\-@\t\r]/.test(name)) name="'"+name;
      let opening=c.match(/^<table:[^\s/>]+[^>]*?(?=\/?>)/)[0].replace(/ (?:office:value-type|office:string-value|office:value|office:date-value|office:time-value|office:boolean-value|table:formula)="[^"]*"/g,'');
      c=`${opening} office:value-type="string"><text:p>${escape(name)}</text:p></table:table-cell>`;
     }cells+=c;
    }return cells;
   });}out+=single;
  }return out;
 }));
 zip.file('content.xml',xml);
 const mime=zip.file('mimetype');
 if(mime) zip.file('mimetype',await mime.async('string'),{compression:'STORE'});
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
