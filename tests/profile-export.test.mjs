import test from 'node:test';
import assert from 'node:assert/strict';
import {personalExportRows} from '../src/lib/profileExportDetails.ts';
const profile={privateDetails:{phone:'123',marital_status:'Married',blood_group:'O+',gender:'Female',home_number:'456',address:'Example address',pan:'SECRET-PAN',aadhaar:'SECRET-ID',dob:'1990-01-01'}};
test('profile exports omit personal fields unless explicitly included',()=>{assert.deepEqual(personalExportRows(profile),[]);assert.deepEqual(personalExportRows(profile,false),[]);assert.deepEqual(personalExportRows({privateDetails:null},true),[]);});
test('authorized personal export includes only the six requested fields',()=>{const rows=personalExportRows(profile,true);assert.equal(rows.length,6);assert.deepEqual(rows.map(r=>r[1]),['123','Married','O+','Female','456','Example address']);assert.ok(!JSON.stringify(rows).includes('SECRET'));assert.ok(!JSON.stringify(rows).includes('1990'));});
