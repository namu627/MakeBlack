import { useRef, useEffect } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

const HTML_CONTENT = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:#0d0c0b}
canvas{position:absolute;top:0;left:0}
</style>
</head>
<body>
<canvas id="s"></canvas>
<canvas id="a"></canvas>
<script>
const sc=document.getElementById('s');
const ac=document.getElementById('a');
const ctx=sc.getContext('2d',{willReadFrequently:true});
const actx=ac.getContext('2d',{willReadFrequently:true});
let S=300;
sc.width=S;sc.height=S;
ac.width=S;ac.height=S;

function sn(angle,seed,oct){
  oct=oct||3;
  let v=0,amp=1,tot=0;
  for(let o=0;o<oct;o++){
    v+=Math.sin(angle*Math.pow(2,o)+seed*(o+1)*1.618)*amp;
    tot+=amp;amp*=0.5;
  }
  return v/tot;
}

function ink(c,cx,cy,r,g,b,radius,seed,opacity){
  const pad=Math.ceil(radius*1.35);
  const x0=Math.max(0,Math.floor(cx-pad));
  const y0=Math.max(0,Math.floor(cy-pad));
  const x1=Math.min(S,Math.ceil(cx+pad));
  const y1=Math.min(S,Math.ceil(cy+pad));
  const w=x1-x0,h=y1-y0;
  if(w<=0||h<=0)return;
  const img=c.getImageData(x0,y0,w,h);
  const data=img.data;
  for(let py=0;py<h;py++){
    for(let px=0;px<w;px++){
      const dx=(x0+px)-cx,dy=(y0+py)-cy;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const angle=Math.atan2(dy,dx);
      const en1=sn(angle,seed,3)*radius*0.12;
      const en2=sn(angle,seed+5.3,2)*radius*0.06;
      const re=radius+en1+en2;
      const nd=dist/re;
      if(nd>1.28)continue;
      let a=0;
      if(nd<=1.0){
        const bf=0.55+nd*0.25;
        const ring=Math.max(0,1-Math.abs(nd-0.88)/0.18)*0.38;
        const tex=(sn(angle*3,seed+2.1,2)*0.5+0.5)*0.12*(1-nd*0.5);
        a=(bf+ring+tex)*opacity;
      }else{
        const ht=(nd-1.0)/0.28;
        a=Math.max(0,(1-ht)*(sn(angle,seed+1.7,3)*0.5+0.5)*0.22)*opacity;
      }
      a=Math.max(0,Math.min(1,a));
      if(a<0.005)continue;
      const idx=(py*w+px)*4;
      const ao=data[idx+3]/255;
      const aout=a+ao*(1-a);
      if(aout<0.001)continue;
      data[idx]=(r*a+data[idx]*ao*(1-a))/aout;
      data[idx+1]=(g*a+data[idx+1]*ao*(1-a))/aout;
      data[idx+2]=(b*a+data[idx+2]*ao*(1-a))/aout;
      data[idx+3]=aout*255;
    }
  }
  c.putImageData(img,x0,y0);
}

function hsl2rgb(h,s,l){
  s/=100;l/=100;
  const k=n=>(n+h/30)%12;
  const aa=s*Math.min(l,1-l);
  const f=n=>l-aa*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return[f(0)*255,f(8)*255,f(4)*255];
}

function getrgb(drop){
  if(drop.rgb&&drop.rgb.length===3)return drop.rgb;
  const c=drop.color||'';
  if(c.startsWith('#')){
    const h=c.replace('#','');
    return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];
  }
  const m=c.match(/[\\d.]+/g);
  if(m&&m.length>=3)return hsl2rgb(+m[0],+m[1],+m[2]);
  return[128,128,128];
}

let cached=0;

