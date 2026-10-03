(() => {
  'use strict';
  // Small retained painter queue for the Canvas scene. Larger z is nearer.
  // Geometry and its glow share a depth; there is no final all-scene bloom pass.
  class DepthScene {
    constructor(capacity=1600) {
      this.pool=Array.from({length:capacity},()=>({}));
      this.order=[];this.used=0;
    }
    reset(){this.used=0;this.order.length=0;}
    add(kind,z){
      if(!Number.isFinite(z)||this.used>=this.pool.length)return null;
      const item=this.pool[this.used];item.kind=kind;item.z=z;item.sequence=this.used++;
      this.order.push(item);return item;
    }
    render(ctx,paint){
      this.order.sort((a,b)=>a.z-b.z||a.sequence-b.sequence);
      for(const item of this.order){
        ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
        try{paint(item,ctx);}finally{ctx.restore();}
      }
    }
  }
  window.LW5DepthScene=DepthScene;
})();
