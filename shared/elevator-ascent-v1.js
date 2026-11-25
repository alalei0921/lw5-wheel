(() => {
  'use strict';
  const canvas = document.getElementById('elevatorAscent');
  const dialog = document.getElementById('elevatorDialog');
  const sheet = dialog?.querySelector('.elevator-sheet');
  const label = document.getElementById('elevatorPhase');
  if (!canvas || !sheet || !label) return;
  let ctx;
  try { ctx = canvas.getContext('2d'); } catch (_) {}
  if (!ctx || !window.LW5DepthScene) { canvas.dataset.renderMode = 'fallback'; return; }
  canvas.parentElement.classList.add('ascent-rendered');

  function paintSky(ctx, t, discovery) {
    const width = 640, height = 520;
    if (!paintSky.layers) {
      let seed = 752949;
      function rnd() {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      }
      function layer(draw) {
        const canvas = document.createElement('canvas');
        canvas.width = 960; canvas.height = 825;
        const p = canvas.getContext('2d'); p.scale(1.5,1.5);
        draw(p);
        return canvas;
      }
      function fill(p,color,x=0,y=0,w=640,h=550) {p.fillStyle=color; p.fillRect(x,y,w,h);}
      function gradient(p,y0,y1,stops) {
        const g=p.createLinearGradient(0,y0,0,y1);
        for(const [at,color] of stops) g.addColorStop(at,color);
        return g;
      }
      function bloom(p,x,y,r,colors,sx=1,sy=1) {
        p.save();p.translate(x,y);p.scale(sx,sy);
        const g=p.createRadialGradient(0,0,0,0,0,r);
        for(const [at,color] of colors)g.addColorStop(at,color);
        fill(p,g,-r,-r,r*2,r*2);p.restore();
      }
      const sky=layer(p=>{
        fill(p,gradient(p,0,495,[[0,'#46847f'],[.27,'#a0c7b4'],[.55,'#f0d8aa'],[.77,'#f5c7a4'],[1,'#83a59b']]));
        bloom(p,415,149,198,[[0,'rgba(255,194,124,.86)'],[.41,'rgba(255,218,154,.46)'],[1,'rgba(255,207,156,0)']],1.21,.96);
        // Flecks and translucent brush marks keep the large sky from feeling flat.
        for(let i=0;i<6800;i++)fill(p,rnd()>.5?'rgba(255,241,198,.1)':'rgba(43,95,89,.09)',rnd()*640,rnd()*500,rnd()*2.4+.3,.4+rnd()*.6);
        p.save();p.beginPath();p.arc(409,145,41,0,Math.PI*2);p.clip();
        fill(p,gradient(p,104,187,[[0,'#f78854'],[.67,'#f89d59'],[1,'#ffd98b']]));
        for(let i=0;i<560;i++)fill(p,'rgba(248,226,155,.20)',367+rnd()*86,103+rnd()*85,1+rnd()*9,.4);
        p.restore();
        for(let i=0;i<36;i++){
          const x=rnd()*720-40,y=45+rnd()*150,s=26+rnd()*100;
          p.fillStyle=i%3===1?'rgba(247,235,200,.23)':'rgba(221,233,199,.18)';
          p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x+s*.34,y-4-rnd()*5,x+s,y-1.5);p.quadraticCurveTo(x+s*.34,y-.5,x,y+1);p.fill();
        }
      });
      function mountain(sil,base,body,face,line,shadow,count){
        return layer(p=>{
          // Sample an asymmetrically eroded ridge with progressively finer paper-cut edges.
          const ridge=[];
          for(let i=0;i<sil.length-1;i++) {
            const [x,y]=sil[i],[nx,ny]=sil[i+1],dx=nx-x;
            const segments=Math.max(2,Math.floor(dx/3));
            for(let j=0;j<segments;j++){
              const u=j/segments;
              ridge.push([x+u*dx,y+(ny-y)*u+Math.sin(u*16+i*7)*1.7+rnd()*2.4]);
            }
          }
          ridge.push(sil[sil.length-1]);
          p.beginPath();p.moveTo(-4,550);for(const [x,y] of ridge)p.lineTo(x,y);p.lineTo(646,550);p.closePath();
          p.fillStyle=gradient(p,base-140,base+110,[[0,body],[.57,body],[1,face]]);p.fill();p.save();p.clip();
          for(let i=0;i<ridge.length-2;i++){
            const [x,y]=ridge[i], [xx,yy]=ridge[i+2],depth=15+rnd()*83;
            if (rnd()>.26){
              p.beginPath();p.moveTo(x,y);p.lineTo(xx,yy);
              p.lineTo(xx-depth*.16,yy+depth*.44);p.lineTo(x-depth*.48,yy+depth);
              p.lineTo(x-depth*.21,y+depth*.47);p.closePath();
              p.globalAlpha=.12+rnd()*.48;p.fillStyle=yy>=y?face:shadow;p.fill();
            }
          }
          p.globalAlpha=1;
          for(let i=0;i<count;i++){
            const a=ridge[Math.floor(rnd()*ridge.length)], y=a[1]+rnd()*110, x=a[0]-(y-a[1])*.25, len=2+rnd()*16;
            p.globalAlpha=.11+rnd()*.34;
            p.strokeStyle=rnd()>.39?line:shadow;p.lineWidth=.35+rnd()*.55;
            p.beginPath();p.moveTo(x,y);p.quadraticCurveTo(x-len*.22,y+len*.52,x-len*(rnd()*.75+.15),y+len);p.stroke();
          }
          p.restore();p.strokeStyle=line;p.lineWidth=.7;p.globalAlpha=.46;
          p.beginPath();for(let i=0;i<ridge.length;i++){const [x,y]=ridge[i];if(i===0)p.moveTo(x,y);else p.lineTo(x,y);}p.stroke();p.globalAlpha=1;
          // Wind-shaped pines grouped in clusters on ledges at selected summits.
          for(let k=1;k<sil.length-1;k++) {
            const [x,y]=sil[k];
            if(y>sil[k-1][1]||y>sil[k+1][1]||rnd()>.77)continue;
            for(let j=0;j<3;j++) {
              const px=x+j*2.6, py=y+1+j, h=2.2+rnd()*4;
              p.fillStyle=shadow;p.fillRect(px,py-h,.55,h);
              p.beginPath();p.moveTo(px+1,py-h-1);p.lineTo(px-h*.65,py-h*.36);p.lineTo(px+h*.46,py-h*.42);p.closePath();p.fill();
            }
          }
        });
      }
      function clouds(top,primary,under,rim,n){
        return layer(p=>{
          // Multiple overlapping cloud banks. The lit upper lip and shaded underside
          // follow the same contour so the varying brushwork always reads as volume.
          for(let k=0;k<n;k++) {
            const cx=rnd()*770-65, cy=top+(k/n)*77+rnd()*12, radius=13+rnd()*32, len=radius*(2.9+rnd()*3.4);
            const body=p.createLinearGradient(0,cy-radius*.66,0,cy+radius*.96);
            body.addColorStop(0,primary);body.addColorStop(.31,primary);body.addColorStop(1,under);
            const lobes=[];
            let x=cx-len;
            while(x<cx+len) {
              const w=13+rnd()*43;
              const envelope=Math.max(0,1-Math.pow((x-cx)/len,2));
              const y=cy-radius*(.25+rnd()*.35)*envelope;
              lobes.push([x, y, w, radius*(.10+rnd()*.37)*envelope]);
              x+=w;
            }
            function trace(){
              p.moveTo(cx-len,cy);
              for(const [x,y,w,h] of lobes){
                p.bezierCurveTo(x+w*.12,y-h,x+w*.75,y-h,x+w,y);
              }
            }
            p.beginPath();trace();p.quadraticCurveTo(cx+len*1.08,cy+radius*.21,cx+len*.63,cy+radius*.4);
            p.bezierCurveTo(cx+len*.3,cy+radius*1.02,cx-len*.56,cy+radius*.82,cx-len,cy);p.fillStyle=body;p.fill();
            p.beginPath();trace();p.strokeStyle=rim;p.lineWidth=.72;p.stroke();
            p.beginPath();p.moveTo(cx-len*.77,cy+radius*.21);p.bezierCurveTo(cx-len*.12,cy+radius*.45,cx+len*.07,cy+radius*.06,cx+len*.7,cy+radius*.13);
            p.strokeStyle=rim;p.globalAlpha=.23;p.lineWidth=.8;p.stroke();p.globalAlpha=1;
          }
        });
      }
      const far=mountain([[-5,215],[19,207],[38,216],[68,189],[86,199],[111,169],[124,175],[153,208],[165,203],[193,223],[214,207],[244,223],[265,215],[291,228],[328,211],[348,218],[368,202],[393,215],[410,208],[431,205],[454,184],[465,190],[489,169],[510,194],[527,177],[560,192],[577,179],[611,202],[627,185],[647,191]],250,'#8cb0a3','#a6c2af','#d2d7b7','#729d95',620);
      const middle=mountain([[-5,273],[16,247],[35,240],[51,212],[59,221],[71,213],[80,227],[95,228],[105,255],[126,263],[138,251],[157,253],[169,237],[183,248],[195,245],[212,269],[227,276],[253,261],[271,267],[291,295],[318,294],[335,279],[351,282],[363,258],[377,246],[392,267],[416,252],[428,259],[443,236],[454,238],[475,200],[483,211],[499,192],[507,196],[522,158],[527,163],[540,193],[548,175],[555,179],[569,216],[581,209],[596,231],[620,214],[645,190]],285,'#67958c','#96b4a0','#c4c9a7','#4f7d79',1350);
      const sea=clouds(282,'#dbd7b4','#88afa0','#f4dfb0',50);
      const near=mountain([[-5,196],[12,181],[23,186],[37,160],[46,170],[55,148],[61,150],[70,181],[79,190],[84,205],[92,202],[101,236],[113,243],[124,232],[132,238],[141,228],[148,237],[155,270],[163,275],[174,270],[190,298],[205,302],[222,333],[241,345],[266,365],[301,377],[331,368],[350,355],[377,368],[393,345],[412,333],[428,336],[450,320],[466,324],[483,310],[496,282],[505,277],[521,287],[539,258],[545,257],[555,228],[565,243],[572,234],[588,254],[604,220],[611,216],[619,181],[630,168],[639,154],[646,157]],307,'#366d69','#6c9480','#c3c29a','#285d5d',2400);
      const bank=clouds(351,'#b6c8ad','#73a094','#e9dbad',57);
      const front=clouds(411,'#cad1b2','#82a696','#f7e3b7',38);
      paintSky.layers={sky,far,middle,sea,near,bank,front};
    }
    const d=Math.min(1,Math.max(0,discovery)), a=paintSky.layers;
    function place(plate,x,y) {ctx.drawImage(plate,x,y,640,550);}
    ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
    place(a.sky,0,0);place(a.far,0,2+7*d);place(a.middle,0,1+12*d);
    function drift(plate,x,y){ctx.drawImage(plate,x-6,y,652,550);}
    drift(a.sea,Math.sin(t*.22)*3,10*d);place(a.near,0,22*d);
    drift(a.bank,Math.sin(t*.27+.9)*4,13*d);drift(a.front,Math.cos(t*.24)*5,18*d);
    function crane(x,y,size,phase) {
      ctx.save();ctx.translate(x,y);ctx.scale(size,size);
      const flap=Math.sin(t*2.2+phase);
      ctx.fillStyle='#3c6260';ctx.beginPath();ctx.moveTo(-.4,0);
      ctx.bezierCurveTo(-4,-3-flap*2,-7,-4.6-flap*3,-12,-4.8-flap*4);
      ctx.quadraticCurveTo(-7,-1.8-flap*2,-4,.4);
      ctx.lineTo(-.6,1.1);ctx.quadraticCurveTo(2,1.1,4.6,-.5);
      ctx.lineTo(9,-1.3);ctx.lineTo(5,-1.6);ctx.quadraticCurveTo(3.5,-1.7,1.8,-.9);
      ctx.quadraticCurveTo(3,-3.1-flap*1.5,6,-7.4-flap*3.8);
      ctx.quadraticCurveTo(1,-5.2-flap*2,-.4,0);ctx.fill();
      ctx.strokeStyle='#3c6260';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(-2,.4);ctx.lineTo(-8,.8);ctx.stroke();ctx.restore();
    }
    crane(359+Math.sin(t*.27)*14,141+d*6+Math.cos(t*.27)*2,.73,.2);
    crane(344+Math.sin(t*.27)*14,147+d*6+Math.cos(t*.27)*2,.56,1.7);
    crane(329+Math.sin(t*.27)*14,144+d*6+Math.cos(t*.27)*2,.4,2.8);
    ctx.restore();
  }
  function paintShaft(ctx, travel, exit) {
    // Tile the rear machinery and both near guide rails independently. The roofline
    // clips all three layers so the sky beyond it is uncovered by actual motion.
    if (!paintShaft.tiles) {
      const make = (width, height) => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        return c;
      };
      const wall = make(640, 276);
      const rail = make(118, 217);
      const lip = make(640, 50);
      const render = (image, draw) => {
        const p = image.getContext('2d');
        const gradient = (x, y, x1, y1, stops) => {
          const g = p.createLinearGradient(x, y, x1, y1);
          for (const [k, color] of stops) g.addColorStop(k, color);
          return g;
        };
        const rect = (x, y, w, h, fill) => {
          p.fillStyle = fill;
          p.fillRect(x, y, w, h);
        };
        const slab = (points, fill, edge, width = 1) => {
          p.beginPath();
          points.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
          p.closePath();
          p.fillStyle = fill;
          p.fill();
          if (edge) {
            p.strokeStyle = edge;
            p.lineWidth = width;
            p.stroke();
          }
        };
        const rod = (x, y, x1, y1, edge, width = 1) => {
          p.beginPath();
          p.moveTo(x, y);
          p.lineTo(x1, y1);
          p.strokeStyle = edge;
          p.lineWidth = width;
          p.stroke();
        };
        const bolt = (x, y, r = 2.6) => {
          p.beginPath();
          p.arc(x, y + 1, r + 1, 0, Math.PI * 2);
          p.fillStyle = '#0b1b20';
          p.fill();
          p.beginPath();
          p.arc(x, y, r, Math.PI, Math.PI * 2);
          p.strokeStyle = '#859288';
          p.lineWidth = 1;
          p.stroke();
          rod(x - r / 2, y + 1, x + r / 2, y - 1, '#536568');
        };
        draw({ p, gradient, rect, slab, rod, bolt });
      };
      render(wall, ({ p, gradient, rect, slab, rod, bolt }) => {
        rect(0, 0, 640, 276, gradient(0, 0, 640, 0, [
          [0, '#182b31'], [.23, '#39565b'], [.54, '#698585'], [.8, '#405b60'], [1, '#1d3035']
        ]));
        // A raised steel shutter with a bevel, press lines and a worn painted marker.
        const door = [[165, 27], [475, 27], [497, 50], [497, 225],
          [479, 246], [157, 246], [143, 231], [143, 52]];
        slab(door, '#344e54', '#91a39a', 1.4);
        const panel = [[168, 32], [472, 32], [489, 51], [489, 222],
          [472, 238], [163, 238], [152, 226], [152, 55]];
        slab(panel, gradient(150, 30, 485, 238, [
          [0, '#304a51'], [.35, '#637d7e'], [.66, '#6d8887'], [1, '#405b60']
        ]), '#213b42', 3);
        for (const x of [197, 205, 426, 434]) {
          rod(x, 40, x, 232, '#93a79b62');
          rod(x + 1.4, 40, x + 1.4, 232, '#233f474b', 2);
        }
        for (let i = 0; i < 6; i++) {
          const y = 64 + i * 7;
          slab([[224, y], [276, y], [271, y + 3], [220, y + 3]], '#2d484fa6');
          rod(222, y + 3, 271, y + 3, '#a2b09e66');
        }
        for (const x of [164, 477])
          for (const y of [56, 221]) bolt(x,y,1.6);
        // Dry-brush wear follows gravity and the horizontal grain of the steel.
        let seed = 8131;
        const noise = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        for (let i = 0; i < 1150; i++) {
          const x = 55 + noise() * 530, y = noise() * 276;
          rect(x, y, .5 + noise() * 10, .4 + noise(), i % 3 ? '#c9caba13' : '#152e3425');
        }
        for (const sx of [0, 1]) {
          p.save();
          if (sx) { p.translate(640, 0); p.scale(-1, 1); }
          for (const x of [95, 102, 115, 126]) {
            rect(x, 0, 4, 276, '#213a42');
            rect(x, 0, 1, 276, '#688186');
          }
          slab([[44, 20], [70, 8], [135, 74], [135, 94]], '#263c43', '#6e8180', 1);
          slab([[43, 222], [66, 231], [139, 181], [139, 166]], '#243b42', '#6e8180', 1);
          rect(67, 0, 19, 276, '#223a41');
          rect(69, 0, 3, 276, '#84938c');
          rect(77, 0, 3, 276, '#131f24');
          p.restore();
        }
        rect(0, 255, 640, 21, '#233b43');
        rect(0, 255, 640, 3, '#899c96');
        rect(0, 261, 640, 3, '#162c34');
        for (let x = 105; x < 576; x += 63) bolt(x, 269, 1.6);
      });
      render(rail, ({ p, gradient, rect, slab, rod, bolt }) => {
        slab([[0, 0], [74, 0], [74, 217], [0, 217]], gradient(0, 0, 74, 0, [
          [0, '#0c191f'], [.55, '#223d44'], [.85, '#40585c'], [1, '#10242c']
        ]));
        slab([[0, 59], [8, 49], [84, 9], [90, 21], [12, 71], [0, 77]],
          '#193139', '#52676a', 1.2);
        slab([[1, 155], [10, 151], [86, 201], [89, 212], [79, 213], [0, 169]],
          '#172d33', '#455b5f');
        rect(23, 0, 4, 217, '#83918a');
        rect(28, 0, 7, 217, '#0b1c23');
        rect(74, 0, 7, 217, '#13262d');
        rect(81, 0, 8, 217, gradient(81, 0, 89, 0, [
          [0, '#657f7d'], [.45, '#9fa894'], [.66, '#425b5d'], [1, '#2b434a']
        ]));
        rect(89, 0, 4, 217, '#12282e');
        // Ceramic sconces cast a warm pool onto the darker guide rails.
        const light = p.createRadialGradient(56, 111, 3, 56, 111, 52);
        light.addColorStop(0, '#f7a95f86');
        light.addColorStop(.43, '#df955c32');
        light.addColorStop(1, '#ce9a5c00');
        rect(2, 56, 114, 112, light);
        slab([[36, 79], [44, 73], [68, 73], [74, 79], [74, 144], [68, 150],
          [44, 150], [36, 142]], '#17282d', '#8a8873', 1.2);
        rect(43, 82, 23, 58, '#574639');
        rect(46, 85, 17, 52, gradient(46, 0, 63, 0, [
          [0, '#b5744e'], [.29, '#ffdb9a'], [.61, '#fff1c3'], [1, '#c88959']
        ]));
        for (const y of [90, 105, 120, 134]) rect(44, y, 21, 2.6, '#695947');
        for (const y of [77, 146]) bolt(56, y, 1.25);
        for (const y of [30, 181]) bolt(14, y);
        for (const y of [9, 200]) {
          rod(77, y, 90, y, '#16343c', 2);
          rod(79, y + 2, 90, y + 2, '#a0aea0');
        }
      });
      render(lip, ({ rect, slab, rod, bolt }) => {
        const contour = [[0,3],[83,3],[109,18],[135,18],[149,24],[491,24],[505,18],
          [533,18],[557,3],[640,3],[640,50],[0,50]];
        slab(contour,'#25383d','#d5b58d',2);
        rod(148, 29, 491, 29, '#9c9a82', 2);
        for (let x = 154; x < 491; x += 18) {
          slab([[x,34],[x+8,34],[x+4,40],[x-4,40]], '#a89b72');
        }
        rect(0,44,640,6,'#0c1f27');
        for (const x of [32,79,128,512,561,608]) bolt(x,28,2.4);
      });
      paintShaft.tiles = {wall,rail,lip};
    }
    const rim = -55 + 615 * exit;
    if (rim > 520) return;
    const {wall,rail,lip} = paintShaft.tiles;
    const tile = (image, x, movement) => {
      const offset = movement % image.height;
      for (let y = offset - image.height; y < 520; y += image.height)
        ctx.drawImage(image, x, y);
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rim + 32, 640, 520 - rim);
    ctx.clip();
    tile(wall, 0, travel * .56);
    tile(rail, 0, travel * .95);
    ctx.translate(640,0);
    ctx.scale(-1,1);
    tile(rail, 0, travel * .95);
    ctx.restore();
    ctx.drawImage(lip, 0, rim);
  }
  function paintTraveler(ctx,t,wind,light,bladeAngle) {
    const c=ctx;
    c.save();
    c.lineCap='round';
    c.lineJoin='round';
    const p=(d,fill,edge,width=1)=>{
      const s=new Path2D(d);
      if(fill){c.fillStyle=fill;c.fill(s);}
      if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke(s);}
    };
    const pen=(d,cc,w=1)=>p(d,null,cc,w);
    const gradient=(x0,y0,x1,y1,...colors)=>{
      const g=c.createLinearGradient(x0,y0,x1,y1);
      colors.forEach(([a,b])=>g.addColorStop(a,b));
      return g;
    };
    const breeze=Math.min(2,Math.max(0,wind||0));
    const pulse=Math.min(1,Math.max(0,light||0));
    const z=Math.sin(t*2.4)*(2+breeze*2), u=Math.sin(t*3.3+1.4)*(2+breeze*1.5);
    const cloth=gradient(249,290,321,347,[0,'#536070'],[.22,'#293647'],[.51,'#192434'],[.78,'#364557'],[1,'#718089']);
    const silk=gradient(249,365,310,397,[0,'#586574'],[.21,'#293545'],[.6,'#182334'],[.9,'#394857'],[1,'#73818b']);
    const brass='#bd9565', gold='#e5c89a', ink='#15202d', jade='#68aaa5';
    const rim='rgba(220,245,248,'+(.59+pulse*.41)+')';
    // The front foot carries the weight, while the back leg turns outward.
    p('M263 377Q269 374 283 382L278 412L278 423L278 433Q272 439 255 437Q254 434 263 430L265 424L263 418Z',ink,'#303c45',.7);
    p('M287 375L303 372L312 399L316 418L322 424L330 429Q333 434 317 434L308 432L307 424L303 417L294 409Z','#162432','#37444a',.8);
    p('M265 410L277 407L278 412L266 416ZM265 418L277 414L277 418L265 423ZM305 410L313 405L315 410L307 416ZM307 418L315 413L316 418L310 422Z','#5c676d');
    pen('M256 436Q269 438 277 432M311 431Q321 435 330 430',brass,1.3);
    // Back folds of the skirt and long, lacquered scabbard.
    p('M270 334L300 335Q307 357 315 376L323 397L310 401L306 399L295 406L285 388L273 409L260 406L253 409L246 400Q261 362 260 350Z',silk);
    p('M275 343L268 382L259 401L268 404L277 380L283 349ZM291 355L297 365L311 396L304 398Z','#60707b');
    pen('M272 397Q282 371 284 360M311 396L306 377','#a4a8a2',.8);
    p('M286 335L290 339L231 411Q225 417 221 417Q225 406 232 399Z','#142a32','#a58a65',1.1);
    p('M226 407L232 409L230 412L223 416Z',brass);
    // The overskirt parts into broad, wind-wrapped panels.
    p('M263 328L296 329Q300 355 310 366L312 373L321 385Q306 387 299 383L304 394Q292 393 282 377L284 386Q274 395 257 400Q247 402 234 398Q249 388 254 379L246 384Q251 369 254 350Z',silk);
    p('M266 341Q264 367 251 389L258 386L266 376Q262 386 251 395Q264 392 270 384Q281 366 283 340Z','#3c5060');
    p('M292 340Q292 364 307 383Q302 383 298 380L303 390Q288 383 282 365Z','#202d3c');
    pen('M235 398Q252 400 265 393Q279 385 282 380M287 379Q297 391 302 392M312 373L318 383L311 384',brass,1.4);
    pen('M245 395Q257 394 267 388M249 394L252 391L254 392L258 389','#ded0a6',.8);
    // Broad mantle, close-fitting right sleeve, and a folded rain cape.
    p('M270 265Q261 269 253 276Q250 280 248 291L240 313L235 330Q240 339 252 336L257 329L258 332L272 337L295 333L303 326L302 311Q306 326 312 337L319 348L328 342L322 325Q315 313 313 299Q310 276 297 271L288 265Z',cloth);
    p('M253 278Q250 300 241 322L236 329Q241 330 247 327L254 306L262 285Z','#485866');
    p('M257 293Q262 307 274 314L282 317L273 316L259 309Z', '#65737b');
    p('M287 290Q298 294 299 304L295 321L288 329L291 311ZM302 289L311 302L318 325L313 320Z','#233240');
    pen('M239 318L246 300M248 289L251 281M300 275Q308 280 311 293',rim,1.2);
    p('M267 268Q273 262 286 264L299 272L308 280L313 292Q298 286 288 292Q280 297 273 304L263 297L247 298L251 282Z',gradient(250,274,305,292,[0,'#7b8283'],[.26,'#354956'],[.61,'#213444'],[1,'#647781']));
    pen('M247 298Q258 294 266 299L273 303Q288 284 306 290L312 292',brass,1.4);
    pen('M251 294Q263 292 273 299Q284 285 297 286','#b9b6a2',.65);
    pen('M259 286L270 274M266 289L275 278M300 282L292 275','#9da4a0',.75);
    // A little paired cloud motif and knotted jade fastening.
    pen('M275 283Q272 279 275 278Q278 277 277 281Q284 279 283 276M275 285L280 282',gold,1.1);
    p('M258 326Q280 332 301 319L303 326Q284 339 260 334Z','#273f43','#907957',1);
    pen('M263 331Q280 336 298 325',gold,.8);
    p('M292 327L296 322L302 325L299 331L294 332Z',jade,gold,1);
    pen('M296 330Q296 341 302 348Q306 350 307 344M298 331L303 340','#91a69a',1);
    p('M300 346L304 345L306 354L303 352L302 357Z','#509f98');
    // Silk cuffs and fingers ahead of the blade grip.
    p('M237 329L252 332L249 340L242 344L237 341Z','#293c47',brass,1);
    p('M238 342L246 343L245 350L241 354L238 351L236 347Z','#806d64');
    p('M312 335L323 329L329 341L332 347L324 353L318 347Z','#354c57',brass,1);
    pen('M316 338L324 334M319 342L326 338','#d0c2a3',1.1);
    c.save();c.translate(325,351);c.rotate(bladeAngle);c.translate(-325,-351);
    // Jian blade. Two differently lit triangular planes meet at the ridge.
    p('M333 346L446 261L464 249L456 261L337 352Z','#d2e2dc','#e9f6f4',.7);
    p('M335 349L464 249L456 261L337 352Z',gradient(376,307,386,318,[0,'#54757a'],[.41,'#a8c7c7'],[.66,'#647e82'],[1,'#deeddf']));
    pen('M338 348L459 254',rim,1);
    pen('M343 344L351 336L351 339L359 330L359 333L365 327','#718e91',.7);
    p('M314 359L334 344L338 350L318 365Z','#313e40',brass,.9);
    for(let k=0;k<4;k++)pen('M'+(318+k*3.8)+' '+(358-k*2.8)+'l3 1l0 -3',gold,.9);
    p('M329 343Q329 338 333 340L338 346L345 349Q346 353 342 353L336 351L331 347Z',brass,gold,.85);
    p('M321 349Q323 344 326 345L330 347L331 351L326 357L321 357L318 354Z','#988477','#493e3e',.7);
    pen('M324 348L328 351M322 351L326 354','#dcc2a6',.75);
    pen('M316 363Q313 376 305 380Q300 384 300 388','#9f4942',1.2);
    c.restore();
    // Long hair blows out from beneath the brim and splits into a weighted braid.
    p('M266 237Q277 229 288 238Q298 247 290 260L294 271Q290 275 284 269Q281 277 274 278L278 269L265 275Q271 267 264 263Q260 255 266 237Z','#152028');
    p('M272 249Q271 262 260 267Q252 273 247 '+(280+u)+'Q258 271 264 272Q276 269 280 257Z','#1a2730');
    pen('M276 252Q271 263 263 268M254 275Q248 '+(279+u)+' 244 '+(283+u), '#627178',.85);
    // Crimson scarf with a lagging, notched tail and a second narrow ribbon.
    p('M269 261Q279 266 291 258L296 265L289 272L276 274L265 268Z','#91443d','#c36a55',.7);
    p('M268 265Q250 '+(276+z)+' 238 '+(264+u)+'Q222 '+(249+z)+' 208 '+(256+u)+'Q195 '+(262+u)+' 184 '+(254+z)+'Q193 '+(265+z)+' 205 '+(264+u)+'L201 '+(269+u)+'Q220 '+(254+z)+' 236 '+(273+u)+'Q248 '+(285+z)+' 271 270Z',gradient(196,252,266,278,[0,'#aa453c'],[.33,'#d96950'],[.61,'#974137'],[1,'#c15b47']));
    pen('M268 265Q250 '+(276+z)+' 238 '+(264+u)+'Q222 '+(249+z)+' 208 '+(256+u)+'Q194 '+(263+u)+' 184 '+(254+z),'#f4a47c',.85);
    p('M267 268Q250 '+(279-u)+' 239 '+(277-z)+'Q226 '+(273-u)+' 219 '+(283-z)+'Q228 '+(277-u)+' 239 '+(282-z)+'Q251 '+(286-u)+' 269 271Z','#893a3c');
    // The asymmetric woven hat is silhouetted against the lift's light.
    p('M239 249Q254 237 265 228Q272 223 279 218Q284 219 289 225Q303 235 315 244Q310 248 299 249Q270 256 247 253Z',gradient(257,218,277,254,[0,'#d4b786'],[.24,'#b39b72'],[.63,'#8e795b'],[1,'#615644']),'#3b3931',1.1);
    p('M239 249Q260 249 286 247Q304 245 315 244Q306 252 290 254Q258 258 239 251Z','#443f37');
    pen('M240 249Q267 251 296 246L314 244','#e4c896',1.7);
    pen('M246 252Q263 255 280 253M286 252L302 249','#96876b',.9);
    // Uneven weave follows the curved, tilted crown.
    for(let i=0;i<15;i++){
      const f=i/14,x=243+68*f,y=249-4*f;
      const bx=279+(f-.5)*5,by=222+Math.abs(f-.5)*3;
      pen('M'+bx+' '+by+'Q'+((bx+x)/2-2)+' '+((by+y)/2+1)+' '+x+' '+y, i%3===0?'#615945':'#c4ae82',i%3===0?.8:.65);
    }
    pen('M261 234Q277 235 298 233M253 241Q279 242 305 237','#7c6c50',.9);
    pen('M250 245L258 239M263 244L265 241M293 243L298 242M302 245L306 244','#ead0a0',.9);
    pen('M276 220L279 218Q284 219 287 223',gold,1.2);
    c.restore();
  }
  const cycle = 9.6;
  const scene = new window.LW5DepthScene(8);
  const clamp = x => Math.min(1, Math.max(0,x));
  function ease(a,b,t) {
    const p = clamp((t-a)/(b-a));
    return p*p*(3-2*p);
  }

  function polygon(points, fill, edge, width=1) {
    ctx.beginPath();
    points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
    if (edge) { ctx.strokeStyle=edge; ctx.lineWidth=width; ctx.stroke(); }
  }

  function stroke(points, color, width=1) {
    ctx.beginPath();
    points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
  }

  function wash(x,y,r,inside,outside) {
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,inside);g.addColorStop(1,outside);
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);
  }

  function paintDeck(day,charge) {
    // The traveller and the carriage share this plane throughout the ascent.
    const face=ctx.createLinearGradient(0,415,0,520);
    face.addColorStop(0,`rgb(${89+31*day},${115+31*day},${113+25*day})`);
    face.addColorStop(.48,'#415b59');face.addColorStop(1,'#162c32');
    polygon([[-40,520],[91,424],[548,424],[680,520]],face);
    ctx.save();ctx.clip();
    for(let i=-4;i<=4;i++){
      stroke([[319+i*57,423],[319+i*148,520]],'#263e42',2);
      stroke([[321+i*57,423],[321+i*148,520]],'#a6b1a34d');
    }
    for(const y of [430,445,471,507]) stroke([[-5,y],[650,y]],'#a0a18b60');
    for(let i=0;i<17;i++) {
      const x=78+i*31;
      polygon([[x,435],[x+12,435],[x+6,438],[x-6,438]],'#233d42');
    }
    ctx.restore();
    const shadow=ctx.createRadialGradient(290,445,2,290,445,52);
    shadow.addColorStop(0,'#142a2bd9');shadow.addColorStop(1,'#142a2b00');
    ctx.save();ctx.translate(290,444);ctx.scale(1.38,.21);ctx.translate(-290,-445);
    ctx.fillStyle=shadow;ctx.fillRect(235,390,110,110);ctx.restore();
    for(const side of [0,1]) {
      ctx.save();if(side){ctx.translate(640,0);ctx.scale(-1,1);}
      polygon([[-10,395],[92,370],[94,424],[-10,495]],'#183038','#929077',2);
      polygon([[-10,394],[91,369],[99,373],[-10,406]],'#aa9b70');
      stroke([[1,414],[80,387],[80,420],[1,471]],'#637573',2);
      for(let i=0;i<5;i++) {
        const x=4+i*15;
        stroke([[x,409-i*4],[x,467-i*9]],'#425650',3);
      }
      polygon([[86,368],[97,365],[101,370],[100,425],[88,431]],'#32494a','#aa9974');
      polygon([[89,372],[95,370],[95,384],[89,386]],charge>.12?'#dfefdc':'#f2bf72');
      ctx.restore();
    }
    const backdrop=ctx.createLinearGradient(0,468,0,520);
    backdrop.addColorStop(0,'#0f252700');backdrop.addColorStop(1,'#0f2527b3');
    ctx.fillStyle=backdrop;ctx.fillRect(0,468,640,52);
  }

  // Subdivide each branch once. A travelling front reveals the same path over time.
  let seed=9701;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function jagged(a,b,steps) {
    let points=[a,b];
    for(let i=0;i<steps;i++) {
      const next=[points[0]];
      for(let j=1;j<points.length;j++) {
        const [x,y]=points[j-1],[u,v]=points[j],k=(random()-.5)*.47;
        next.push([(x+u)/2+(v-y)*k,(y+v)/2-(u-x)*k],points[j]);
      }
      points=next;
    }
    return points;
  }
  const bolt=jagged([464,249],[566,-12],6);
  const forks=[bolt,jagged(bolt[18],[575,180],4),jagged(bolt[32],[403,71],4),
    jagged(bolt[45],[614,42],4),jagged(bolt[12],[492,151],3)];
  const petals=Array.from({length:30},()=>({x:random()*720,y:random()*570,k:.55+random(),p:random()*6.28}));
  function paintLightning(t,charge) {
    if(charge<.006) return;
    const extent=ease(5.28,5.60,t);
    ctx.lineJoin='round';ctx.lineCap='round';
    forks.forEach((branch,i)=>{
      const portion=branch.slice(0,Math.max(2,Math.ceil(extent*branch.length)));
      for(const [width,color,alpha] of [[12,'#86f5dd',.15],[4,'#96fff2',.65],[1.7,'#faffed',1]]) {
        ctx.globalAlpha=charge*alpha;
        stroke(portion,color,width*(i?.48:1));
      }
    });
    ctx.globalAlpha=charge*.62;wash(464,249,45,'#dcfff6','#bbfff200');
    ctx.globalAlpha=1;
  }

  function paintWind(t,travel,wind,discovery) {
    for(const [i,p] of petals.entries()){
      const x=((p.x-t*38*p.k+12*Math.sin(t*1.3+p.p))%720+720)%720-35;
      const y=(p.y+travel*(.14+.22*p.k)+10*Math.sin(t+p.p))%570-24;
      ctx.save();ctx.translate(x,y);ctx.rotate(p.p+t*p.k);
      ctx.globalAlpha=(.12+.62*discovery)*wind;
      polygon([[-5*p.k,0],[0,-1.8*p.k],[4*p.k,0],[0,1.2*p.k]],i%4?'#e8bc7b':'#ed7350');
      ctx.restore();
    }
  }

  function paintBladeTrail(t,angle) {
    const strength=ease(4.77,5.06,t)*(1-ease(5.16,5.45,t));
    if(strength<=0)return;
    const handX=325,handY=351,length=172,axis=Math.atan2(-102,139)+angle;
    ctx.save();ctx.translate(handX,handY);ctx.rotate(axis);
    for(let i=0;i<7;i++) {
      const arc=(i+1)*.044*strength;
      ctx.beginPath();ctx.arc(0,0,length-i*3,0,arc);
      ctx.strokeStyle=`rgba(231,247,214,${strength*(7-i)*.027})`;
      ctx.lineWidth=i===0?2:3;ctx.stroke();
    }
    ctx.restore();
  }

  const grain=document.createElement('canvas');grain.width=grain.height=96;
  const grainCtx=grain.getContext('2d'),noise=grainCtx.createImageData(96,96);
  for(let i=0;i<noise.data.length;i+=4){
    const gray=random()<.5?0:255;
    noise.data.set([gray,gray,gray,Math.floor(random()*15)],i);
  }
  grainCtx.putImageData(noise,0,0);
  const paper=ctx.createPattern(grain,'repeat');
  let mode='hidden',frame=0,previous=null,time=0,wasOpen=false;
  function draw(t,quiet=false) {
    if (!canvas.width || !canvas.height) return;
    const scale=Math.max(canvas.width/640,canvas.height/520);
    ctx.setTransform(scale,0,0,scale,(canvas.width-640*scale)/2,(canvas.height-520*scale)/2);
    const discovery=ease(3.35,5.36,t);
    // Accelerate before breaking through, then coast as the horizon settles.
    const travel=1800*ease(.18,6.2,t)+285*ease(2.5,7.8,t);
    const wind=.23+.77*ease(.3,3.4,t)-.56*ease(6.4,8.5,t);
    const charge=ease(5.28,5.45,t)*Math.exp(-Math.max(0,t-5.52)*3.45);
    const bladeAngle=.96*(1-ease(4.59,5.3,t))+.10*ease(3.8,4.55,t)*(1-ease(4.59,4.83,t));
    const zoom=1+.16*(1-ease(.2,4.8,t))+.055*ease(5.28,5.59,t)*(1-ease(5.59,6.8,t));
    ctx.save();ctx.translate(305,350);ctx.scale(zoom,zoom);ctx.translate(-305,-350);
    const bob=Math.sin(t*8)*Math.sin(Math.PI*ease(.3,5,t))*1.3;
    const carriage=13*(1-ease(.2,2.4,t))+bob;
    scene.reset();
    const layers=[
      ()=>{if(discovery>0)paintSky(ctx,t,discovery);},
      ()=>{if(discovery<1)paintShaft(ctx,travel,discovery);},
      ()=>{ctx.translate(0,carriage);paintLightning(t,charge);},
      ()=>{ctx.translate(0,carriage);paintDeck(discovery,charge);},
      ()=>{ctx.translate(0,carriage);paintBladeTrail(t,bladeAngle);paintTraveler(ctx,t,wind,charge,bladeAngle);},
      ()=>paintWind(t,travel,wind,discovery)
    ];
    layers.forEach((paint,z)=>{scene.add('layer',z).paint=paint;});
    scene.render(ctx,item=>item.paint());ctx.restore();
    ctx.fillStyle=paper;ctx.fillRect(-200,-100,1040,720);
    // Foreground crossbeam occludes the lens at the loop boundary like a cut.
    const wipe=Math.max(1-ease(0,.45,t),ease(9.03,cycle,t));
    if(wipe>0) {
      const edge=wipe*875-90;
      polygon([[-90,-80],[edge+45,-80],[edge-55,600],[-90,600]],'#172a32');
      stroke([[edge+45,-80],[edge-55,600]],'#899487',4);
    }
    const phase=quiet?'静谧云海':t<1.4?'启轿':t<3.75?'穿井':t<5.3?'破云':t<6.9?'引雷':'云上';
    if(label.textContent!==phase)label.textContent=phase;
  }
  function tick(now) {
    frame=0;
    if(mode!=='running') return;
    if(previous!==null)time=(time+Math.min(now-previous,100)/1000)%cycle;
    previous=now;draw(time);frame=requestAnimationFrame(tick);
  }
  function sync() {
    if(dialog.open&&!wasOpen)time=0;
    wasOpen=dialog.open;
    const state=sheet.dataset.state;
    const next=!dialog.open||document.hidden?'hidden':sheet.dataset.reducedMotion==='true'?'reduced':
      state==='preview_paused'?'paused':['preview','calling'].includes(state)?'running':'still';
    if(mode===next&&canvas.dataset.renderMode) return;
    mode=next;canvas.dataset.renderMode=mode;cancelAnimationFrame(frame);previous=null;
    if(mode==='running')frame=requestAnimationFrame(tick);
    else if(mode==='reduced'||mode==='still')draw(7.45,true);
    else if(mode==='paused')label.textContent='已暂停';
  }
  function resize() {
    if(!canvas.clientWidth||!canvas.clientHeight)return;
    const ratio=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(canvas.clientWidth*ratio);canvas.height=Math.round(canvas.clientHeight*ratio);
    const quiet=mode==='reduced'||mode==='still';
    draw(quiet?7.45:time,quiet);
    if(mode==='paused')label.textContent='已暂停';
  }
  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(sync).observe(sheet,{attributes:true,attributeFilter:['data-state','data-reduced-motion']});
  new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});
  document.addEventListener('visibilitychange',sync);sync();
})();
