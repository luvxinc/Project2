'use client';
import { useRef, useEffect, useCallback } from 'react';

interface Props {
  diameterA: number; diameterB: number; diameterC: number;
  expandedLengthD: number; expandedLengthE: number; crimpedTotalLength: number;
  width?: number; height?: number; theme: string;
}

interface P3D { x: number; y: number; z: number }

const rotY = (x: number, y: number, z: number, a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x*c+z*s, y, z: -x*s+z*c };
};
const rotX = (x: number, y: number, z: number, a: number) => {
  const c = Math.cos(a), s = Math.sin(a);
  return { x, y: y*c-z*s, z: y*s+z*c };
};
const proj = (x: number, y: number, z: number, f: number, d: number) => {
  const s = f/(d+z); return { px: x*s, py: y*s, depth: z };
};
const ss = (t: number) => { const c = Math.max(0,Math.min(1,t)); return c*c*(3-2*c); };
const lerp = (a: number, b: number, t: number) => a+(b-a)*t;

function getR(zN: number, dA: number, dB: number, dC: number, lD: number, lE: number) {
  const rA=dA/2, rB=dB/2, rC=dC/2, fl=(lE-lD)/2, ff=fl/lE;
  const bE=-1+2*ff, tS=1-2*ff;
  if (zN<=bE) return lerp(rC, rB, ss((zN+1)/(bE+1)));
  if (zN>=tS) return lerp(rB, rA, ss((zN-tS)/(1-tS)));
  return rB;
}

