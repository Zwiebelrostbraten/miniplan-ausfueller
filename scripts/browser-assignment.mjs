import { chromium } from 'playwright';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as X from '@e965/xlsx';
import { parsePeople, parseTemplate } from '../src/core/assignment-ods.js';
import { currentCohort, membershipYears, defaultMinimumYears, roleSize } from '../src/core/assignment.js';
const reference=process.env.MINIPLAN_REFERENCE??'/opt/data/host-shared-projekte/miniplan-ausfüller';
const compressionFor=(bytes,name)=>{const data=new Uint8Array(bytes),encoded=new TextEncoder().encode(name);for(let i=30;i<=data.length-encoded.length;i++){let matches=true;for(let j=0;j<encoded.length;j++)if(data[i+j]!==encoded[j])matches=false;if(matches&&data[i-30]===0x50&&data[i-29]===0x4b&&data[i-28]===3&&data[i-27]===4)return data[i-22]|data[i-21]<<8;}return null;};
const templatePath=join(reference,'St. Georg - Miniplan vom 01.07.2026 - 03.10.2026.ods');
const peoplePath=join(reference,'Test_Person_data.ods');
const browser=await chromium.launch({headless:true,...(process.env.AGENT_BROWSER_EXECUTABLE_PATH?{executablePath:process.env.AGENT_BROWSER_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`file://${resolve('dist/index.html')}`);
 assert.equal(await page.locator('#create-plan').isDisabled(),true);
 await page.locator('#template-input').setInputFiles(templatePath);
 await page.locator('#people-input').setInputFiles(peoplePath);
 await page.locator('#create-plan').click();
 await page.locator('#download').waitFor({state:'visible'});
 await page.waitForFunction(()=>!document.getElementById('download').disabled);
 const report=await page.locator('#plan-preview').innerText();
 assert.match(report,/belegte.*unbelegte Personenplätze/);
 const pending=page.waitForEvent('download');await page.locator('#download').click();const download=await pending;
 const directory=await mkdtemp(join(tmpdir(),'miniplan-'));const path=join(directory,download.suggestedFilename());await download.saveAs(path);
 const original=await readFile(templatePath),bytes=await readFile(path),people=parsePeople(await readFile(peoplePath)),services=parseTemplate(original);
 assert.equal(compressionFor(bytes,'mimetype'),0);
 const workbook=X.read(bytes);const rows=X.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:''});
 const originalWorkbook=X.read(original);const originalRows=X.utils.sheet_to_json(originalWorkbook.Sheets[originalWorkbook.SheetNames[0]],{header:1,defval:''});
 const weeklyExclusions=new Map();let weeklyFilled=0;
 for(const s of services.filter(s=>s.type==='Wochendienst')){
  assert.equal(new Date(`${s.date}T00:00:00Z`).getUTCDay(),0);
  const names=rows[s.row].slice(5,7).filter(Boolean);
  const expected=Math.min(2,people.filter(p=>p.weekly&&p.preference!=='NO_SERVICE').length);
  assert.equal(names.length,expected);assert.equal(new Set(names).size,names.length);
  if(names.length<2)assert.match(report,new RegExp(`Zeile ${s.row+1}: Wochendienst: ${2-names.length} unbelegt`));
  const nextSunday=new Date(Date.parse(`${s.date}T00:00:00Z`)+7*86400000).toISOString().slice(0,10);
  if(!weeklyExclusions.has(nextSunday))weeklyExclusions.set(nextSunday,new Set());
  for(const name of names){const p=people.find(p=>p.name===name);assert.ok(p?.weekly);assert.notEqual(p.preference,'NO_SERVICE');weeklyFilled++;weeklyExclusions.get(nextSunday).add(p.id);}

 }
 assert.ok(weeklyFilled>0);
 let filled=0;
 for(const s of services){const used=new Set();for(const r of s.roles){const names=rows[r.row].slice(5,7).filter(Boolean);
  if(['Trauung','Tauffeier'].includes(s.type)){assert.deepEqual(names,['Wochendienst']);continue;}
  if(!names.length){assert.match(report,new RegExp(`Zeile ${r.row+1}:`));continue;}
  assert.equal(names.length,roleSize(r.name));const selected=names.map(name=>{const p=people.find(p=>p.name===name);assert.ok(p);assert.notEqual(p.preference,'NO_SERVICE');assert.ok(!weeklyExclusions.get(s.date)?.has(p.id));assert.ok(!used.has(p.id));used.add(p.id);assert.ok(membershipYears(p.year,s.date)>=(defaultMinimumYears[r.name]??0));if(s.type==='SchGD')assert.ok(currentCohort(p.year,s.date));return p;});
  if(/^\(?Rf\.\)?$/.test(r.name)){assert.ok(selected.some(p=>p.incense));assert.ok(selected.some(p=>membershipYears(p.year,s.date)>=3));}
  filled+=names.length;
 }}
 // July SchGD has cohort 2025; August overlaps 2025/2026 by the explicit boundary rule.
 // September and October admit only 2026. Never override the date rule with a fixed year.
 assert.ok(filled>0);
 const modified=new Set(services.flatMap(s=>s.type==='Wochendienst'?[s.row]:s.roles.map(r=>r.row)));
 for(let i=0;i<originalRows.length;i++){assert.deepEqual(rows[i].slice(0,5),originalRows[i].slice(0,5));if(!modified.has(i))assert.deepEqual(rows[i],originalRows[i]);}
 const before=await JSZip.loadAsync(original),after=await JSZip.loadAsync(bytes);
 assert.deepEqual(Object.keys(before.files).sort(),Object.keys(after.files).sort());
 for(const name of Object.keys(before.files))if(name!=='content.xml'&&!before.files[name].dir)assert.deepEqual(await before.file(name).async('uint8array'),await after.file(name).async('uint8array'));
 const strip=xml=>xml.replace(/<table:table-cell\b[^>]*(?:\/>|>[\s\S]*?<\/table:table-cell>)/g,cell=>cell.replace(/<text:p[^>]*>[\s\S]*?<\/text:p>/g,'').replace(/ office:value-type="string"/g,''));
 assert.equal(strip(await before.file('content.xml').async('string')),strip(await after.file('content.xml').async('string')));
 await page.locator('#minimum-years').fill('Fahnen = 6');assert.equal(await page.locator('#download').isDisabled(),true);assert.equal(await page.locator('#plan-preview').isHidden(),true);
 await page.locator('#create-plan').click();await page.waitForFunction(()=>!document.getElementById('download').disabled);
 await page.locator('#people-input').setInputFiles([]);assert.equal(await page.locator('#download').isDisabled(),true);assert.equal(await page.locator('#create-plan').isDisabled(),true);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);console.log(`Browserprüfung erfolgreich: ${filled} gewöhnliche Plätze, ${weeklyFilled} Wochendienste; heruntergeladene ODS geprüft: ${path}`);
}finally{await browser.close();}
