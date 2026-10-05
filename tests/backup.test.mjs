import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {createEmployeeArchive,employeeBackupName} from '../src/lib/employeeBackup.ts';
const snapshot={schema_version:1,exported_at:'2026-09-30T12:00:00Z',employee:{id:'one',full_name:'Example Person',avatar_path:'one/photo.png'},entries:[{id:'entry',description:'=malicious,formula',minutes:120}],profile_documents:[{id:'doc',name:'../offer.pdf',object_path:'one/offer.pdf'}]};
test('employee archive preserves all records and files with safe filenames and CSV',async()=>{
 const paths=[];const archive=await createEmployeeArchive(snapshot,async(bucket,path)=>{paths.push([bucket,path]);return new TextEncoder().encode('file contents').buffer},()=>{});
 const zip=await JSZip.loadAsync(archive);assert.deepEqual(JSON.parse(await zip.file('employee-backup.json').async('string')),snapshot);
 assert.match(await zip.file('timesheet-entries.csv').async('string'),/'=malicious/);assert.equal(paths.length,2);
 assert.ok(zip.file('profile-files/doc-.._offer.pdf'));assert.equal(await zip.file('profile-photo/photo.png').async('string'),'file contents');
 assert.equal(employeeBackupName(snapshot),'Tekzenit-Example_Person-2026-09-30.zip');
});
test('employee archive fails rather than silently skipping an inaccessible file',async()=>{
 await assert.rejects(createEmployeeArchive(snapshot,async()=>{throw Error('File unavailable')},()=>{}),/File unavailable/);
});
