export const TAU = Math.PI * 2;
const greenItems = ['好嫂子','澳门茶餐厅','麦当劳','虾吃虾涮','必胜客','肉夹馍','大懒龙','疙瘩汤','达美乐','猪脚饭','村上一屋','麻辣烫','烤串','牛肉丸汤','驴肉火烧','芝士肋排'];
const goldItems = ['➕奶茶','小大董','尊贵蛋包饭'];
// Preserve the original order, equal weights, and special reward categories.
export const segments = (() => {
  const out = [], golds = [...goldItems];
  const interval = Math.ceil(greenItems.length / goldItems.length);
  let gi = 0;
  for (let i = 0; i < greenItems.length + goldItems.length; i++) {
    if (i % (interval + 1) === interval && golds.length) out.push({label:golds.shift(),tier:'gold',weight:1});
    else if (gi < greenItems.length) out.push({label:greenItems[gi++],tier:'green',weight:1});
    else if (golds.length) out.push({label:golds.shift(),tier:'gold',weight:1});
  }
  while(golds.length) out.push({label:golds.shift(),tier:'gold',weight:1});
  return out;
})();
export const slice = TAU / segments.length;
export const modulo = (n, d = TAU) => ((n % d) + d) % d;
export function pickIndex(random = Math.random) {
  const total = segments.reduce((s,x) => s+x.weight,0);
  let value = random() * total;
  for(let i=0;i<segments.length;i++) {value -= segments[i].weight;if(value < 0) return i;}
  return segments.length-1;
}
export function targetAngle(index, current, turns = 7, jitter = 0) {
  const stop = (index + .5) * slice + jitter * slice * .15;
  return current + turns * TAU + modulo(stop - modulo(current));
}
export function indexAtPointer(angle) {return Math.floor(modulo(angle) / slice) % segments.length;}
// Integrated symmetric acceleration followed by a longer, smooth deceleration.
export function spinEase(t) {const q=Math.max(0,Math.min(1,t));return 1 - Math.pow(1-q,4)*(1+4*q);}
