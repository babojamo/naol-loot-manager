import assert from 'node:assert/strict';
import {lootImageFor,setLootImage} from '../lib/loot-images.ts';
const shared={Sunstone:'data:image/png;base64,b3JpZ2luYWw='};
const original=structuredClone(shared);
let first={};
first=setLootImage(first,'sunstone',lootImageFor(shared,'SUNSTONE'));
const second=setLootImage({},'Sunstone',lootImageFor(shared,'Sunstone'));
first=setLootImage(first,'Sunstone','data:image/png;base64,Y3VzdG9t');
assert.deepEqual(shared,original);
assert.equal(lootImageFor(second,'Sunstone'),shared.Sunstone);
assert.notEqual(lootImageFor(first,'Sunstone'),shared.Sunstone);
// The run-save path checks local images before asking for a shared copy.
assert.equal(['SUNSTONE'].filter(name=>!lootImageFor(first,name)).length,0);
console.log('PASS: copied images are independent and existing local images are preserved.');