function genStent(dA: number, dB: number, dC: number, lD: number, lE: number, cp: number, cL: number): [P3D,P3D][] {
  const CD=8, tS=ss(cp), curL=lerp(lE,cL,tS);
  const gR = (zN: number) => lerp(getR(zN,dA,dB,dC,lD,lE), CD/2, tS);

  // Arc-length sampling
  const NS=400;
  const sa: {z:number;r:number}[] = [], al: number[] = [0];
  for (let i=0;i<=NS;i++) {
    const zn=(i/NS)*2-1, z=zn*curL/2, r=gR(zn);
    sa.push({z,r});
    if (i>0) { const dz=z-sa[i-1].z, dr=r-sa[i-1].r; al.push(al[i-1]+Math.sqrt(dz*dz+dr*dr)); }
  }
  const tot=al[al.length-1];
  const atA = (tgt: number) => {
    const t=Math.max(0,Math.min(tot,tgt));
    let lo=0,hi=al.length-1;
    while(lo<hi-1){const m=(lo+hi)>>1;if(al[m]<=t)lo=m;else hi=m;}
    const f=(t-al[lo])/Math.max(0.0001,al[hi]-al[lo]);
    return {z:lerp(sa[lo].z,sa[hi].z,f),r:lerp(sa[lo].r,sa[hi].r,f)};
  };

  // Grid params
  const NC=16, NH=8; // body=16, sparse=8 (2:1 ratio)
  const bFrac=0.65, bArc=tot*bFrac, sArc=tot-bArc;

  // Avg radii for diamond proportions
  let bRS=0,bRN=0,sRS=0,sRN=0;
  for(let i=0;i<=NS;i++){const ap=(i/NS)*tot;if(ap<=bArc){bRS+=sa[i].r;bRN++;}else{sRS+=sa[i].r;sRN++;}}
  const bAR=bRS/Math.max(1,bRN), sAR=sRN>0?sRS/sRN:bAR;

  const ASP=1.3;
  const bRH=ASP*Math.PI*bAR/NC, sRH=ASP*Math.PI*sAR/NH;
  let NB=Math.max(6,Math.round(bArc/bRH));
  if(NB%2!==0) NB+=1; // force even
  let NSR=Math.max(3,Math.round(sArc/sRH)+1);
  if(NSR<4) NSR=4;

  // Build body grid
  const bG: P3D[][] = [];
  for(let r=0;r<=NB;r++){
    const {z,r:rd}=atA((r/NB)*bArc);
    const off=(r%2)*(Math.PI/NC);
    const vs: P3D[]=[];
    for(let c=0;c<NC;c++){const th=off+c*2*Math.PI/NC;vs.push({x:rd*Math.cos(th),y:rd*Math.sin(th),z});}
    bG.push(vs);
  }

  // Body edges
  const edges: [P3D,P3D][] = [];
  for(let r=0;r<bG.length-1;r++){
    for(let c=0;c<NC;c++){
      const v=bG[r][c];
      if(r%2===0){edges.push([v,bG[r+1][c]]);edges.push([v,bG[r+1][(c-1+NC)%NC]]);}
      else{edges.push([v,bG[r+1][c]]);edges.push([v,bG[r+1][(c+1)%NC]]);}
    }
  }

  // Sparse grid — FIXED offset: π/NC + (sRow%2) * π/NH
  const sG: P3D[][] = [];
  for(let s=0;s<NSR;s++){
    const {z,r:rd}=atA(Math.min(bArc+(s+1)*sArc/(NSR+0.5),tot));
    const off=Math.PI/NC+(s%2)*Math.PI/NH;
    const vs: P3D[]=[];
    for(let c=0;c<NH;c++){const th=off+c*2*Math.PI/NH;vs.push({x:rd*Math.cos(th),y:rd*Math.sin(th),z});}
    sG.push(vs);
  }

  // Transition: body[2k]+body[2k+1] → sparse[k]
  if(sG.length>0){
    const lb=bG[bG.length-1],fs=sG[0];
    for(let k=0;k<NH;k++){edges.push([lb[2*k],fs[k]]);edges.push([lb[2*k+1],fs[k]]);}
  }

  // Sparse edges
  for(let r=0;r<sG.length-1;r++){
    for(let c=0;c<NH;c++){
      const v=sG[r][c];
      if(r%2===0){edges.push([v,sG[r+1][c]]);edges.push([v,sG[r+1][(c-1+NH)%NH]]);}
      else{edges.push([v,sG[r+1][c]]);edges.push([v,sG[r+1][(c+1)%NH]]);}
    }
  }

  // Crown tips (outflow) — free diamond edges from last sparse row
  const cf=1-tS;
  if(cf>0.05&&sG.length>0){
    const tr=sG[sG.length-1], lp=(sG.length-1)%2;
    const tZ=tr[0].z, tR=Math.sqrt(tr[0].x**2+tr[0].y**2);
    const tipL=curL*0.035*cf;
    const pZ=tZ+tipL, pR=tR*1.06*cf+tR*(1-cf);
    const pOff=Math.PI/NC+((lp+1)%2)*Math.PI/NH; // opposite parity offset

    for(let c=0;c<NH;c++){
      const v=tr[c];
      let c1:number,c2:number;
      if(lp%2===0){c1=c;c2=(c-1+NH)%NH;}else{c1=c;c2=(c+1)%NH;}
      const th1=pOff+c1*2*Math.PI/NH, th2=pOff+c2*2*Math.PI/NH;
      edges.push([v,{x:pR*Math.cos(th1),y:pR*Math.sin(th1),z:pZ}]);
      edges.push([v,{x:pR*Math.cos(th2),y:pR*Math.sin(th2),z:pZ}]);
    }
  }

  // Inflow tips (bottom) — free edges from first body row
  if(cf>0.05){
    const br=bG[0], tipL=curL*0.02*cf;
    const bZ=br[0].z, bR0=Math.sqrt(br[0].x**2+br[0].y**2);
    const pZ=bZ-tipL, pR=bR0*1.03*cf+bR0*(1-cf);
    const pOff=Math.PI/NC; // phantom odd row offset

    for(let c=0;c<NC;c++){
      const v=br[c];
      const th1=pOff+c*2*Math.PI/NC, th2=pOff+((c-1+NC)%NC)*2*Math.PI/NC;
      edges.push([v,{x:pR*Math.cos(th1),y:pR*Math.sin(th1),z:pZ}]);
      edges.push([v,{x:pR*Math.cos(th2),y:pR*Math.sin(th2),z:pZ}]);
    }
  }

  return edges;
}

