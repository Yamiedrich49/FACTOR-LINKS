// Measurable UI guardrails: text contrast and success-sound harmony.
// Does not replace screenshot inspection, listening, or iPhone touch testing.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

function color(selector){
 const start=html.indexOf(selector+'{');
 assert.ok(start>=0,'missing CSS selector: '+selector);
 const rule=html.slice(start,html.indexOf('}',start));
 const match=rule.match(/(?:^|[;{])color:(#[0-9a-fA-F]{6})/);
 assert.ok(match,'missing explicit color: '+selector);
 return match[1];
}
function luminance(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const c=rgb.map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
function contrast(a,b){
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
const tests=[
 ['.legend','#f6f8f5'],
 ['.progresscount','#f6f8f5'],
 ['.boardmeta .tiny','#fffefa'],
 ['.boardstatus','#fffefa'],
 ['.dockheader span','#fffefa'],
 ['.lessontext span','#f0f8f3']
];
for(const [selector,bg] of tests){
 const fg=color(selector),ratio=contrast(fg,bg);
 assert.ok(ratio>=4.5,selector+': text contrast '+ratio.toFixed(2)+' < 4.5');
}
const fragment=html.match(/if\(kind==='win'\)\{[\s\S]*?\n  \}/)?.[0];
assert.ok(fragment,'win sound missing');
const notes=fragment.match(/\[([\d.,]+)\]\.forEach/)?.[1]?.split(',').map(Number);
assert.ok(notes&&notes.length===4,'expected four-note win arpeggio');
const semitones=[0,4,7,12];
for(let i=0;i<4;i++){
 const expected=notes[0]*2**(semitones[i]/12);
 assert.ok(Math.abs(notes[i]/expected-1)<.006,'win sound not in major triad: note '+i);
}
assert.ok(html.includes("tone(c,520,.062,.015,'triangle',420)")&&
 html.includes("tone(c,260,.062,.009,'sine',210)"),
 'placement click must use matching octave voices');
console.log('PASS: 6 key text contrasts ≥4.5:1; G-major completion notes; octave placement tones');
