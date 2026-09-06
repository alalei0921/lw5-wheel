export const TAU = Math.PI * 2;
const greenItems = ['好嫂子','澳门茶餐厅','麦当劳','虾吃虾涮','必胜客','肉夹馍','大懒龙','疙瘩汤','达美乐','猪脚饭','村上一屋','麻辣烫','烤串','牛肉丸汤','驴肉火烧','芝士肋排'];
const goldItems = ['➕奶茶','小大董','尊贵蛋包饭'];
// Original menu order and reward categories. Physical ball motion now determines the result.
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
