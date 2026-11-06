// FACTOR LINKS quality gate. Node.js 18+; no dependencies.
// Usage: node tools/audit.mjs [--json]
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const match=source.match(/^const PUZZLES=(\[.*\]);\s*$/m);
if(!match)throw new Error('index.html の PUZZLES 定義が見つかりません');
const puzzles=JSON.parse(match[1]);
const bits=m=>{let n=0;for(;m;m&=m-1)n++;return n};
const gcd=(a,b)=>b?gcd(b,a%b):a;
const groups=[];
for(let r=0;r<6;r++){
  groups.push(Array.from({length:6},(_,c)=>r*6+c));
  groups.push(Array.from({length:6},(_,c)=>c*6+r));
}

function context(p){
  const edges=[];
  for(let r=0;r<6;r++)for(let c=0;c<6;c++){
    const i=r*6+c;
    if(c<5)edges.push([i,i+1,p.horizontal[r*5+c]===1]);
    if(r<5)edges.push([i,i+6,p.vertical[r*6+c]===1]);
  }
  return {p,edges,rel:p.nums.map(a=>p.nums.map(b=>gcd(a,b)>1))};
}

function validate(p){
  const errors=[];
  const unique=a=>new Set(a).size===a.length;
  if(!Array.isArray(p.nums)||p.nums.length!==6||!unique(p.nums)||p.nums.some(n=>!Number.isSafeInteger(n)||n<1))errors.push('数字セットに重複・不正値');
  if(!Array.isArray(p.solution)||p.solution.length!==36)errors.push('解答のマス数');
  if(!Array.isArray(p.givens)||!unique(p.givens)||p.givens.some(i=>!Number.isInteger(i)||i<0||i>=36))errors.push('初期数字の位置');
  if(!Array.isArray(p.horizontal)||p.horizontal.length!==30||p.horizontal.some(x=>x!==0&&x!==1))errors.push('横線30本');
  if(!Array.isArray(p.vertical)||p.vertical.length!==30||p.vertical.some(x=>x!==0&&x!==1))errors.push('縦線30本');
  if(errors.length)return errors;
  const nums=p.nums.slice().sort((a,b)=>a-b).join(',');
  for(const g of groups){
    if(g.map(i=>p.solution[i]).sort((a,b)=>a-b).join(',')!==nums){errors.push('行または列がラテン方陣でない');break}
  }
  const ctx=context(p);
  for(const [i,j,dotted] of ctx.edges){
    if((gcd(p.solution[i],p.solution[j])>1)!==dotted){errors.push('60本の線が解答と一致しない');break}
  }
  return errors;
}

function initial(ctx,givens=ctx.p.givens){
  const set=new Set(givens);
  return Array.from({length:36},(_,i)=>set.has(i)?1<<ctx.p.nums.indexOf(ctx.p.solution[i]):63);
}

// tier 1: fixed digits, row/column uniqueness, hidden singles,
//         links touching a determined digit.
// tier 2: two-sided link compatibility (arc consistency).
// tier 3: naked pairs/triples in rows and columns.
function propagate(m,ctx,tier){
  let repeat=true,iterations=0;
  while(repeat){
    if(++iterations>100)throw new Error('推理エンジンが収束しません');
    repeat=false;
    for(const g of groups){
      let singles=0;
      for(const i of g)if(bits(m[i])===1){if(singles&m[i])return false;singles|=m[i]}
      for(const i of g)if(bits(m[i])>1){
        const next=m[i]&~singles;if(!next)return false;
        if(next!==m[i]){m[i]=next;repeat=true}
      }
      for(let v=0;v<6;v++){
        const bit=1<<v,possible=g.filter(i=>m[i]&bit);
        if(!possible.length)return false;
        if(possible.length===1&&m[possible[0]]!==bit){m[possible[0]]=bit;repeat=true}
      }
      if(tier>=3)for(let subset=1;subset<64;subset++){
        const count=bits(subset);if(count<2||count>3)continue;
        const cells=g.filter(i=>(m[i]&~subset)===0);
        if(cells.length>count)return false;
        if(cells.length!==count)continue;
        for(const i of g)if(!cells.includes(i)){
          const next=m[i]&~subset;if(!next)return false;
          if(next!==m[i]){m[i]=next;repeat=true}
        }
      }
    }
    for(const [i,j,dotted] of ctx.edges){
      if(tier===1&&bits(m[i])>1&&bits(m[j])>1)continue;
      let a=0,b=0;
      for(let x=0;x<6;x++)if(m[i]&(1<<x))
        for(let y=0;y<6;y++)if((m[j]&(1<<y))&&ctx.rel[x][y]===dotted){a|=1<<x;b|=1<<y}
      if(!a||!b)return false;
      if(a!==m[i]){m[i]=a;repeat=true}
      if(b!==m[j]){m[j]=b;repeat=true}
    }
  }
  return true;
}

