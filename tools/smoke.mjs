// Minimal DOM smoke test for Factor Links.
// Checks board creation, keypad, undo, completion, and legacy saves.
// Node.js 18+. No external packages. Real mobile visual testing remains necessary.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script)throw Error('Inline game script not found');
const parse=name=>JSON.parse(html.match(new RegExp('^const '+name+'=(\\[.*\\]);\\s*$','m'))[1]);
const pairs=parse('PAIR_PUZZLES'),intro=parse('INTRO_PUZZLES'),oldLevels=parse('LEGACY_PUZZLES'),all=[...pairs,...intro,...oldLevels];
class Element{
 constructor(tag='div'){
  this.tagName=tag;this.children=[];this.dataset={};this.attrs={};
  this.textContent='';this.innerHTML='';this.className='';this.disabled=false;
  this.style={setProperty:(key,value)=>this.style[key]=value};
  const classes=new Set();
  this.classList={
   add:(...keys)=>keys.forEach(x=>classes.add(x)),
   remove:(...keys)=>keys.forEach(x=>classes.delete(x)),
   contains:key=>classes.has(key),
   toggle:(key,force)=>{const on=force===undefined?!classes.has(key):force;on?classes.add(key):classes.delete(key);return on}
  };
 }
 addEventListener(){}setAttribute(key,v){this.attrs[key]=String(v)}
 appendChild(el){this.children.push(el);return el}
 append(...els){this.children.push(...els)}
 replaceChildren(...els){this.children=els}
 getBoundingClientRect(){return {left:0,right:100,top:0,bottom:100}}
 remove(){}
}
function launch(stored=new Map()){
 const ids=new Map();
 const document={
  createElement:tag=>new Element(tag),
  createDocumentFragment:()=>new Element('fragment'),
  querySelector:id=>{if(!ids.has(id))ids.set(id,new Element('container'));return ids.get(id)},
  body:new Element('body'),addEventListener:()=>{},elementFromPoint:()=>null
 };
 const localStorage={getItem:key=>stored.get(key)||null,setItem:(key,val)=>stored.set(key,String(val))};
 const window={matchMedia:()=>({matches:true})};
 const fn=new Function('document','window','localStorage','matchMedia','setTimeout','clearTimeout','performance',
  script+"\nreturn {load,undo,pressKey,check,state:()=>({index:stage,number:width(),cells:boardCells.length,lines:edgeRefs.length,keys:keyRefs.length,missing:countMissing(),selected,id:current().id}),solve:()=>{answers=current().solution.slice();check();return cleared.has(current().id)},completed:()=>cleared};");
 const app=fn(document,window,localStorage,window.matchMedia,()=>1,()=>{},{now:()=>0});
 return {app,stored};
}
const {app}=launch(),distribution={2:0,3:0,4:0,5:0,6:0};
for(let stage=0;stage<56;stage++){
 app.load(stage);
 const {number:n,cells,lines,keys,missing,selected}=app.state();
 const p=all[stage];
 distribution[n]++;
 assert.equal(cells,p.mode==='pair'?2:n*n,'cells stage '+(stage+1));
 assert.equal(lines,p.mode==='pair'?1:p.mode==='latin'?0:2*n*(n-1),'edges stage '+(stage+1));
 assert.equal(keys,p.nums.length,'keypad stage '+(stage+1));
 assert.ok(missing>0&&missing<cells,'blanks stage '+(stage+1));
 assert.ok(selected>=0,'editable selection stage '+(stage+1));
 const nums=p.nums;
 app.pressKey(nums[0]);
 assert.equal(app.state().missing,missing-1,'input stage '+(stage+1));
 app.undo();
 assert.equal(app.state().missing,missing,'undo stage '+(stage+1));
 assert.ok(app.solve(),'complete stage '+(stage+1));
}
assert.equal(app.completed().size,56);
assert.deepEqual(distribution,{2:9,3:9,4:13,5:10,6:15});
const newPlayer=launch();
newPlayer.app.load(0);
newPlayer.app.pressKey(3);newPlayer.app.check();
assert.ok(!newPlayer.app.completed().has(2001),'wrong factor answer must not clear');
newPlayer.app.pressKey(4);newPlayer.app.check();
assert.ok(newPlayer.app.completed().has(2001),'correct factor answer should clear');
const oldSaved=new Map([['kyoyakusu-link-play-v1',JSON.stringify({
 index:2,completed:[3],sound:false,
 states:{2:{filled:oldLevels[2].solution.slice(),notes:{},hinted:[]}}
})]]);
const migrated=launch(oldSaved);
assert.equal(migrated.app.state().index,48,'legacy stage index');
assert.equal(migrated.app.state().id,3,'legacy stage puzzle id');
assert.ok(migrated.app.completed().has(3),'legacy cleared set');
assert.ok(oldSaved.has('kyoyakusu-link-play-v3'),'new save created');
const v2Saved=new Map([['kyoyakusu-link-play-v2',JSON.stringify({
 index:42,completed:[3,1008],sound:true,
 states:{42:{filled:oldLevels[2].solution.slice(),notes:{},hinted:[]}}
})]]);
const v2Migrated=launch(v2Saved);
assert.equal(v2Migrated.app.state().index,48,'v2 saved stage shifted by six');
assert.equal(v2Migrated.app.state().id,3,'v2 retained original puzzle');
assert.ok(v2Migrated.app.completed().has(1008),'v2 intro completion retained');
console.log('PASS: 56-stage UI smoke, pair/latin/link checks, input/undo/clear and v1/v2 migration');
