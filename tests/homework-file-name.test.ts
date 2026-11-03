import test from 'node:test';
import assert from 'node:assert/strict';
import {homeworkFileName} from '../src/lib/homeworkFileName';
import {builtinHomework} from '../src/lib/homeworkCatalog';
test('worksheet filenames are recognizable, bounded, safe on disk, and never add a client name',()=>{
 const snapshot=structuredClone(builtinHomework('uk')[0].snapshot);snapshot.pdfClientName='PRIVATE PERSON';const file=homeworkFileName({assignmentId:'random-id-12345678',snapshot});assert.ok(file.includes('Барометр'));assert.ok(!file.includes('PRIVATE'));assert.ok(file.endsWith('-12345678.pdf'));
 snapshot.content.title='../\\:\u0000\n'+ 'З'.repeat(160);const long=homeworkFileName({assignmentId:'../..',snapshot});assert.ok(long.length<180);assert.ok(!/[\\/:\u0000\r\n]/.test(long));
});
