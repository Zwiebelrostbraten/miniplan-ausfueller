import { it, expect } from 'vitest';
import * as X from '@e965/xlsx';
import JSZip from 'jszip';
import { parsePeople, parseTemplate, fillTemplate } from '../src/core/assignment-ods.js';
const workbook = rows => { const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(rows),'Plan');return X.write(w,{type:'array',bookType:'ods'}); };
const compressionFor=(bytes,name)=>{const data=new Uint8Array(bytes),encoded=new TextEncoder().encode(name);for(let i=30;i<=data.length-encoded.length;i++){let matches=true;for(let j=0;j<encoded.length;j++)if(data[i+j]!==encoded[j])matches=false;if(matches&&data[i-30]===0x50&&data[i-29]===0x4b&&data[i-28]===3&&data[i-27]===4)return data[i-22]|data[i-21]<<8;}return null;};
it('parses separate inputs and rejects malformed people, duplicate IDs and invalid dates',()=>{
 const header=['Person-ID','Haushalts-ID','Nachname','Vorname','Beitrittsjahr','Wochendienst','PREF_CODE','Rauchfass'];
 expect(parsePeople(workbook([header,['p','h','Name','Vor',2026,0,'NONE',1]]))[0]).toMatchObject({id:'p',name:'Vor Name',year:2026,incense:true});
 expect(()=>parsePeople(workbook([header,['p','h','N','V',2026,2,'NONE',0]]))).toThrow(/Zeile 2/);
 expect(()=>parsePeople(workbook([header,...Array(2).fill(['p','h','N','V',2026,0,'NONE',0])]))).toThrow(/Person-ID/);
 expect(()=>parseTemplate(workbook([['Mo','31.02.2026','10:00','Eu','Altar']]))).toThrow(/Datum/);
 expect(parseTemplate(workbook([['Mi','01.07.2026','07:45','SchGD','Leuchter'],['','','','','Altar'],[],['So','05.07.2026','','Wochendienst']]))).toHaveLength(2);
});
it('changes only F/G while retaining styles, merges, repeated cells and all other zip entries; escapes names',async()=>{
 const zip=new JSZip();zip.file('mimetype','application/vnd.oasis.opendocument.spreadsheet');zip.file('styles.xml','original styles');
 const row='<table:table-row table:style-name="ro"><table:table-cell table:number-columns-repeated="5"/><table:table-cell table:style-name="name" table:number-columns-repeated="2"/></table:table-row>';
 zip.file('content.xml',`<office:document-content><table:table table:name="first">${row}${row}</table:table><table:table table:name="second">${row}</table:table></office:document-content>`);
 const input=await zip.generateAsync({type:'uint8array'});
 const output=await fillTemplate(input,{assignments:[{row:0,people:['p']},{row:1,people:[],marker:'Wochendienst'}]},[{id:'p',name:'=HYPERLINK("x") & <Name>'}]);
 const out=await JSZip.loadAsync(output);
 expect(compressionFor(output,'mimetype')).toBe(0);
 expect(await out.file('styles.xml').async('string')).toBe('original styles');
 const xml=await out.file('content.xml').async('string'); expect(xml).toContain('table:style-name="name"');expect(xml).toContain("&apos;=HYPERLINK");expect(xml).toContain('&amp; &lt;Name&gt;');expect(xml).toContain('Wochendienst');expect(xml).toContain(`<table:table table:name="second">${row}</table:table>`);expect(xml).not.toContain('table:formula');
});
it('rejects a renamed Excel workbook instead of importing another format',()=>{
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet([['Mo','01.07.2026','10:00','Eu','Altar']]));
 expect(()=>parseTemplate(X.write(w,{type:'array',bookType:'xlsx'}))).toThrow(/ODS/);
});
