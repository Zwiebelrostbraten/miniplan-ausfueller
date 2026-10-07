import { describe, it, expect } from 'vitest';
import { assignServices, currentCohort, defaultMinimumYears } from '../src/core/assignment.js';
const person = (id, year = 2020, extra = {}) => ({ id, household: id, name: id, year, weekly: false, incense: false, preference: 'NONE', ...extra });
const service = (roles, date = '2026-09-06', type = 'Eu') => ({ date, type, roles: roles.map((name, row) => ({ name, row })) });
describe('Einteilung', () => {
 it('uses strict defaults and one/two places without duplicate people', () => {
  expect(defaultMinimumYears['kl. Kreuz']).toBe(4); expect(defaultMinimumYears.Fahnen).toBe(5);
  const r = assignServices([service(['kl. Kreuz', 'Lautspr.', 'Altar'])], Array.from({length:4},(_,i)=>person(`${i}`)));
  expect(r.filled).toBe(4); expect(new Set(r.assignments.flatMap(a=>a.people)).size).toBe(4); expect(r.conflicts).toEqual([]);
 });
 it('excludes NO_SERVICE and Sunday weekly people, reporting exact unfilled role', () => {
  const r = assignServices([service(['Altar'])], [person('a',2020,{preference:'NO_SERVICE'}),person('b',2020,{weekly:true})]);
  expect(r.filled).toBe(0); expect(r.unfilled).toBe(2); expect(r.conflicts[0]).toMatchObject({date:'2026-09-06',role:'Altar'}); expect(r.conflicts[0].reason).toMatch(/Kandidaten/);
 });
 it('defines August boundaries including overlapping cohorts', () => {
  expect(currentCohort(2025,'2026-07-31')).toBe(true); expect(currentCohort(2026,'2026-07-31')).toBe(false);
  expect(currentCohort(2025,'2026-08-31')).toBe(true); expect(currentCohort(2026,'2026-08-01')).toBe(true); expect(currentCohort(2025,'2026-09-01')).toBe(false);
  const r = assignServices([service(['Altar'],'2026-07-01','SchGD')],[person('old',2024),person('new',2026)]);
  expect(r.filled).toBe(0); expect(r.conflicts[0].reason).toMatch(/Jahrgang/);
 });
 it('reserves eligible incense pair and uses full years from August', () => {
  const people=[person('trained',2025,{incense:true}),person('senior',2023),person('x',2026),person('y',2026)];
  const r=assignServices([service(['Altar','(Rf.)'],'2026-08-01')],people);
  expect(r.filled).toBe(4); expect(r.assignments.find(a=>a.role==='(Rf.)').people.sort()).toEqual(['senior','trained']);
  expect(assignServices([service(['Rf.'],'2026-07-31')],people).filled).toBe(0);
  expect(assignServices([service(['Fahnen','kl. Kreuz'])],[person('a',2022),person('b',2022),person('c',2022)]).filled).toBe(1);
 });
 it('marks weddings and baptisms as weekly duty, skipping pure weekly rows', () => {
  const r=assignServices([service(['Altar'],'2026-09-01','Trauung'),service(['Altar'],'2026-09-02','Tauffeier'),service([],'2026-09-03','Wochendienst')],[]);
  expect(r.assignments.map(a=>a.marker)).toEqual(['Wochendienst','Wochendienst']); expect(r.unfilled).toBe(0);
 });
 it('is deterministic, prefers younger cohorts fairly and spreads services', () => {
  const services=Array.from({length:24},(_,i)=>service(['Altar'],`2026-10-${String(i+1).padStart(2,'0')}`));
  const people=[person('old',2010),person('young',2025),person('middle',2020),person('young2',2025)];
  const r=assignServices(services,people); expect(assignServices(services,people)).toEqual(r);
  expect(r.distribution.find(p=>p.id==='young').count).toBeGreaterThan(r.distribution.find(p=>p.id==='old').count);
  expect(r.distribution.every(p=>p.lastGap===null || p.lastGap>=1)).toBe(true);
 });
 it('prefers households and reciprocal pairs when fairness is equal', () => {
  const p=[person('a',2020,{preference:'PAIR:b'}),person('b',2020,{preference:'PAIR:a'}),person('c'),person('d')];
  expect(assignServices([service(['Altar'])],p).assignments[0].people).toEqual(['a','b']);
  p[0].preference='NONE';p[1].preference='NONE';p[2].household='h';p[3].household='h';
  expect(assignServices([service(['Altar'])],p).assignments[0].people).toEqual(['c','d']);
 });
});
it('uses PREF after equal fairness and keeps wishes below hard rules',()=>{
 const people=[person('a',2020,{preference:'PREF:d'}),person('b'),person('c'),person('d')];
 expect(assignServices([service(['Altar'])],people).assignments[0].people).toEqual(['a','d']);
 people[3].preference='NO_SERVICE';
 expect(assignServices([service(['Altar'])],people).assignments[0].people).not.toContain('d');
});
it('requires a trained incense person and a different member with three full years',()=>{
 const trainedSenior=person('trained-senior',2021,{incense:true}), junior=person('junior',2026), trainedNew=person('trained-new',2025,{incense:true}), experienced=person('experienced',2023);
 expect(assignServices([service(['Rf.'],'2026-08-01')],[trainedSenior,junior]).filled).toBe(0);
 expect(assignServices([service(['Rf.'],'2026-08-01')],[trainedNew,experienced]).filled).toBe(2);
});
