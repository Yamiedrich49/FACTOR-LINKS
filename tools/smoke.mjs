// Minimal DOM smoke test for Factor Links.
// Checks board creation, keypad, undo, completion, and legacy saves.
// Node.js 18+. No external packages. Real mobile visual testing remains necessary.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if(!script)throw Error('Inline game script not found');
const parse=name=>JSON.parse(html.match(new RegExp('^const '+name+'=(\\[.*\\]);\\s*$','m'))[1]);
const intro=parse('INTRO_PUZZLES'),oldLevels=parse('LEGACY_PUZZLES');
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
for(let stage=0;stage<50;stage++){
 app.load(stage);
 const {number:n,cells,lines,keys,missing,selected}=app.state();
 distribution[n]++;
 assert.equal(cells,n*n,'cells stage '+(stage+1));
 assert.equal(lines,2*n*(n-1),'edges stage '+(stage+1));
 assert.equal(keys,n,'keypad stage '+(stage+1));
 assert.ok(missing>0&&missing<n*n,'blanks stage '+(stage+1));
 assert.ok(selected>=0,'editable selection stage '+(stage+1));
 const nums=stage<40?intro[stage].nums:oldLevels[stage-40].nums;
 app.pressKey(nums[0]);
 assert.equal(app.state().missing,missing-1,'input stage '+(stage+1));
 app.undo();
 assert.equal(app.state().missing,missing,'undo stage '+(stage+1));
 assert.ok(app.solve(),'complete stage '+(stage+1));
}
assert.equal(app.completed().size,50);
assert.deepEqual(distribution,{2:3,3:9,4:13,5:10,6:15});
const oldSaved=new Map([['kyoyakusu-link-play-v1',JSON.stringify({
 index:2,completed:[3],sound:false,
 states:{2:{filled:oldLevels[2].solution.slice(),notes:{},hinted:[]}}
})]]);
const migrated=launch(oldSaved);
assert.equal(migrated.app.state().index,42,'legacy stage index');
assert.equal(migrated.app.state().id,3,'legacy stage puzzle id');
assert.ok(migrated.app.completed().has(3),'legacy cleared set');
assert.ok(oldSaved.has('kyoyakusu-link-play-v2'),'new save created');
console.log('PASS: 50-stage UI smoke, input/undo/clear and legacy save migration');
