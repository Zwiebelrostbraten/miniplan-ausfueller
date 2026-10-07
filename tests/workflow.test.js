import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
it('offers only two ODS inputs and an initially disabled assignment/download',()=>{
 const html=readFileSync('src/index.html','utf8');
 expect((html.match(/type="file"/g)||[])).toHaveLength(2);
 expect(html).not.toMatch(/PDF|XLSX|CSV|export-format|add-service/);
 expect(html).toMatch(/id="create-plan"[^>]*disabled/);
 expect(html).toMatch(/id="download"[^>]*disabled/);
 expect(html).toContain('Wochendienst=1');
});
