import test from 'node:test';
import assert from 'node:assert/strict';
import {partyRequest,parsePartyResponse} from './party-ai.ts';
const response=result=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
test('party extraction preserves similar names and non-Latin spelling',()=>{
  assert.deepEqual(parsePartyResponse(response({names:['MelZI','MelZl','Joy - Ring Master','ผู้เล่น'],unclear:true})),{names:['MelZI','MelZl','Joy - Ring Master','ผู้เล่น'],unclear:true});
});
test('truncated, refused and invalid model output cannot populate the roster',()=>{
  assert.throws(()=>parsePartyResponse({status:'incomplete',output:[]}));
  assert.throws(()=>parsePartyResponse({status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}));
  assert.throws(()=>parsePartyResponse(response({names:Array(9).fill('Player'),unclear:false})));
  assert.throws(()=>parsePartyResponse(response({names:[''],unclear:false})));
});
test('one bounded request with no reasoning, tools or stored response',()=>{
  const request=partyRequest('data:image/png;base64,example');
  assert.equal(request.max_output_tokens,600);assert.equal(request.store,false);
  assert.equal(request.reasoning.effort,'none');assert.equal(request.tools,undefined);
  assert.equal(request.input[0].content[1].detail,'high');
});
