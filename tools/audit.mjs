// FACTOR LINKS quality gate: validates 6 pair lessons, 3 Latin tutorials and 47 linked boards.
// Node.js 18+, no dependencies. Usage: node tools/audit.mjs [--json]
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const dataset=JSON.parse(readFileSync(new URL('../data/intro-levels.json',import.meta.url),'utf8'));
const parse=name=>{
 const found=html.match(new RegExp('^const '+name+'=(\\[.*\\]);\\s*$','m'));
 if(!found)throw Error(name+' not embedded as JSON array');
 return JSON.parse(found[1]);
};
const pairs=parse('PAIR_PUZZLES'),intro=parse('INTRO_PUZZLES'),legacy=parse('LEGACY_PUZZLES');
const puzzles=[...pairs,...intro,...legacy];
const bits=m=>{let a=0;for(;m;m&=m-1)a++;return a};
const gcd=(a,b)=>b?gcd(b,a%b):a;
const unique=xs=>new Set(xs).size===xs.length;
const ctxFor=p=>{
 const n=p.size||6,edges=[],groups=[];
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){
  const i=r*n+c;
  if(c<n-1)edges.push([i,i+1,p.horizontal[r*(n-1)+c]===1]);
  if(r<n-1)edges.push([i,i+n,p.vertical[r*n+c]===1]);
 }
 for(let k=0;k<n;k++){
  groups.push(Array.from({length:n},(_,v)=>k*n+v));
  groups.push(Array.from({length:n},(_,v)=>v*n+k));
 }
 return {p,n,edges,groups,rel:p.nums.map(a=>p.nums.map(b=>gcd(a,b)>1)),full:(1<<n)-1};
};
function validate(p){
 const err=[],n=p.size||6;
 if(p.mode==='pair'){
  if(p.solution.length!==2||p.givens.length!==1||p.givens[0]!==0)err.push('pair shape');
  if(!Array.isArray(p.nums)||p.nums.length<2||p.nums.length>4||!unique(p.nums)||p.nums.some(x=>!Number.isSafeInteger(x)||x<1))err.push('pair options');
  if(p.horizontal.length!==1||p.vertical.length!==0)err.push('pair line');
  if(!err.length){
   const [a,b]=p.solution,correct=p.nums.filter(v=>(gcd(a,v)>1)===(p.horizontal[0]===1));
   if(correct.length!==1||correct[0]!==b)err.push('pair requires exactly one correct option');
  }
  return err;
 }
 if(!Number.isInteger(n)||n<2||n>6)err.push('board size');
 if(!Array.isArray(p.nums)||p.nums.length!==n||!unique(p.nums)||p.nums.some(x=>!Number.isSafeInteger(x)||x<=0))err.push('number set');
 if(!Array.isArray(p.solution)||p.solution.length!==n*n)err.push('solution length');
 if(!Array.isArray(p.givens)||!unique(p.givens)||p.givens.some(i=>!Number.isInteger(i)||i<0||i>=n*n))err.push('givens');
 if(!Array.isArray(p.horizontal)||p.horizontal.length!==n*(n-1)||p.horizontal.some(x=>x!==0&&x!==1))err.push('horizontal lines');
 if(!Array.isArray(p.vertical)||p.vertical.length!==n*(n-1)||p.vertical.some(x=>x!==0&&x!==1))err.push('vertical lines');
 if(err.length)return err;
 const nums=[...p.nums].sort((a,b)=>a-b).join(',');
 for(let k=0;k<n;k++){
  if(p.solution.slice(k*n,(k+1)*n).sort((a,b)=>a-b).join(',')!==nums)err.push('row '+(k+1));
  if(Array.from({length:n},(_,i)=>p.solution[i*n+k]).sort((a,b)=>a-b).join(',')!==nums)err.push('column '+(k+1));
 }
 for(const [i,j,d] of ctxFor(p).edges)if((gcd(p.solution[i],p.solution[j])>1)!==d){err.push('line inconsistency');break}
 return err;
}
const initial=(c,givens=c.p.givens)=>{
 const set=new Set(givens);
 return Array.from({length:c.n*c.n},(_,i)=>set.has(i)?1<<c.p.nums.indexOf(c.p.solution[i]):c.full);
};
function propagate(m,c,tier=3){
 const {n,groups,edges,rel}=c;
 let changed=true,iter=0;
 while(changed){
  if(++iter>100)throw Error('propagate nonconvergence');
  changed=false;
  for(const g of groups){
   let singles=0;
   for(const i of g)if(bits(m[i])===1){if(singles&m[i])return false;singles|=m[i]}
   for(const i of g)if(bits(m[i])>1){
    const next=m[i]&~singles;
    if(!next)return false;
    if(next!==m[i]){m[i]=next;changed=true}
   }
   for(let v=0;v<n;v++){
    const bit=1<<v,possible=g.filter(i=>m[i]&bit);
    if(!possible.length)return false;
    if(possible.length===1&&m[possible[0]]!==bit){m[possible[0]]=bit;changed=true}
   }
   if(tier>=3)for(let sub=1;sub<(1<<n);sub++){
    const size=bits(sub);if(size<2||size>3)continue;
    const positions=g.filter(i=>(m[i]&~sub)===0);
    if(positions.length>size)return false;
    if(positions.length!==size)continue;
    for(const i of g)if(!positions.includes(i)){
     const next=m[i]&~sub;if(!next)return false;
     if(next!==m[i]){m[i]=next;changed=true}
    }
   }
  }
  for(const [i,j,d] of edges){
   if(tier===1&&bits(m[i])>1&&bits(m[j])>1)continue;
   let a=0,b=0;
   for(let x=0;x<n;x++)if(m[i]&(1<<x))for(let y=0;y<n;y++)
    if((m[j]&(1<<y))&&rel[x][y]===d){a|=1<<x;b|=1<<y}
   if(!a||!b)return false;
   if(a!==m[i]){m[i]=a;changed=true}
   if(b!==m[j]){m[j]=b;changed=true}
  }
 }
 return true;
}
function countSolutions(c,givens=c.p.givens,limit=2){
 let found=0,nodes=0;
 function dfs(m){
  if(found>=limit)return;
  if(++nodes>250000)throw Error('exhaustive search budget exceeded');
  if(!propagate(m,c))return;
  let chosen=-1,lowest=7;
  for(let i=0;i<m.length;i++){const v=bits(m[i]);if(v>1&&v<lowest){chosen=i;lowest=v}}
  if(chosen<0){found++;return}
  for(let b=0;b<c.n;b++)if(m[chosen]&(1<<b)){
   const next=m.slice();next[chosen]=1<<b;dfs(next);
   if(found>=limit)return;
  }
 }
 dfs(initial(c,givens));
 return {solutions:found,nodes};
}
let problems=0;
if(JSON.stringify(dataset.levels)!==JSON.stringify(intro)){console.error('Embedded intro puzzles differ from data/intro-levels.json');problems++}
if(puzzles.length!==56){console.error('Expected 56 stages, found '+puzzles.length);problems++}
if(!unique(puzzles.map(p=>p.id))){console.error('Duplicated puzzle ids');problems++}
const records=[];
for(let i=0;i<puzzles.length;i++){
 const p=puzzles[i],n=p.size||6,errors=validate(p);
 if(errors.length){records.push({stage:i+1,name:p.name,n,errors});problems++;continue}
 if(p.mode==='pair'){
  records.push({stage:i+1,name:p.name,n,mode:p.mode,givens:1,empty:1,lines:1,solutions:1,remaining:[0,0,0],proofNodes:1});
  continue;
 }
 const c=ctxFor(p);
 if(p.mode==='latin')c.edges=[];
 const proof=countSolutions(c);
 if(proof.solutions!==1)problems++;
 const remaining=[1,2,3].map(t=>{
  const m=initial(c);
  if(!propagate(m,c,t))throw Error('Unexpected contradiction in stage '+(i+1));
  return m.filter(x=>bits(x)>1).length;
 });
 records.push({stage:i+1,name:p.name,n,givens:p.givens.length,empty:n*n-p.givens.length,
  lines:p.mode==='latin'?0:2*n*(n-1),solutions:proof.solutions,remaining,proofNodes:proof.nodes});
}
if(process.argv.includes('--json'))console.log(JSON.stringify({problems,records},null,2));
else{
 console.log('FACTOR LINKS — board / uniqueness / logic audit');
 console.log('No. size  fixed empty lines unique  tier1 tier2 tier3');
 for(const r of records)console.log(r.errors?String(r.stage)+' ERROR '+r.errors.join(', '):
  [String(r.stage).padStart(2),String(r.n+'x'+r.n).padStart(4),
   String(r.givens).padStart(5),String(r.empty).padStart(5),String(r.lines).padStart(5),
   String(r.solutions).padStart(5),...r.remaining.map(x=>String(x).padStart(5))].join('  '));
 console.log(problems? 'FAIL: '+problems+' errors':'PASS: '+records.length+' stages, all correct and uniquely solvable');
}
if(problems)process.exitCode=1;