function unresolved(ctx,tier){
  const m=initial(ctx);
  if(!propagate(m,ctx,tier))throw new Error('論理ソルバーで矛盾');
  return m.filter(v=>bits(v)>1).length;
}

// Backtracking proof; never mistake a search-budget overrun for uniqueness.
function solutionCount(ctx,givens=ctx.p.givens,limit=2){
  let solutions=0,nodes=0;
  function recurse(m){
    if(solutions>=limit)return;
    if(++nodes>250000)throw new Error('探索上限超過: 一意解未検証');
    if(!propagate(m,ctx,3))return;
    let pos=-1,smallest=7;
    for(let i=0;i<36;i++){
      const n=bits(m[i]);
      if(n>1&&n<smallest){smallest=n;pos=i}
    }
    if(pos===-1){solutions++;return}
    const mask=m[pos];
    for(let b=0;b<6;b++)if(mask&(1<<b)){
      const next=m.slice();next[pos]=1<<b;recurse(next);
      if(solutions>=limit)return;
    }
  }
  recurse(initial(ctx,givens));
  return {solutions,nodes};
}

let failures=0;
const results=[];
for(const p of puzzles){
  const errors=validate(p);
  if(errors.length){
    failures++;results.push({id:p.id,errors});continue;
  }
  const ctx=context(p);
  const proof=solutionCount(ctx);
  if(proof.solutions!==1)failures++;
  const levels=[1,2,3].map(n=>unresolved(ctx,n));
  const individuallyRedundant=p.givens.filter(i=>
    solutionCount(ctx,p.givens.filter(j=>j!==i)).solutions===1
  ).length;
  const tier=levels[0]===0?1:levels[1]===0?2:levels[2]===0?3:4;
  results.push({
    id:p.id,name:p.name,givens:p.givens.length,dotted:ctx.edges.filter(e=>e[2]).length,
    solutions:proof.solutions,searchNodes:proof.nodes,
    unresolvedByTier:levels,difficultyTier:tier,individuallyRedundant
  });
}
if(process.argv.includes('--json'))console.log(JSON.stringify({failures,results},null,2));
else{
  console.log('FACTOR LINKS — puzzle audit');
  console.log('No.  初期  点線  一意解  Lv1残  Lv2残  Lv3残  個別冗長');
  for(const r of results)console.log(r.errors?
    String(r.id).padStart(2)+'  ERROR: '+r.errors.join(' / '):
    [String(r.id).padStart(2),String(r.givens).padStart(4),String(r.dotted).padStart(4),
     String(r.solutions).padStart(5),...r.unresolvedByTier.map(v=>String(v).padStart(5)),
     String(r.individuallyRedundant).padStart(6)].join('  '));
  console.log(failures?'FAIL: '+failures+'問に問題があります':'PASS: '+results.length+'問の解・線・一意性を検証しました');
}
if(failures)process.exitCode=1;
