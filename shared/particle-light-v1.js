(() => {
  'use strict';
  // Cached Canvas sprites reuse the double-Gaussian falloff and feathered
  // nucleus/corona formulas from vendor/nebula-visuals-v2.js's fragment shaders.
  // Paint-only utility: no animation loop, state, network or device access.
  const colors = { ice:[157,226,246], pearl:[225,239,244], gold:[245,212,154], violet:[167,153,217] };
  const cache = new Map();
  function sprite(tint, kind = 'point') {
    const key = tint + ':' + kind;
    if (cache.has(key)) return cache.get(key);
    const size = kind === 'core' ? 128 : 48;
    const image = document.createElement('canvas');image.width = image.height = size;
    const c = image.getContext('2d');
    if (!c) return null;
    const pixels = c.createImageData(size,size), color = colors[tint] || colors.ice;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r2=u*u+v*v,r=Math.sqrt(r2);
      let alpha;
      if(kind==='core')alpha=Math.exp(-r2*150)+Math.exp(-r*9)*.42;
      else if(kind==='dust')alpha=Math.exp(-r2*4)*.55;
      else alpha=Math.exp(-r2*7)*.60+Math.exp(-r2*28)*.72;
      const edge=Math.max(0,Math.min(1,(1-r2)/.38));alpha*=edge*edge*(3-2*edge);
      const i=(y*size+x)*4;
      pixels.data[i]=color[0];pixels.data[i+1]=color[1];pixels.data[i+2]=color[2];pixels.data[i+3]=Math.round(Math.min(1,alpha)*255);
    }
    c.putImageData(pixels,0,0);cache.set(key,image);return image;
  }
  function paint(ctx,x,y,radius,alpha,tint='ice',kind='point') {
    if(alpha<=.002||radius<=0)return;
    const image=sprite(tint,kind);if(!image)return;
    const previous=ctx.globalAlpha;ctx.globalAlpha=previous*Math.min(1,alpha);
    ctx.drawImage(image,x-radius,y-radius,radius*2,radius*2);ctx.globalAlpha=previous;
  }
  // Build a fixed small atlas once; never allocate a texture during animation.
  for(const tint of Object.keys(colors))for(const kind of ['point','dust','core'])sprite(tint,kind);
  window.LW5ParticleLight=Object.freeze({paint});
})();