export default function ValveWireframe({
  diameterA:dA, diameterB:dB, diameterC:dC,
  expandedLengthD:lD, expandedLengthE:lE, crimpedTotalLength:cL,
  width=360, height=400, theme,
}: Props) {
  const cvs=useRef<HTMLCanvasElement>(null), anim=useRef(0), fr=useRef(0);
  const FE=240,FC=160,FCR=240,FX=160,TOT=FE+FC+FCR+FX;

  const draw=useCallback(()=>{
    const c=cvs.current; if(!c)return;
    const ctx=c.getContext('2d'); if(!ctx)return;
    const dpr=window.devicePixelRatio||1;
    c.width=width*dpr; c.height=height*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const f=fr.current%TOT; fr.current++;
    let cp:number,rot:number,label:string,wc:string,hc:string;

    if(f<FE){cp=0;rot=(f/FE)*Math.PI*2;label='Expanded';wc=theme==='dark'?'#a8b4c4':'#5a6475';hc=theme==='dark'?'#dce3ed':'#c1cbda';}
    else if(f<FE+FC){const t=f-FE;cp=t/FC;rot=Math.PI*2+(t/FC)*Math.PI*1.2;label='Crimping...';wc=theme==='dark'?'#f0b429':'#b45309';hc=theme==='dark'?'#fde68a':'#fbbf24';}
    else if(f<FE+FC+FCR){cp=1;const t=f-FE-FC;rot=Math.PI*3.2+(t/FCR)*Math.PI*2;label='Crimped';wc=theme==='dark'?'#5ecea0':'#047857';hc=theme==='dark'?'#a7f3d0':'#6ee7b7';}
    else{const t=f-FE-FC-FCR;cp=1-t/FX;rot=Math.PI*5.2+(t/FX)*Math.PI*1.2;label='Expanding...';wc=theme==='dark'?'#b8a4f0':'#6d28d9';hc=theme==='dark'?'#ddd6fe':'#a78bfa';}

    const edges=genStent(dA,dB,dC,lD,lE,cp,cL);
    ctx.clearRect(0,0,width,height);
    const fov=1560,vd=220,elev=0.28;

    const xf=(v:P3D)=>{let r=rotY(v.x,-v.z,v.y,rot);r=rotX(r.x,r.y,r.z,elev);const p=proj(r.x,r.y,r.z,fov,vd);return{px:p.px+width/2,py:p.py+height/2,d:p.depth};};

    const pr=edges.map(([a,b])=>{const pa=xf(a),pb=xf(b);return{pa,pb,d:(pa.d+pb.d)/2};});
    pr.sort((a,b)=>a.d-b.d);

    for(const{pa,pb,d}of pr){
      const dn=Math.max(0,Math.min(1,(d+70)/140));
      ctx.beginPath();ctx.moveTo(pa.px,pa.py);ctx.lineTo(pb.px,pb.py);
      ctx.strokeStyle=wc;ctx.globalAlpha=0.06+dn*0.74;ctx.lineWidth=0.4+dn*1.3;ctx.lineCap='round';ctx.stroke();
      if(dn>0.6){ctx.beginPath();ctx.moveTo(pa.px,pa.py);ctx.lineTo(pb.px,pb.py);ctx.strokeStyle=hc;ctx.globalAlpha=(dn-0.6)*0.55;ctx.lineWidth=(0.4+dn*1.3)*0.3;ctx.stroke();}
    }

    // ===== DIMENSION MARKERS =====
    const tS=ss(cp), curL=lerp(lE,cL,tS);
    const dimA=cp<0.2?0.7:cp>0.8?0.15:lerp(0.7,0.15,(cp-0.2)/0.6); // fade during crimping
    const dc=theme==='dark'?'#6baaec':'#2a7ade';

    // Project center at model z to screen y, and compute silhouette half-width
    const sY=(mz:number)=>{let v=rotY(0,-mz,0,rot);v=rotX(v.x,v.y,v.z,elev);return proj(v.x,v.y,v.z,fov,vd).py+height/2;};
    const sHW=(mz:number,rad:number)=>{let v=rotY(0,-mz,0,rot);v=rotX(v.x,v.y,v.z,elev);return rad*fov/(vd+v.z);};

    const topZ=curL/2, botZ=-curL/2;
    const flare=(lE-lD)/2;
    const sTopZ=lerp(lD/2,curL/2,tS);  // straight section top z
    const sBotZ=lerp(-lD/2,-curL/2,tS); // straight section bottom z
    const ty=sY(topZ), by=sY(botZ), sty=sY(sTopZ), sby=sY(sBotZ), my=(sty+sby)/2;

    const rA=lerp(dA/2,4,tS), rB=lerp(dB/2,4,tS), rC=lerp(dC/2,4,tS);
    const hwA=sHW(topZ,rA), hwB=sHW(0,rB), hwC=sHW(botZ,rC);
    const cx=width/2;

    // Helper: draw arrow line with arrowheads
    const arrLine=(x1:number,y1:number,x2:number,y2:number)=>{
      const a=Math.atan2(y2-y1,x2-x1), sz=6;
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x1+sz*Math.cos(a+0.5),y1+sz*Math.sin(a+0.5));
      ctx.lineTo(x1+sz*Math.cos(a-0.5),y1+sz*Math.sin(a-0.5));ctx.closePath();ctx.fill();
      ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-sz*Math.cos(a+0.5),y2-sz*Math.sin(a+0.5));
      ctx.lineTo(x2-sz*Math.cos(a-0.5),y2-sz*Math.sin(a-0.5));ctx.closePath();ctx.fill();
    };

    ctx.strokeStyle=dc;ctx.fillStyle=dc;ctx.lineWidth=1;ctx.lineCap='butt';
    ctx.font='600 13px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif';
    ctx.globalAlpha=dimA;

    // -- A: Outflow OD (horizontal above top) --
    const aY=ty-20;
    ctx.beginPath();ctx.moveTo(cx-hwA,ty-3);ctx.lineTo(cx-hwA,aY);ctx.moveTo(cx+hwA,ty-3);ctx.lineTo(cx+hwA,aY);ctx.stroke();
    arrLine(cx-hwA,aY,cx+hwA,aY);
    ctx.textAlign='center';ctx.fillText(`A  ${dA}mm`,cx,aY-8);

    // -- C: Inflow OD (horizontal below bottom) --
    const cY=by+20;
    ctx.beginPath();ctx.moveTo(cx-hwC,by+3);ctx.lineTo(cx-hwC,cY);ctx.moveTo(cx+hwC,by+3);ctx.lineTo(cx+hwC,cY);ctx.stroke();
    arrLine(cx-hwC,cY,cx+hwC,cY);
    ctx.textAlign='center';ctx.fillText(`C  ${dC}mm`,cx,cY+16);

    // -- B: Straight Section OD (horizontal at middle, right side) --
    const bX=cx+hwB+10;
    ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.moveTo(cx+hwB,my);ctx.lineTo(bX+50,my);ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign='left';ctx.fillText(`B  ${dB}mm`,bX+6,my-6);

    // -- E: Total Length (vertical, far left) --
    const eX=cx-Math.max(hwA,hwB,hwC)-28;
    ctx.beginPath();ctx.moveTo(cx-hwA,ty);ctx.lineTo(eX-3,ty);ctx.moveTo(cx-hwC,by);ctx.lineTo(eX-3,by);ctx.stroke();
    arrLine(eX,ty,eX,by);
    ctx.save();ctx.translate(eX-14,(ty+by)/2);ctx.rotate(-Math.PI/2);
    ctx.textAlign='center';ctx.fillText(`E  ${lE}mm`,0,0);ctx.restore();

    // -- D: Straight Length (vertical, inside left) --
    if(cp<0.5){
      const dX=eX+14;
      ctx.globalAlpha=dimA*(1-cp*2);
      ctx.setLineDash([2,2]);
      ctx.beginPath();ctx.moveTo(cx-hwB,sty);ctx.lineTo(dX-3,sty);ctx.moveTo(cx-hwB,sby);ctx.lineTo(dX-3,sby);ctx.stroke();
      ctx.setLineDash([]);
      arrLine(dX,sty,dX,sby);
      ctx.save();ctx.translate(dX-12,(sty+sby)/2);ctx.rotate(-Math.PI/2);
      ctx.textAlign='center';ctx.fillText(`D  ${lD}mm`,0,0);ctx.restore();
    }

    // -- Crimped length label (when crimped) --
    if(cp>0.5){
      ctx.globalAlpha=(cp-0.5)*2*0.6;
      ctx.strokeStyle=theme==='dark'?'#5ecea0':'#047857';ctx.fillStyle=ctx.strokeStyle;
      const crX=cx+hwB+14;
      arrLine(crX,ty,crX,by);
      ctx.textAlign='left';ctx.fillText(`${cL}mm`,crX+10,(ty+by)/2+4);
    }

    // ===== PHASE LABEL & DOTS =====
    ctx.globalAlpha=1;ctx.font='600 12px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif';
    ctx.fillStyle=wc;ctx.textAlign='center';ctx.fillText(label,width/2,height-12);

    const dots=[{on:cp===0,c:theme==='dark'?'#a8b4c4':'#5a6475'},{on:cp>0&&cp<1&&f<FE+FC,c:theme==='dark'?'#f0b429':'#b45309'},{on:cp===1,c:theme==='dark'?'#5ecea0':'#047857'}];
    const dy=height-30,sp=22,sx=width/2-sp;
    dots.forEach((dd,i)=>{ctx.beginPath();ctx.arc(sx+i*sp,dy,dd.on?3.5:2,0,Math.PI*2);ctx.fillStyle=dd.on?dd.c:(theme==='dark'?'rgba(255,255,255,0.12)':'rgba(0,0,0,0.08)');ctx.fill();});

    anim.current=requestAnimationFrame(draw);
  },[dA,dB,dC,lD,lE,cL,width,height,theme,TOT,FE,FC,FCR,FX]);

  useEffect(()=>{fr.current=0;anim.current=requestAnimationFrame(draw);return()=>cancelAnimationFrame(anim.current);},[draw]);
  return <canvas ref={cvs} style={{width,height}} className="block"/>;
}