function renderFull(drops,total){
  ctx.fillStyle='#0d0c0b';
  ctx.fillRect(0,0,S,S);
  for(let i=0;i<drops.length;i++){
    const d=drops[i];
    const[r,g,b]=getrgb(d);
    const cx=(d.px||0.5)*S,cy=(d.py||0.5)*S;
    const cd=Math.sqrt(Math.max(cx,S-cx)**2+Math.max(cy,S-cy)**2);
    ink(ctx,cx,cy,r,g,b,cd*0.55,(d.seed||1)*0.001,0.92);
  }
  if(total>0&&drops.length>=total){
    ctx.fillStyle='rgba(0,0,0,0.82)';
    ctx.fillRect(0,0,S,S);
  }
  cached=drops.length;
}

let raf=null;
function animateDrop(drop){
  if(raf)cancelAnimationFrame(raf);
  const[r,g,b]=getrgb(drop);
  const cx=(drop.px||0.5)*S,cy=(drop.py||0.5)*S;
  const seed=(drop.seed||1)*0.001;
  const cd=Math.sqrt(Math.max(cx,S-cx)**2+Math.max(cy,S-cy)**2);
  const maxR=cd*0.42;
  let frame=0;const FRAMES=45;
  function draw(){
    actx.clearRect(0,0,S,S);
    const t=frame/FRAMES;
    const eE=1-Math.pow(1-Math.min(t*1.15,1),3.5);
    const eF=t<0.52?1:Math.max(0,1-(t-0.52)/0.48);
    if(eF<=0){actx.clearRect(0,0,S,S);return;}
    const curR=eE*maxR;
    if(curR>2)ink(actx,cx,cy,r,g,b,curR,seed,eF*0.85);
    frame++;
    if(frame<=FRAMES)raf=requestAnimationFrame(draw);
    else actx.clearRect(0,0,S,S);
  }
  raf=requestAnimationFrame(draw);
}

function handle(e){
  try{
    const d=JSON.parse(e.data);
    if(d.type==='render'){
      const drops=d.drops||[];
      if(d.forceRedraw||drops.length<cached||cached===0){
        renderFull(drops,d.totalCount||0);
      }else if(drops.length>cached){
        for(let i=cached;i<drops.length;i++){
          const drop=drops[i];
          const[r,g,b]=getrgb(drop);
          const cx=(drop.px||0.5)*S,cy=(drop.py||0.5)*S;
          const cd=Math.sqrt(Math.max(cx,S-cx)**2+Math.max(cy,S-cy)**2);
          ink(ctx,cx,cy,r,g,b,cd*0.55,(drop.seed||1)*0.001,0.92);
        }
        if(d.totalCount>0&&drops.length>=d.totalCount){
          ctx.fillStyle='rgba(0,0,0,0.82)';
          ctx.fillRect(0,0,S,S);
        }
        cached=drops.length;
      }
    }else if(d.type==='animDrop'){
      animateDrop(d.drop);
    }
  }catch(err){}
}

document.addEventListener('message',handle);
window.addEventListener('message',handle);
ctx.fillStyle='#0d0c0b';
ctx.fillRect(0,0,S,S);
</script>
</body>
</html>`;

export default function PaletteCanvas({ drops = [], totalCount = 0, size = 200, animDrop = null }) {
  const webviewRef = useRef(null);
  const prevDropCount = useRef(0);

  const send = (data) => {
    if (!webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify(data));
  };

  useEffect(() => {
    send({
      type: 'render',
      drops,
      totalCount,
      forceRedraw: drops.length < prevDropCount.current,
    });
    prevDropCount.current = drops.length;
  }, [drops, totalCount]);

  useEffect(() => {
    if (!animDrop) return;
    send({ type: 'animDrop', drop: animDrop });
  }, [animDrop]);

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#242424',
      backgroundColor: '#0d0c0b',
    }}>
      <WebView
        ref={webviewRef}
        source={{ html: HTML_CONTENT, baseUrl: 'http://localhost' }}
        style={{ width: size, height: size, backgroundColor: '#0d0c0b' }}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={() => {}}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        mixedContentMode="always"
        androidLayerType="software"
      />
    </View>
  );
}