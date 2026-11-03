/* SEATSCAPE 360 — independent WebGL auditorium, no CDN or external dependency.
   Coordinates are an illustrative reconstruction, NOT measured CGV construction drawings.
   Camera looks toward negative Z when seated; every physical recliner faces -Z.
   Original rows/seat IDs come exclusively from shared/data.js. */
(()=>{'use strict';
const DATA=window.CINEMA;
const canvas=document.getElementById('theater');
const stage=document.getElementById('stage');
const tooltip=document.getElementById('seat-hint');
const modeLabel=document.getElementById('mode-indicator');
const caption=document.getElementById('camera-caption');
const btnOverview=document.getElementById('overview-btn');
const btnFront=document.getElementById('front-btn');
const btnTop=document.getElementById('top-btn');
const btnFs=document.getElementById('fs-btn');
const btnCenter=document.getElementById('center-btn');
const select=document.getElementById('seat-input');
const sit=document.getElementById('sit-btn');
const seatDesc=document.getElementById('seat-desc');
const map=document.getElementById('seatmap');
const controlHint=document.getElementById('control-hint');
const lowerNote=document.getElementById('lower-note');
const status=document.getElementById('statusbox');
const gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false})||canvas.getContext('experimental-webgl',{alpha:false,antialias:true});
if(!gl){status.classList.add('show');status.textContent='이 브라우저에서 WebGL을 사용할 수 없습니다. Chrome 또는 Edge에서 다시 열어주세요.';return;}

// ---------- Minimal shader-based 3D renderer (actual depth buffer) ----------
const vert=`attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;attribute float aShine;attribute float aGlow;
uniform mat4 uP;uniform mat4 uV;varying vec3 vP;varying vec3 vN;varying vec3 vC;varying float vS;varying float vG;
void main(){vP=aP;vN=aN;vC=aC;vS=aShine;vG=aGlow;gl_Position=uP*uV*vec4(aP,1.0);}`;
const frag=`precision mediump float;varying vec3 vP;varying vec3 vN;varying vec3 vC;varying float vS;varying float vG;uniform vec3 uEye;
void main(){
 vec3 n=normalize(vN);vec3 eye=normalize(uEye-vP);
 vec3 l1=normalize(vec3(-0.35,0.85,0.55));vec3 l2=normalize(vec3(0.5,0.65,-0.62));
 float light=0.32+0.34*max(dot(n,l1),0.0)+0.18*max(dot(n,l2),0.0);
 for(int i=0;i<4;i++){
   vec3 lp;
   if(i==0)lp=vec3(-5.25,7.2,-2.4);
   else if(i==1)lp=vec3(5.25,7.2,0.0);
   else if(i==2)lp=vec3(-5.25,7.2,4.5);
   else lp=vec3(5.25,7.2,-5.3);
   vec3 dir=lp-vP;float rr=dot(dir,dir);dir=normalize(dir);
   light+=0.95*max(dot(n,dir),0.0)/(1.0+rr*0.065);
 }
 vec3 rgb=vC*light;
 vec3 h=normalize(l1+eye);float spec=pow(max(dot(n,h),0.0),16.0+vS*44.0)*vS*0.23;
 rgb+=vec3(spec)+vC*vG*1.45;
 // Desaturated cinema atmosphere without sacrificing wall and leather definition.
 float fog=clamp((length(uEye-vP)-24.0)/48.0,0.0,0.28);
 rgb=mix(rgb,vec3(0.085,0.098,0.108),fog);
 gl_FragColor=vec4(pow(clamp(rgb,0.0,1.0),vec3(0.87)),1.0);
}`;
function shader(src,type){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
let prog;
try{prog=gl.createProgram();gl.attachShader(prog,shader(vert,gl.VERTEX_SHADER));gl.attachShader(prog,shader(frag,gl.FRAGMENT_SHADER));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));}
catch(e){status.classList.add('show');status.textContent='3D 렌더러 초기화 중 문제가 발생했습니다: '+e.message;return;}
gl.useProgram(prog);
const attrib={p:gl.getAttribLocation(prog,'aP'),n:gl.getAttribLocation(prog,'aN'),c:gl.getAttribLocation(prog,'aC'),s:gl.getAttribLocation(prog,'aShine'),g:gl.getAttribLocation(prog,'aGlow')};
const uni={proj:gl.getUniformLocation(prog,'uP'),view:gl.getUniformLocation(prog,'uV'),eye:gl.getUniformLocation(prog,'uEye')};
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
const batchNames=['core','left','right','ceiling','rear','front','highlight'];
const raw=Object.fromEntries(batchNames.map(k=>[k,[]]));
let destination='core';const use=k=>{destination=k;};
const V=(x,y,z)=>[x,y,z];const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul=(v,s)=>v.map(x=>x*s);const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=v=>{let l=Math.hypot(...v)||1;return v.map(x=>x/l)};
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const col=h=>{let t=h.replace('#','');return [parseInt(t.slice(0,2),16)/255,parseInt(t.slice(2,4),16)/255,parseInt(t.slice(4,6),16)/255]};
const cols={floor:'#4b4b47',step:'#343633',riser:'#242525',edge:'#74716d',trim:'#222526',barrier:'#333434',barrierTop:'#62655f',wall:'#656761',seam:'#424441',seat:'#1b1e20',seat2:'#282b2d',seatedge:'#333638',seatshade:'#121516',metal:'#1e2324',cup:'#646965',light:'#e6d8b5',black:'#090e10',screen:'#cbc8bd',roof:'#373b3b',accent:'#55d3b3'};
function push(p,n,c,shine=0.1,glow=0){const dst=raw[destination];dst.push(...p,...n,...col(c),shine,glow)}
function triangle(a,b,c,color,shine=0.1,glow=0,norms){const n=norm(cross(sub(b,a),sub(c,a)));push(a,norms?.[0]||n,color,shine,glow);push(b,norms?.[1]||n,color,shine,glow);push(c,norms?.[2]||n,color,shine,glow)}
function quad(a,b,c,d,color,shine=0.1,glow=0){triangle(a,b,c,color,shine,glow);triangle(a,c,d,color,shine,glow)}
function box(x,y,z,w,h,d,color,shine=.08,glow=0){
 const a=w/2,b=h/2,c=d/2;const p=[[x-a,y-b,z-c],[x+a,y-b,z-c],[x+a,y+b,z-c],[x-a,y+b,z-c],[x-a,y-b,z+c],[x+a,y-b,z+c],[x+a,y+b,z+c],[x-a,y+b,z+c]];
 const faces=[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]];
 for(const f of faces)quad(...f.map(i=>p[i]),color,shine,glow)
}
// Beveled upholstery and metal: smooth normals at rounded corners, optional recline angle.
function rounded(x,y,z,w,h,d,r,color,shine=.4,lean=0){
 const halves=[w/2,h/2,d/2],seg=4;
 const faces=[[0,1,2,1],[0,1,2,-1],[1,0,2,1],[1,0,2,-1],[2,0,1,1],[2,0,1,-1]];
 function point(face,u,v){const [fixed,ua,va,sign]=face;let q=[0,0,0];q[fixed]=sign*halves[fixed];q[ua]=(2*u-1)*halves[ua];q[va]=(2*v-1)*halves[va];let k=q.map((v,j)=>clamp(v,-halves[j]+r,halves[j]-r));let outside=sub(q,k),normal=norm(outside);let p=add(k,mul(normal,r));
  const cy=p[1]*Math.cos(lean)-p[2]*Math.sin(lean);const cz=p[1]*Math.sin(lean)+p[2]*Math.cos(lean);
  const ny=normal[1]*Math.cos(lean)-normal[2]*Math.sin(lean);const nz=normal[1]*Math.sin(lean)+normal[2]*Math.cos(lean);
  return {p:[x+p[0],y+cy,z+cz],n:[normal[0],ny,nz]};}
 for(const face of faces)for(let i=0;i<seg;i++)for(let j=0;j<seg;j++){
  const a=point(face,i/seg,j/seg),b=point(face,(i+1)/seg,j/seg),c=point(face,(i+1)/seg,(j+1)/seg),d=point(face,i/seg,(j+1)/seg);
  triangle(a.p,b.p,c.p,color,shine,0,[a.n,b.n,c.n]);triangle(a.p,c.p,d.p,color,shine,0,[a.n,c.n,d.n]);
 }
}
function rod(start,end,r,color,shine=.55,sides=9){
 let axis=norm(sub(end,start));let helper=Math.abs(axis[1])>.84?[1,0,0]:[0,1,0];let a=norm(cross(axis,helper));let b=norm(cross(axis,a));
 for(let i=0;i<sides;i++){let t=i*2*Math.PI/sides,tt=(i+1)*2*Math.PI/sides;
  let p=add(mul(a,Math.cos(t)*r),mul(b,Math.sin(t)*r));let q=add(mul(a,Math.cos(tt)*r),mul(b,Math.sin(tt)*r));
  let v0=add(start,p),v1=add(start,q),v2=add(end,q),v3=add(end,p);
  triangle(v0,v1,v2,color,shine,0,[norm(p),norm(q),norm(q)]);triangle(v0,v2,v3,color,shine,0,[norm(p),norm(q),norm(p)]);
 }
}
function disc(x,y,z,r,h,color,shine=.15){rod([x,y-h/2,z],[x,y+h/2,z],r,color,shine,12)}
// Front-facing acoustic units: their circular faces must be in the XY plane.
// The original model's horizontal disc/torus was edge-on from the audience seats.
function circleOnFront(x,y,z,r,color,shine=.13,segments=26){
 const center=[x,y,z];
 for(let i=0;i<segments;i++){
  const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
  triangle(center,[x+Math.cos(a)*r,y+Math.sin(a)*r,z],
    [x+Math.cos(b)*r,y+Math.sin(b)*r,z],color,shine);
 }
}
function ringOnFront(x,y,z,inner,outer,color,shine=.12,segments=30){
 for(let i=0;i<segments;i++){
  const a=i*2*Math.PI/segments,b=(i+1)*2*Math.PI/segments;
  quad([x+Math.cos(a)*inner,y+Math.sin(a)*inner,z],
       [x+Math.cos(b)*inner,y+Math.sin(b)*inner,z],
       [x+Math.cos(b)*outer,y+Math.sin(b)*outer,z],
       [x+Math.cos(a)*outer,y+Math.sin(a)*outer,z],color,shine);
 }
}
function frontSpeaker(x,y,z){
 // Screen-wall speaker: enlarged driver and multi-ring surround, visible from the seats.
 // Four calls create exactly four units; this function adds no extra speaker meshes.
 circleOnFront(x,y,z,.462,'#040708');
 ringOnFront(x,y,z+.010,.402,.456,'#3b4041',.30);
 ringOnFront(x,y,z+.020,.336,.401,'#192021',.15);
 ringOnFront(x,y,z+.032,.126,.334,'#23292a',.13);
 ringOnFront(x,y,z+.044,.091,.125,'#101617',.18);
 circleOnFront(x,y,z+.052,.092,'#080c0d');
}
function torus(x,y,z,R,tube,color,shine=.8){const nv=14,nw=6;for(let a=0;a<nv;a++)for(let b=0;b<nw;b++){
 let t=a*2*Math.PI/nv,tt=(a+1)*2*Math.PI/nv,s=b*2*Math.PI/nw,ss=(b+1)*2*Math.PI/nw;
 const pt=(t,s)=>{const rr=R+tube*Math.cos(s);return{p:[x+rr*Math.cos(t),y+tube*Math.sin(s),z+rr*Math.sin(t)],n:[Math.cos(s)*Math.cos(t),Math.sin(s),Math.cos(s)*Math.sin(t)]}};
 let p=pt(t,s),q=pt(tt,s),r=pt(tt,ss),u=pt(t,ss);
 triangle(p.p,q.p,r.p,color,shine,0,[p.n,q.n,r.n]);triangle(p.p,r.p,u.p,color,shine,0,[p.n,r.n,u.n]);
 }}
function sphere(x,y,z,rx,ry,rz,color,shine=.32){const nx=10,ny=7;for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  function pv(t,p){const s=Math.sin(p);let n=[Math.cos(t)*s,Math.cos(p),Math.sin(t)*s];return {p:[x+n[0]*rx,y+n[1]*ry,z+n[2]*rz],n:norm([n[0]/rx,n[1]/ry,n[2]/rz])};}
  let a=pv(i*2*Math.PI/nx,j*Math.PI/ny),b=pv((i+1)*2*Math.PI/nx,j*Math.PI/ny),c=pv((i+1)*2*Math.PI/nx,(j+1)*Math.PI/ny),d=pv(i*2*Math.PI/nx,(j+1)*Math.PI/ny);
  triangle(a.p,b.p,c.p,color,shine,0,[a.n,b.n,c.n]);triangle(a.p,c.p,d.p,color,shine,0,[a.n,c.n,d.n]);
 }}
// ---------- PHOTO 1 · auditorium layout (front -> rear view) ----------
// Coordinates are model units, reconstructed from the photograph rather than surveyed dimensions.
// Front of auditorium = -Z. Looking BACK from the screen = +Z: the main stair is on the viewer's RIGHT (-X).
// A/B/C: 30; D: four photo-visible furnished positions, D1/D2 retain accessible IDs.
const rows='ABCD';
const rowYs=[0.52,1.88,3.26,4.72];
const rowZs=[-2.62,1.48,5.58,10.02];
const seatPitch=1.33;
// [2번-2] Rearward seat offset creates an unobstructed walking aisle in front.
// Row platform front: rowZ-1.65; front partition rear face: rowZ-1.465.
// Frontmost footrest: seatZ-1.08. SeatZ=rowZ+0.68 => ~1.065-unit aisle.
const ROW_SEAT_BACK_OFFSET=0.68;
const REAR_GALLERY_SEAT_BACK_OFFSET=0.46;
// [V22] In the actual photo, D9/D10 are on the LOWER side landing,
// one short flight below the curtain-side upper gallery (D1/D2).
// This must affect the FLOOR, both chairs, and the low-level guardrail.
const D9_D10_LOWER_STEP=0.78;
// [V40] D9/D10 remain on ONE wide, low, flat terrace.  The ONLY
// rear three-riser flight is in the OPEN side aisle beside that terrace.
// Photo reference: three wide CARPETED horizontal treads with actual
// vertical risers, one thin red safety nosing per tread, and a generous
// unobstructed low landing (not three painted stripes, isolated stair box,
// or stairs behind a blocking rail).  The high D1/D2 railing is retained.
const D_LOWER_SEAT_Z=9.20;
const D_LOW_REAR_RAIL_Z=10.58;
const D_DECK_SPLIT_X=2.35;
const D_LOWER_BAY_FRONT_Z=7.78;
const D_REAR_DECK_BACK_Z=12.96;
// Wide photo-proportioned stair flight: 3 x .65-deep full walking treads.
// Lower stair begins alongside the rail, never behind a transverse rail;
// 0.82 of flat HIGH landing remains toward the rear wall.
const D_SIDE_BACK_STAIR_LOW_Z=10.19;
const D_SIDE_BACK_STAIR_HIGH_Z=12.14;
const D_SIDE_BACK_STAIR_TREAD_DEPTH=(D_SIDE_BACK_STAIR_HIGH_Z-D_SIDE_BACK_STAIR_LOW_Z)/3;

const seats={};
const isWheel=id=>DATA.accessible(id);
const rnd=(i,j)=>((Math.sin(i*19.43+j*97.1)*41758.64)%1+1)%1;
// Rear gallery handrail: dark round tubular steel rather than pale square cages.
// Each continuous straight run has a top tube, an intermediate horizontal tube,
// vertical posts and compact welded junctions, as seen in the real auditorium.
function railSegment(a,b,baseY=0,railH=1.06,postStep=0.86,postAtEnd=true){
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 const count=Math.max(1,Math.ceil(length/postStep));
 const point=t=>[a[0]+(b[0]-a[0])*t,baseY,a[1]+(b[1]-a[1])*t];
 const top=baseY+railH,mid=baseY+railH*.49;
 for(let i=0;i<=count;i++){
  // The low rail's terminal post is replaced by a smoothly turned end.
  if(i===count&&!postAtEnd)continue;
  const q=point(i/count);
  rod([q[0],baseY,q[2]],[q[0],top,q[2]],.022,'#202626',.25,8);
  disc(q[0],baseY+.017,q[2],.040,.03,'#262c2a',.18);
 }
 rod([a[0],top,a[1]],[b[0],top,b[1]],.038,'#181f20',.40,10);
 rod([a[0],mid,a[1]],[b[0],mid,b[1]],.025,'#252d2d',.25,8);
}

// [V27 / STAIRS & ROW CROSS-AISLES: ONE CONTINUOUS FLOOR]
// From original photographs: three true ascending risers, then one wide,
// UNSTRIPED rectangular access landing at each A/B/C/D seat-row entrance.
// The platform, transverse path into the row and its elevation are identical.
// The photographed rear D9/D10 lower bay MUST have its own lower landing;
// the opposite D1/D2 gallery landing stays at rearY.
const AISLE_INNER=6.93;
const AISLE_OUTER=8.67;
const SIDE_WALL=9.05;
const FRONT_APPROACH_EDGE=-7.97;
const SIDE_STAIR_START_Z=-5.92;
const SIDE_STAIR_START_Y=-.11;
const SIDE_STAIR_FLIGHT_RISERS=3;
// Physical A/B/C terrace front edges are rowZ - 1.65, not rowZ - 1.50.
// Each landing runs along the row-side ACCESS zone rather than extending
// beyond the whole row; its full rectangle shares the row's floor level.
const ROW_PLATFORM_FRONT_OFFSET=1.65;
const ROW_LANDING_REAR_OFFSET=.40;
const SIDE_ROW_LANDINGS=rowZs.map((z,ri)=>({
 row:rows[ri],z0:z-ROW_PLATFORM_FRONT_OFFSET,z1:z+ROW_LANDING_REAR_OFFSET,
 height:rowYs[ri]
}));
const STAIR_PLATFORM_INNER=6.76; // existing A/B/C structural floor side
const REAR_PLATFORM_INNER=6.90;  // existing D split-gallery outer edge
function theaterAisleStair(side){
 const x=side*(AISLE_INNER+AISLE_OUTER)/2;
 const width=AISLE_OUTER-AISLE_INNER;
 const foundationY=-.51;
 const tread='#444943',landing='#474b46',riser='#171b1c';
 const mass='#272b28',silver='#949891',red='#ba626a';
 const walkTop=(z0,z1,level,mat=tread)=>{
   const length=z1-z0;
   box(x,(level+foundationY)/2,(z0+z1)/2,width,level-foundationY,length,mass,.008);
   box(x,level+.006,(z0+z1)/2,width-.014,.012,length-.012,mat,.006);
 };
 const stairStep=(z0,z1,bottom,top)=>{
   // Top of each of three treads RISES; not flat separated tiles or ramps.
   walkTop(z0,z1,top);
   box(x,(bottom+top)/2,z0-.017,width-.010,top-bottom+.011,.035,riser,.004);
   box(x,top+.022,z0+.034,width-.045,.018,.022,silver,.012);
   // V80: exposed continuous red safety nosing, above the tread face.
   // Separate from the silver strip and carpet to avoid coplanar flicker.
   box(x,top+.041,z0+.082,width-.048,.026,.068,'#d97880',.08,.18);
 };
 const threeSteps=(fromZ,toZ,fromY,toY)=>{
   const len=(toZ-fromZ)/SIDE_STAIR_FLIGHT_RISERS;
   const rise=(toY-fromY)/SIDE_STAIR_FLIGHT_RISERS;
   for(let i=0;i<SIDE_STAIR_FLIGHT_RISERS;i++)
     stairStep(fromZ+i*len,fromZ+(i+1)*len,fromY+i*rise,fromY+(i+1)*rise);
 };
 // [V40] Real full-footprint three-step side flight in the photograph.
 // This is NOT the generic short, stripe-dominated row-access staircase.
 // Each tread is a broad, FLAT rectangle; each step has one full-height
 // vertical front riser. The black/red nosing is flush and only at the
 // leading edge, rather than extra parallel bars painted across the floor.
 const photoThreeSteps=(fromZ,toZ,fromY,toY)=>{
   const n=3,depth=(toZ-fromZ)/n,rise=(toY-fromY)/n;
   const carpet='#4b4e49',front='#383b38',edge='#a26466',nose='#777b76';
   for(let i=0;i<n;i++){
     const za=fromZ+i*depth,zb=za+depth;
     const bottom=fromY+i*rise,top=bottom+rise;
     // Full-depth, actual elevated step mass and walking surface;
     // adjoining treads meet at their risers with NO disconnected gaps.
     box(x,(top+foundationY)/2,(za+zb)/2,width,top-foundationY,depth,mass,.007);
     box(x,top+.007,(za+zb)/2,width-.018,.014,depth-.018,carpet,.008);
     // The front face reveals the actual 0.26-unit height change.
     box(x,(top+bottom)/2,za+.007,width-.022,rise,.025,front,.012);
     // One narrow continuous silver/red stair nosing, as in the photo.
     box(x,top+.025,za+.025,width-.060,.018,.018,nose,.06);
     // V80: visible red strip at the leading edge of each rear three-step tread.
     box(x,top+.044,za+.080,width-.067,.026,.068,'#d97880',.08,.18);
   }
 };
 const levelLanding=(z0,z1,y)=>{
   walkTop(z0,z1,y,landing);
   // V78: no coplanar second cap over the landing (prevents depth flicker).
 };
 const sideRowConnection=(z0,z1,y,platformInner)=>{
   // Bridge the exact structural gap to the EXISTING row floor, not an
   // arbitrary 0.54-wide raised patch at only one spot as in v26.
   const from=platformInner,to=AISLE_INNER+.004;
   const cx=side*(from+to)/2;
   box(cx,y-.048,(z0+z1)/2,to-from,.096,z1-z0,landing,.005);
 };
 let lastZ=SIDE_STAIR_START_Z,lastY=SIDE_STAIR_START_Y;
 for(let ri=0;ri<SIDE_ROW_LANDINGS.length;ri++){
   const q=SIDE_ROW_LANDINGS[ri];
   // Photo-left D9/D10 = world +X, 0.78 units BELOW rear door gallery.
   const floorY=(ri===3&&side===1)?rowYs[3]-D9_D10_LOWER_STEP:q.height;
   threeSteps(lastZ,q.z0,lastY,floorY);
   // [V39] An open, wide, level lower walk follows the normal C->D flight.
   // On +X, it stops AT the explicitly marked rear SIDE staircase entrance.
   // The 3 steps are beside (not behind/across) the photo rail, and there
   // are no steps or raised tiles across the large D9/D10 seating floor.
   const landingEnd=(ri===3&&side===1)?D_SIDE_BACK_STAIR_LOW_Z:q.z1;
   levelLanding(q.z0,landingEnd,floorY);
   sideRowConnection(q.z0,landingEnd,floorY,ri===3?REAR_PLATFORM_INNER:STAIR_PLATFORM_INNER);
   lastY=floorY;lastZ=landingEnd;
 }
 if(side===1){
   // The picture shows broad real steps, NOT narrow three-stripe treads.
   // Walking from rear to screen, 3 x 0.26 descending risers lead to the
   // lower, broad, completely FLAT D9/D10 walkway.  Rail ends before this
   // open side aisle; the stairs don't overlap any seat or guardrail.
   photoThreeSteps(D_SIDE_BACK_STAIR_LOW_Z,D_SIDE_BACK_STAIR_HIGH_Z,
                   rowYs[3]-D9_D10_LOWER_STEP,rowYs[3]);
   // The rear top landing is flat and starts exactly at the final tread.
   levelLanding(D_SIDE_BACK_STAIR_HIGH_Z,D_REAR_DECK_BACK_Z,rowYs[3]);
   lastY=rowYs[3];lastZ=D_REAR_DECK_BACK_Z;
 }else if(lastZ<D_REAR_DECK_BACK_Z){
   // D1/D2-side passage remains one uninterrupted HIGH, flat landing.
   levelLanding(lastZ,D_REAR_DECK_BACK_Z,lastY);
   sideRowConnection(lastZ,D_REAR_DECK_BACK_Z,lastY,REAR_PLATFORM_INNER);
 }
 // Both stairways approach from the v17 flat SCREEN-SIDE front corridor.
 const z0=FRONT_APPROACH_EDGE,z1=SIDE_STAIR_START_Z;
 box(x,SIDE_STAIR_START_Y-.08,(z0+z1)/2,width,.16,z1-z0,'#474b46',.008);
}

function frontRowBoundary(){
 // [PHOTO 3 / V13] A-row front retaining wall reconstructed from the new
 // audience-side photograph. This is NOT the separate screen-right exit wall.
 // Reference characteristics: a continuous matte charcoal fascia, a SOLID
 // inclined return at the LEFT end, a slender PALE end cap at the RIGHT stair,
 // and uninterrupted walking floor in front. Do not add any rail or protruding
 // wall into either seat-side stair; x remains safely inside +/- AISLE_INNER.
 use('core');
 const x0=-6.72,x1=6.76, z=-4.295;
 // [V68] Lower only the A-row front fascia top by 0.05 model units.
 // Keep its foundation, sloped stair returns, and all seat/camera geometry.
 const bottom=-.34, top=1.42, thickness=.215;
 const center=(x0+x1)/2,length=x1-x0;

 // Full-height and seamless front of the actual raised A-row platform.
 // Dark neutral grey, with just a quiet low skirting seam as in the photo.
 box(center,(top+bottom)/2,z,length,top-bottom,thickness,'#353836',.07);
 box(center,(top+bottom)/2,z-.114,length-.23,top-bottom-.075,.019,'#3b3d3a',.09);
 box(center,bottom+.068,z-.134,length-.25,.031,.018,'#292c29',.06);
 // Slim horizontal top edge, not a tall tubular railing.
 box(center,top+.012,z,length,.035,thickness+.060,'#7c807b',.18);
 box(center,top-.033,z-.142,length,.018,.014,'#262b29',.08);

 // [V67] The A-row fascia must reach the side stair boundaries and continue
 // down to the front corridor foundation; never extend the auditorium walls.
 // Keep the lowered V65 top and the existing walkable stair footprint intact.
 for(const side of [-1,1]){
  const xa=side<0?-AISLE_INNER:x1,xb=side<0?x0:AISLE_INNER;
  const lo=Math.min(xa,xb),hi=Math.max(xa,xb);
  box((lo+hi)/2,(top-1.63)/2,z,hi-lo,top+1.63,thickness,'#353836',.07);
  box((lo+hi)/2,top+.012,z,hi-lo,.035,thickness+.060,'#7c807b',.18);
 }
 // [V15] Mirror the solid sloping end-wall on BOTH sides of the A-row
 // retaining wall. Before V15 the left had a short wedge but the right was
 // only a vertical end cap; from oblique angles this looked disconnected.
 // The sloped returns terminate at the FRONT ends of the existing side stairs
 // (z=-5.88), never sticking into their walking width (AISLE_INNER=6.93).
 const shoulderBackZ=z+.015,shoulderFrontZ=-5.88;
 const shoulderFrontTop=.62;
 function endSlope(side){
  const endX=side<0?x0:x1;
  // All material stays inside the stair inner boundary (abs(x)<6.93).
  // The two vertical wall sheets form a real, closed solid, not an isolated line.
  const outsideX=endX+side*.105;
  const insideX=endX-side*.165;
  for(const xx of [outsideX,insideX]){
   quad([xx,bottom,shoulderFrontZ],[xx,bottom,shoulderBackZ],
        [xx,top,shoulderBackZ],[xx,shoulderFrontTop,shoulderFrontZ],
        '#2b2f2c',.065);
  }
  // Subdued continuous light-grey sloped capping matches the photographed end.
  quad([outsideX,shoulderFrontTop,shoulderFrontZ],
       [outsideX,top,shoulderBackZ],
       [insideX,top,shoulderBackZ],
       [insideX,shoulderFrontTop,shoulderFrontZ], '#777b74',.19);
  // Closure at the LOW front tip, flush with the side stair opening.
  quad([outsideX,bottom,shoulderFrontZ],[insideX,bottom,shoulderFrontZ],
       [insideX,shoulderFrontTop,shoulderFrontZ],
       [outsideX,shoulderFrontTop,shoulderFrontZ],'#242824',.04);
  // A hairline highlights the slope without creating an airborne thick rail.
  const stripX=outsideX-side*.016;
  rod([stripX,shoulderFrontTop+.014,shoulderFrontZ],
      [stripX,top+.014,shoulderBackZ],.009,'#a2a59c',.20,7);
 }
 endSlope(-1);
 endSlope(1);

 // Retain the photographed bright, *flush* edge trim at the RIGHT staircase.
 // This is a thin finishing strip and is not a second blocking concrete wall.
 const capX=x1-.082;
 box(capX,(top+bottom)/2,z+.014,.164,top-bottom+.030,.27,'#a4aaa1',.14);
 box(x1-.073,(top+bottom)/2,z-.151,.146,top-bottom+.010,.020,'#cacdc5',.22);
 box(capX,top+.029,z+.014,.174,.050,.282,'#d3d4cb',.19);
 box(x1-.176,(top+bottom)/2,z-.149,.013,top-bottom-.02,.020,'#6e726b',.08);
}
function frontExitCorridor(){
 // [EXIT-12] Focused edit of V11: remove stair-side rail and add red step edges.
 // Extend the original parapet cap to the existing right acoustic wall, making
 // it a single uninterrupted boundary instead of a free-standing end post.
 // Open the right floor strip that previously BLOCKED the stair landing;
 // seven descending treads terminate at the same level as the lowered doorway.
 use('front');
 // [V17] Move the exit-facing parapet toward the screen, away from BOTH
 // A-row side-stair landings. Keep the exit steps, door and screen equipment.
 const begin=.86,end=9.02,backZ=-9.74,nearZ=FRONT_APPROACH_EDGE;
 const entranceY=-.11,exitY=-1.33,foundationY=-1.63;
 const stairStart=1.16,landingStart=6.92,stairCount=7; // V47: wider flat landing before exit door
 const stepWidth=(landingStart-stairStart)/stairCount;
 const stepRise=(entranceY-exitY)/stairCount;
 const stairY=x=>entranceY-stepRise*Math.min(stairCount,Math.max(0,Math.floor((x-stairStart)/stepWidth)));

 // Original V7 entrance is level with the front crossing, with no cutout or
 // raised shoulder. The full passage has a CLOSED lower foundation: no pit.
 quad([begin,entranceY,backZ],[stairStart,entranceY,backZ],
      [stairStart,entranceY,nearZ],[begin,entranceY,nearZ],'#4a4d47',.09);
 quad([begin,foundationY,backZ],[stairStart,foundationY,backZ],
      [stairStart,entranceY,backZ],[begin,entranceY,backZ],'#303530');
 quad([begin,foundationY,nearZ],[stairStart,foundationY,nearZ],
      [stairStart,entranceY,nearZ],[begin,entranceY,nearZ],'#393d38');

 // Seven genuine level treads, with vertical risers facing the right-hand exit.
 // Actual Y of every tread drops by 0.11 model units as X grows toward the door.
 for(let i=0;i<stairCount;i++){
  const left=stairStart+i*stepWidth,right=left+stepWidth;
  const y=entranceY-i*stepRise,next=y-stepRise;
  quad([left,y,backZ],[right,y,backZ],[right,y,nearZ],[left,y,nearZ],'#4b4f48',.09);
  quad([right,next,backZ],[right,next,nearZ],[right,y,nearZ],[right,y,backZ],'#292f2c',.07);
  quad([left,foundationY,backZ],[right,foundationY,backZ],
       [right,y,backZ],[left,y,backZ],'#303530',.05);
  quad([left,foundationY,nearZ],[right,foundationY,nearZ],
       [right,y,nearZ],[left,y,nearZ],'#393d38',.06);
  // [EXIT-12] Red stair nosing, matching the auditorium's existing
  // side-aisle steps (#c76d76). One stripe on EVERY descending tread,
  // across the walking width; no vertical panel or isolated floating bar.
  box(right-.058,y+.014,(backZ+nearZ)/2,.094,.028,nearZ-backZ-.12,'#c76d76',.16,.15);
  // Thin off-white seam immediately behind the red safety edge.
  box(right-.124,y+.015,(backZ+nearZ)/2,.024,.017,nearZ-backZ-.15,'#c5c4b4',.10,.06);
 }
 // [V47] Stair ends earlier; a 2.10-unit level landing separates steps from the door.
 // Final stair tread / landing and the door threshold share exitY = -1.33.
 quad([landingStart,exitY,backZ],[end,exitY,backZ],
      [end,exitY,nearZ],[landingStart,exitY,nearZ],'#50554d',.09);
 quad([landingStart,foundationY,backZ],[end,foundationY,backZ],
      [end,exitY,backZ],[landingStart,exitY,backZ],'#303530');
 quad([landingStart,foundationY,nearZ],[end,foundationY,nearZ],
      [end,exitY,nearZ],[landingStart,exitY,nearZ],'#393d38');
 // Flat stair-end landing (no doorway here after V48).
 quad([6.92,exitY,-8.70],[9.02,exitY,-8.70],
      [9.02,exitY,nearZ-.06],[6.92,exitY,nearZ-.06],'#565b53',.10);
 box(8.70,exitY-.012,(-8.70+nearZ-.06)/2,.24,.024,8.70+nearZ-.06,'#656d61',.16);

 // [V17] Retain V7 wall top height, but move its FRONT location forward
 // to leave a proper walking apron below both seat-side stairs. Extend RIGHT end
 // to the right acoustic wall: x=8.97 overlaps its inner face by a few cm.
 // Lower solid portion rests below the stair landing; it is not a floating lip.
 const wallL=1.10,wallR=8.97,wz=nearZ+.075,top=.96,bottom=-1.63;
 const center=(wallL+wallR)/2,length=wallR-wallL;
 box(center,(top+bottom)/2,wz,length,top-bottom,.175,'#535650',.09);
 box(center,(top+bottom)/2,wz+.095,length-.050,top-bottom-.105,.016,'#646860',.08);
 box(center,top+.021,wz,length,.046,.222,'#9a9d94',.20);
 box(center,top-.053,wz+.111,length,.025,.020,'#424641',.06);
 box(center,bottom+.065,wz+.11,length,.038,.022,'#343934',.07);
 box(wallL+.008,(top+bottom)/2,wz,.016,top-bottom,.174,'#414640');
 box(wallR-.008,(top+bottom)/2,wz,.016,top-bottom,.174,'#414640');

 // [V46] Screen-side exit: photo shows a continuous slender black steel
 // handrail following the descending side stair behind the low solid fascia.
 // The previous 2.5-unit segment stopped abruptly and looked disconnected.
 // Keep it on the BACK edge of the exit stair, away from the walking tread.
 const railZ=backZ+.20;
 const railStart=1.19,railEnd=6.79; // V47: stop rail before flat door landing
 const railFoot=x=>{
  const i=Math.min(stairCount-1,Math.max(0,Math.floor((x-stairStart)/stepWidth)));
  return entranceY-i*stepRise;
 };
 const railHeight=1.00;
 const railY=x=>entranceY-(x-stairStart)/(landingStart-stairStart)*(entranceY-exitY)+railHeight;
 rod([railStart,railY(railStart),railZ],[railEnd,railY(railEnd),railZ],.024,'#171c1b',.32,10);
 rod([railStart,railY(railStart)-.43,railZ],[railEnd,railY(railEnd)-.43,railZ],.014,'#222827',.22,8);
 for(let x=railStart;x<=railEnd+.001;x+=1.12){
  const foot=railFoot(x);
  rod([x,foot+.012,railZ],[x,railY(x),railZ],.018,'#1a2020',.25,8);
 }
 // A short upright return closes the exposed top end, without placing a
 // transverse rail across the approach or the exit doorway.
 rod([railStart,entranceY+.01,railZ],[railStart,railY(railStart),railZ],.020,'#171c1b',.25,8);

 // [V50] Widen exit leaf to a cinema-scale 1.55 units and raise to 2.80; keep landing and stairs unchanged.
 // [V49] EXIT AT THE FOOT OF THE DESCENDING STAIR, not at its upper level.
 // The seven treads descend toward +X. The flat lower landing begins at
 // landingStart and ends at x=end. The exit leaf is in the SIDE wall of
 // this lower landing, with its threshold at exitY.
 use('right');
 const wx=8.89,doorZ=-8.86,low=exitY,doorH=2.80,doorW=1.55,high=low+doorH;
 const wallExistingBottom=-.13;
 box(8.985,(wallExistingBottom+foundationY)/2,(backZ+nearZ)/2,.15,
     wallExistingBottom-foundationY,nearZ-backZ,'#343a35',.06);
 // Door on the lower side-wall: keep it within the landing's Z span.
 box(wx-.081,(high+low)/2,doorZ,.043,doorH,doorW,'#101715',.08);
 box(wx-.120,(high+low)/2,doorZ,.018,doorH-.11,doorW-.12,'#303831',.12);
 box(wx-.139,(high+low)/2,doorZ-doorW/2+.018,.026,doorH,.035,'#8c958a',.20);
 box(wx-.139,(high+low)/2,doorZ+doorW/2-.018,.026,doorH,.035,'#8c958a',.20);
 box(wx-.139,high+.015,doorZ,.026,.048,doorW+.04,'#97a095',.24);
 box(wx-.152,low+1.12,doorZ+.52,.023,.10,.035,'#b0b6ab',.30);
 const signY=high+.23;
 box(wx-.142,signY,doorZ,.038,.30,.46,'#2d7150',.17,.30);
 box(wx-.166,signY,doorZ,.014,.061,.29,'#d5f4dc',.07,.46);
 box(wx-.141,high-.08,doorZ+.61,.040,.14,.12,'#241c1c');
 sphere(wx-.170,high-.05,doorZ+.61,.042,.042,.041,'#e05249',.25,.63);

}function room(){
 use('core');
 // [EXIT-06] Split the front floor ONLY under the real descending corridor.
 // The right hand ramp is physically below the main slab; its top is visible
 // from above, while the remaining floor is solid. No floating black gap.
 const slabTop=-.11,slabBottom=-.57;
 const slab=(xa,xb,za,zb,c='#454844')=>
  box((xa+xb)/2,(slabTop+slabBottom)/2,(za+zb)/2,
      xb-xa,slabTop-slabBottom,zb-za,c);
 slab(-8.92,.86,-10.43,-4.01); // left area continuous, under left diagonal rail
 slab(.86,8.76,-10.43,-9.74); // thin strip at the screen-wall equipment
 slab(.86,8.76,FRONT_APPROACH_EDGE,-4.01); // longer, continuous front cross-aisle
 slab(8.76,8.92,-10.43,-9.74); // right side only BEHIND stair route
 slab(8.76,8.92,FRONT_APPROACH_EDGE,-4.01); // right side only IN FRONT of stair route
 box(0,-.086,-4.67,17.66,.025,.07,'#777a73',.09);
 // [PHOTO 3] The raised A-row boundary is a SEPARATE wall in FRONT OF THE SEATS,
 // further back than the exit structure, with a slanted left end.
 frontRowBoundary();
 // Four DISTINCT terraced levels: no generic uniform checkerboard platform stack.
 // D rear platform deliberately kept separate from the ten-seat main blocks.
 for(let ri=0;ri<3;ri++){
  const y=rowYs[ri],z=rowZs[ri];
  box(0,y-.23,z,13.52,.46,3.30,ri%2===0?'#454844':'#4b4e49');
  if(ri>0){
   box(0,y+.460,z-1.61,12.70,.96,.29,'#313534');
   box(0,y+.965,z-1.61,12.74,.080,.34,'#747871',.24);
   box(0,y+.04,z-1.82,12.72,.034,.12,'#aaa49a',.09);
   for(let x of [-4.8,-2.4,.0,2.4,4.8])box(x,y+.50,z-1.45,.012,.95,.013,'#252b29');
   // [V67] Close both ends of the row-front opaque parapet to the inner
   // stair edges. The bottom reaches the structural step base; the top is
   // unchanged, so seated sightlines and the 3cm reduction remain intact.
   for(const side of [-1,1]){
    const inner=6.35,outer=AISLE_INNER;
    const base=y-.69,upper=y+.925;
    box(side*(inner+outer)/2,(base+upper)/2,z-1.61,
        outer-inner,upper-base,.29,'#313534',.06);
    box(side*(inner+outer)/2,y+.965,z-1.61,
        outer-inner,.080,.34,'#747871',.24);
   }

  }
  // [V73] ALL THREE A/B/C rows: close the dark side/rear trench right up
  // to the existing parapet/aisle boundary. Use an actual opaque floor
  // surface, not a black-colour overlay. Keep side stairs outside x=6.93.
  // The earlier V72 bridge only handled A/B between-row gaps and missed C.
  for(const side of [-1,1]){
   const x0=6.35,x1=AISLE_INNER-.012;
   box(side*(x0+x1)/2,y-.105,z+.055,x1-x0,.21,3.40,'#4b4e49');
  }
  // [V74] Close the remaining black rectangular slots at BOTH ENDS of
  // every A/B/C front parapet.  V73 bridged the rear strips, but the
  // short end returns at z-1.61 still terminated above an unfilled void.
  // A solid carpet-coloured structural infill meets the parapet end and
  // the aisle landing.  It is opaque geometry, not a dark-colour patch.
  for(const side of [-1,1]){
   const inner=6.22, outer=AISLE_INNER-.008;
   const endZ=z-1.61;
   // Under the entire parapet-to-aisle junction, including its front tip.
   box(side*(inner+outer)/2,y-.38,endZ-.12,
       outer-inner,.86,1.12,'#484b46',.055);
   // Close the vertical exposed face at the step-end, flush with the floor.
   box(side*(inner+outer)/2,y-.19,endZ-.681,
       outer-inner,.48,.035,'#424641',.045);
   // Flush walking-surface cap; reaches the grey parapet with no black slot.
   box(side*(inner+outer)/2,y+.017,endZ-.12,
       outer-inner,.035,1.13,'#50534d',.055);
  }
  // The rear edge behind C is also capped; no open slot at the final row.
  if(ri===2){
   box(0,y-.105,z+1.80,2*AISLE_INNER-.024,.21,.48,'#4b4e49');
  }
  // [V78] C row: close the entire rear gap up to the D deck front edge.
  // Solid horizontal floor at C level and a vertical riser against the
  // higher D platform; no thin dark trench remains behind C recliners.
  if(ri===2){
   const cRear=z+1.65, dFront=7.78;
   const gapDepth=dFront-cRear;
   if(gapDepth>0){
    box(0,y-.13,(cRear+dFront)/2,2*AISLE_INNER-.04,.26,gapDepth+.015,'#4b4e49',.005);
    const dY=rowYs[3];
    box(0,(y+dY)/2-.02,dFront-.018,2*AISLE_INNER-.04,dY-y+.04,.048,'#424641',.005);
   }
  }
  // [V72] Solid floor behind each A/B/C seat row. The previous geometry
  // left an open longitudinal trench between the rear of this row slab
  // and the next raised tier. Fill that void with continuous carpeted
  // walking surface and a solid riser, without touching seats/parapets.
  if(ri<2){
   const backEdge=z+1.65;
   const nextFront=rowZs[ri+1]-1.65;
   const span=nextFront-backEdge;
   if(span>0){
    box(0,y-.115,(backEdge+nextFront)/2,12.70,.23,span+.018,'#4b4e49');
    const nextY=rowYs[ri+1];
    box(0,(y+nextY)/2-.06,nextFront-.035,12.70,nextY-y+.12,.095,'#424641');
   }
  }
  // Open aisle behind recliners, visually separates the row from the next tier.
  box(0,y-.002,z+1.56,13.50,.026,.37,'#5b5e58');
 }
 // [V36 · ACTUAL REAR GALLERY PHOTO GEOMETRY]
 // CAMERA: seated eyes look -Z toward the screen. D9/D10 (+X) is the
 // forward/lower bay; D1/D2 (-X) is the rearward/higher door-side bay.
 // The old implementation made both decks equally deep, and patched the
 // difference with zigzag rails. ALL physical seams below are straight.
 const rearY=rowYs[3],lowerY=rearY-D9_D10_LOWER_STEP;
 const splitX=D_DECK_SPLIT_X;
 const upperDeckThickness=.94,lowerDeckThickness=.44;
 const highFront=7.78,back=D_REAR_DECK_BACK_Z;
 // HIGH side: one uninterrupted rectangular slab and its visible fascia.
 box((-6.90+splitX)/2,rearY-upperDeckThickness/2,(highFront+back)/2,
     splitX+6.90,upperDeckThickness,back-highFront,'#474b47');
 // [V38] D9/D10 deck: the recliners remain on ONE low, flat floor.
 // [V41] However, the USER-CORRECTED real photo shows that ONLY the
 // floor BEHIND the D9/D10 rear railing rises back up. Therefore keep
 // the front/lower seating bay low, but raise just the rear walking strip
 // behind the rail to the same high level as the D1/D2 rear gallery.
 box((splitX+6.90)/2,lowerY-lowerDeckThickness/2,
     (D_LOWER_BAY_FRONT_Z+back)/2,
     6.90-splitX,lowerDeckThickness,
     back-D_LOWER_BAY_FRONT_Z,'#474b47');
 const dRearRaisedFrontZ=D_LOW_REAR_RAIL_Z+.02;
 box((splitX+6.90)/2,rearY-upperDeckThickness/2,
     (dRearRaisedFrontZ+back)/2,
     6.90-splitX,upperDeckThickness,
     back-dRearRaisedFrontZ,'#474b47');
 // Top finish on the raised rear strip behind the D9/D10 rail.
 box((splitX+6.90)/2,rearY+.034,(dRearRaisedFrontZ+back)/2,
     6.90-splitX,.057,back-dRearRaisedFrontZ,'#525a55');
 // [V71] D9/D10: the front parapet must mask the C-row seat backs,
 // just as the B/C seat views do. Keep its top BELOW seated eye level,
 // but move it toward D9/D10 and raise the opaque face to the same
 // approximate relative height as the other tier-front partitions.
 // Preserve the low deck, both chairs, rear rail and all stair geometry.
 // [V75] Increase the clear floor between the D9/D10 recliners and their front parapet.
 // Shift only the opaque front parapet toward the screen (-Z); preserve chairs, rear rail and height.
 // [V76] Close the small exposed front/side strip: carry the D9/D10
 // parapet all the way to the low platform's outer edge (x=6.90),
 // stopping before the existing stair aisle at x=6.93. Keep its
 // screenward Z position from V75 so legroom remains unchanged.
 // [V77] Align the FRONT FACE of the opaque partition with the actual
 // front edge of the D9/D10 low deck (Z=7.78).  The previous centre at
 // 8.04 left the partition inset and visually overhanging the stair edge.
 // Moving the entire wall forward by .13 adds legroom without touching seats.
 const dFrontParapetZ=D_LOWER_BAY_FRONT_Z+.26/2;
 const dFrontParapetEndX=REAR_PLATFORM_INNER;
 const dFrontParapetTop=lowerY+1.075;
 const dFrontParapetBase=lowerY-.055;
 box((splitX+dFrontParapetEndX)/2,(dFrontParapetBase+dFrontParapetTop)/2,
     dFrontParapetZ,dFrontParapetEndX-splitX,dFrontParapetTop-dFrontParapetBase,.26,'#343736');
 box((splitX+dFrontParapetEndX)/2,dFrontParapetTop+.035,dFrontParapetZ,
     dFrontParapetEndX-splitX,.07,.32,'#777971');
 // Small flush safety edging on the upper floor, not an opaque wall.
 box((-6.23+splitX)/2,rearY+.055,7.86,splitX+6.23,.11,.12,'#343736',.025);

 // [V39] PHOTO RAILS. D1/D2: long, straight, high guardrail stays intact.
 // D9/D10: the rear low guardrail continues along the marked missing part
 // towards the side aisle, but after V41/V42 it now sits on the RAISED rear
 // walking floor behind the seats, ending before the stair opening in a
 // rounded downturned return like the close-up reference image. It never
 // crosses the open stair or boxes the low bay in.
 // Keep the central two-bend height change, not staircase-shaped rods.
 const darkSteel='#1c2425',midSteel='#303737';
 const upperBase=rearY+.035,lowerBase=lowerY+.035;
 // [V42] After raising the D9/D10 rear walking floor, the D9/D10 rear
 // guardrail must also stand ON that raised floor. Keep the seat floor low,
 // but lift the right-side rear rail base/posts onto the raised rear strip.
 const lowRearBase=rearY+.035;
 const upperTop=upperBase+1.045,lowerTop=lowRearBase+.92;
 const upperMid=upperBase+1.045*.49,lowerMid=lowRearBase+.92*.49;
 const highFrontRailZ=7.91;
 railSegment([-6.30,highFrontRailZ],[1.42,highFrontRailZ],upperBase,1.045,.83);
 // Keep the existing raised-zone edge return without enclosing D1/D2.
 railSegment([-6.30,highFrontRailZ],[-6.30,8.26],upperBase,1.045,.80);
 // Complete the low run all the way to the edge of the side passage.
 // The rounded cap still ends at X=6.78, BEFORE stair inner edge X=6.93.
 const lowRailEndX=6.64;
 railSegment([3.18,D_LOW_REAR_RAIL_Z],[lowRailEndX,D_LOW_REAR_RAIL_Z],
             lowRearBase,.92,.74,false);
 // Photograph-style round DOWN-TURN at the LEFT END of the low run.
 // A vertical end cap curls down toward the deck instead of forming a cage.
 const bendR=.14,bendCX=3.18,bendZ=D_LOW_REAR_RAIL_Z;
 let previous=[bendCX,lowerTop,bendZ];
 for(let i=1;i<=8;i++){
   const t=(i/8)*Math.PI/2;
   const next=[bendCX-bendR*Math.sin(t),
     lowerTop-bendR*(1-Math.cos(t)),bendZ];
   rod(previous,next,.034,darkSteel,.32,10);
   previous=next;
 }
 rod(previous,[previous[0],lowRearBase+.23,bendZ],.034,darkSteel,.32,10);
 // [V39] Matching photo-style rounded termination on the far side. A
 // compact horizontal-to-down quarter-turn replaces a squared-off steel end.
 const rightEndR=.14;
 previous=[lowRailEndX,lowerTop,D_LOW_REAR_RAIL_Z];
 for(let i=1;i<=10;i++){
   const t=(i/10)*Math.PI/2;
   const next=[lowRailEndX+rightEndR*Math.sin(t),
     lowerTop-rightEndR*(1-Math.cos(t)),D_LOW_REAR_RAIL_Z];
   rod(previous,next,.034,darkSteel,.32,10);
   previous=next;
 }
 rod(previous,[previous[0],lowRearBase+.22,D_LOW_REAR_RAIL_Z],
     .034,darkSteel,.32,10);
 // Plan: two concentrated bends near the two-tier seam rather than 8
 // alternating, step-shaped zigzags. Top and lower tubes join both ends.
 // x,z,topY,midY. The intervening heights fall in TWO short transitions.
 const railPath=[
   [1.42,highFrontRailZ,upperTop,upperMid],
   [2.24,9.66,upperTop,upperMid],
   [2.62,10.05,(upperTop+lowerTop)/2,(upperMid+lowerMid)/2],
   [3.18,D_LOW_REAR_RAIL_Z,lowerTop,lowerMid]
 ];
 for(let i=1;i<railPath.length;i++){
   const a=railPath[i-1],b=railPath[i];
   rod([a[0],a[2],a[1]],[b[0],b[2],b[1]],.032,darkSteel,.32,10);
   rod([a[0],a[3],a[1]],[b[0],b[3],b[1]],.022,midSteel,.22,8);
 }
 for(const q of railPath.slice(1,-1)){
   const base=rearY;
   rod([q[0],base+.035,q[1]],[q[0],q[2],q[1]],.021,darkSteel,.23,8);
 }
 // No extra railing across the D9/D10 FRONT, no tall front wall,
 // no separate black bar directly behind the D1/D2 seat backs.

 // Keep D1/D2's established raised-zone finish on the upper gallery.
 // D9/D10 now also has a raised finish ONLY on the rear strip behind its rail;
 // the low seating floor itself remains one flat rectangle with no extra pad.
 box(-3.85,rearY+.034,9.59,3.08,.057,2.16,'#525a55');
 // A/B/C/D approach steps unchanged. The PHOTO staircase uses three
 // physically modelled wide treads in the open +X aisle only.
 theaterAisleStair(-1);
 theaterAisleStair(1);
 // Keep the pre-existing HIGH D1/D2 bay floor markings; never put
 // raised plates, thin stripes or 3-step treads on D9/D10 rear path.
 for(const xx of [-5.40,-2.28])box(xx,rearY+.065,9.65,.030,.012,2.18,'#a5ada3',.23);
 box(-3.84,rearY+.065,8.56,3.12,.012,.031,'#a5ada3',.23);
 // Rear entry route remains flat and shares the same high level.
 box(-3.96,rearY+.005,12.08,2.75,.026,1.12,'#585d58');
 // Markers are kept on the upper D1/D2 gallery only; no floating dots
 // or repeated red step-like strips above the lowered D9/D10 path.
 for(let x=-6.4;x<D_DECK_SPLIT_X;x+=.95)disc(x,rearY+.044,12.36,.043,.018,'#b34a54',.08);
 // Walls: high textured grey acoustic tiles, light sweeping downward on LEFT photo wall.
 for(let side of [-1,1]){
  use(side<0?'left':'right');
  const xx=side*SIDE_WALL;
  box(xx,4.64,1.48,.24,9.54,23.80,'#313633');
  // V55: broad, portrait-format acoustic panels as in the reference photos.
  // Stagger vertical joints with muted, irregular grey tones; no emissive tiles.
  const panelShades=['#62645f','#686a64','#60635f','#6c6d66','#646760','#696b65','#5e615d'];
  const panelH=2.20, panelW=1.62;
  for(let yi=0;yi<4;yi++){
   const yBase=.12+yi*panelH;
   const offset=(yi%2)*.79;
   for(let zi=-1;zi<16;zi++){
    const zBase=-10.35+zi*panelW+offset;
    // Only panels that fit the physical side-wall extent are drawn.
    const z0=Math.max(-10.35,zBase),z1=Math.min(13.35,zBase+panelW-.026);
    if(z1<=z0)continue;
    const shade=panelShades[Math.floor(rnd(yi+19,zi+side*17)*panelShades.length)];
    box(xx-side*.137,yBase+panelH*.5,(z0+z1)*.5,.052,panelH-.030,z1-z0,shade,.025);
   }
  }
  // V53: Four high-mounted surround speakers in total:
  // two at rear wall corners, plus one per side wall nearer the screen.
  // Keep wall light fixtures separate from speaker geometry.
  for(let k=0;k<4;k++){
   const zz=-6.1+k*4.8;
   box(xx-side*.24,8.63,zz,.20,.17,.25,'#666b66',.09,0);
  }
  // One side cabinet only; front face has a grille and two visible drivers.
  // The other two surround cabinets are on the REAR wall below.
  const zz=5.25, sx=xx-side*.48, faceX=xx-side*.91;
  rounded(sx,8.94,zz,.82,1.19,.88,.12,'#171c1e',.19,.10*side);
  box(faceX,8.94,zz,.035,1.01,.73,'#2a3031',.12);
  box(faceX-side*.027,8.94,zz,.015,.93,.67,'#0b1012',.08);
  // Speaker circles lie in the YZ plane, facing into the auditorium.
  function sideDriver(cy,cz,r){
   const x=faceX-side*.039;
   for(let j=0;j<28;j++){
    const a=j*Math.PI*2/28,b=(j+1)*Math.PI*2/28;
    triangle([x,cy,cz],[x,cy+Math.cos(a)*r,cz+Math.sin(a)*r],[x,cy+Math.cos(b)*r,cz+Math.sin(b)*r],'#161e20',.12);
    const ra=r*.74,rb=r*.87;
    quad([x-side*.003,cy+Math.cos(a)*ra,cz+Math.sin(a)*ra],[x-side*.003,cy+Math.cos(b)*ra,cz+Math.sin(b)*ra],[x-side*.003,cy+Math.cos(b)*rb,cz+Math.sin(b)*rb],[x-side*.003,cy+Math.cos(a)*rb,cz+Math.sin(a)*rb],'#555e60',.19);
   }
  }
  sideDriver(9.12,zz,.245);
  sideDriver(8.68,zz,.125);
  // Fine vertical grille ribs, subtle enough to keep the driver shapes readable.
  for(let g=-3;g<=3;g++)box(faceX-side*.048,8.94,zz+g*.082,.009,.89,.009,'#30383a',.08);
 }
 // [V18] Rear wall: actual opening instead of a solid wall hidden by a fake leaf.
 // IMPORTANT: the gallery-side curtain door is on the photo RIGHT (world -X).
 use('rear');
 const rearWallZ=13.15,backLeft=-9.125,backRight=9.125;
 const doorX=-3.96,doorHalf=1.29,doorLow=4.73,doorHigh=8.26;
 const apertureL=doorX-doorHalf,apertureR=doorX+doorHalf;
 const backBottom=.53,backTop=10.23;
 function rearSlab(x0,x1,y0,y1,color='#434843'){
  if(x1>x0&&y1>y0)box((x0+x1)/2,(y0+y1)/2,rearWallZ,x1-x0,y1-y0,.28,color);
 }
 rearSlab(backLeft,apertureL,backBottom,backTop);
 rearSlab(apertureR,backRight,backBottom,backTop);
 rearSlab(apertureL,apertureR,backBottom,doorLow);
 rearSlab(apertureL,apertureR,doorHigh,backTop);
 // Grey acoustic tiles: subdued vertical AND horizontal seams, omitting the exit.
 for(let x=-8.6;x<=8.6;x+=1.46){
  if(x>apertureL-.09&&x<apertureR+.09){
   box(x,(backBottom+doorLow)/2,12.991,.013,doorLow-backBottom,.016,'#343935');
   box(x,(doorHigh+backTop)/2,12.991,.013,backTop-doorHigh,.016,'#343935');
  }else box(x,5.38,12.993,.013,9.52,.016,'#343935');
 }
 for(let y=1.5;y<10.10;y+=1.55){
  if(y>doorLow&&y<doorHigh){
   box((backLeft+apertureL)/2,y,12.990,apertureL-backLeft,.013,.016,'#323834');
   box((apertureR+backRight)/2,y,12.990,backRight-apertureR,.013,.016,'#323834');
  }else box(0,y,12.989,18.16,.013,.016,'#323834');
 }
 // Passage visibly recedes behind wall; no opaque face blocks the opening.
 box(doorX,6.43,13.98,2.44,3.25,.025,'#d3d8cc',.12,.48); // lit corridor back
 box(doorX-.95,6.43,13.44,.23,3.29,.82,'#404943');
 box(doorX+.95,6.43,13.44,.23,3.29,.82,'#404943');
 box(doorX,8.30,13.43,2.52,.09,.87,'#292e2c');
 box(doorX,4.77,13.41,2.52,.09,.82,'#777d72');
 box(doorX,4.80,12.87,2.65,.05,.66,'#919990',.35);
 // V63: Full-width heavy blackout FABRIC curtain (not doors).
 // It hangs in one continuous drape across the opening. Uneven pleats and
 // gently wavy bottom hem make it read as textile, without handles or panels.
 box(doorX-doorHalf,6.49,12.79,.10,3.53,.16,'#303633',.10);
 box(doorX+doorHalf,6.49,12.79,.10,3.53,.16,'#303633',.10);
 box(doorX,8.29,12.80,2.72,.13,.18,'#242827');
 const curtainWidth=doorHalf*2-.08,curtainTop=doorHigh-.045;
 const curtainSegments=36,curtainRows=12;
 // A single pleated cloth sheet with visible folds, not two hinged leaves.
 function curtainPoint(i,j){
   const t=i/curtainSegments, x=doorX+(t-.5)*curtainWidth;
   const v=j/curtainRows;
   const hem=doorLow+.07+.055*Math.sin(t*Math.PI*8+0.4)+.025*Math.sin(t*Math.PI*17);
   const y=curtainTop+(hem-curtainTop)*v;
   const folds=Math.sin(t*Math.PI*14+.35)*.115+Math.sin(t*Math.PI*28)*.025;
   const z=12.58+folds*(.65+.35*v)+.024*Math.sin(v*Math.PI*1.6+t*11)*v;
   return [x,y,z];
 }
 for(let i=0;i<curtainSegments;i++)for(let j=0;j<curtainRows;j++){
   const mid=(i+.5)/curtainSegments;
   const foldLight=Math.sin(mid*Math.PI*14+.35);
   const shade=foldLight>.48?'#303333':foldLight<-.48?'#171a1b':'#232728';
   quad(curtainPoint(i,j),curtainPoint(i+1,j),curtainPoint(i+1,j+1),curtainPoint(i,j+1),shade,.012);
 }
 // Fabric header seam and narrow weighted bottom hem.
 for(let i=0;i<curtainSegments;i++){
   const a=curtainPoint(i,curtainRows),b=curtainPoint(i+1,curtainRows);
   quad(a,b,[b[0],b[1]-.032,b[2]-.006],[a[0],a[1]-.032,a[2]-.006],'#151819',.012);
 }
 // White notice sheets mounted beside the doorway, as in the reference photo.
 // Rear-wall facing surfaces are placed toward the auditorium (negative Z).
 box(-5.78,6.96,12.966,.54,.76,.036,'#b9bcb6',.10);
 box(-5.78,6.96,12.936,.46,.68,.014,'#d7d9d1',.035);
 for(let j=0;j<6;j++)box(-5.78,7.19-j*.085,12.921,.35,.012,.008,'#777d77',.015);
 box(-6.34,6.90,12.966,.42,.54,.036,'#b9bcb6',.10);
 box(-6.34,6.90,12.936,.35,.47,.014,'#d7d9d1',.035);
 for(let j=0;j<4;j++)box(-6.34,7.04-j*.080,12.920,.26,.012,.008,'#777d77',.015);
 // Illuminated emergency pictogram above the curtain entry.
 box(doorX,8.66,12.75,.76,.37,.09,'#2e7751',.12,.55);
 box(doorX,8.665,12.692,.43,.17,.022,'#b6f6ce',.08,.65);
 // Rectangular rear service panel to the photo LEFT of the projector.
 box(4.50,6.85,12.93,1.31,1.35,.08,'#272c2b');
 box(4.50,6.85,12.878,1.19,1.23,.027,'#707870',.14);
 box(4.52,6.87,12.853,1.09,1.13,.015,'#3f4542');
 box(4.03,6.82,12.836,.025,.14,.02,'#c1c7bd');
 // Projection booth: the real photo shows a central high black protruding
 // window housing under the ceiling with two vertical supports below it.
 box(0,8.55,12.24,2.85,1.66,1.45,'#0d1315',.16);
 box(0,8.58,11.480,2.29,1.30,.075,'#485052',.31);
 box(0,8.61,11.414,2.09,1.12,.034,'#0c1519',.45);
 box(0,8.61,11.390,1.77,.89,.020,'#16232c',.48);
 box(0,8.59,11.374,1.63,.57,.012,'#202e31',.58);

 // v57: recognizable projector machinery behind the rear booth glazing.
 // Dark optical hardware only: no beam, flare, or glowing white light.
 box(0,8.58,11.344,1.74,.80,.020,'#172025',.12); // deep booth window
 box(-.23,8.46,11.315,1.13,.48,.13,'#3c4348',.35); // projector main housing
 box(-.23,8.68,11.308,.88,.075,.13,'#535b60',.25); // top cover
 box(-.23,8.24,11.300,.72,.065,.15,'#222a2e'); // mounting sled
 for(let xx of [-.61,-.44,-.27,-.10])box(xx,8.47,11.235,.035,.29,.018,'#171d20'); // vents
 box(.30,8.46,11.215,.40,.38,.12,'#242b31',.25); // lens barrel base
 ringOnFront(.30,8.46,11.130,.132,.185,'#747c82',.43);
 ringOnFront(.30,8.46,11.108,.088,.129,'#343d44',.38);
 circleOnFront(.30,8.46,11.086,.080,'#0a121b',.60);
 circleOnFront(.275,8.485,11.078,.023,'#425669',.20);
 box(-.58,8.27,11.224,.19,.075,.022,'#171c1f'); // status/control panel
 for(let xx of [-.66,-.59,-.52])box(xx,8.27,11.205,.023,.018,.010,'#899197',.10);
 // Visible window framing and lower slanted metal enclosure from the reference.
 box(0,8.08,11.245,2.38,.11,.34,'#555b5c',.22);
 box(0,7.88,11.54,2.12,.29,.70,'#343a3c',.15);
 box(-.95,7.68,11.71,.095,.30,.42,'#22292b');
 box(.95,7.68,11.71,.095,.30,.42,'#22292b');

 box(0,8.09,11.420,2.56,.087,.19,'#090e11');
 box(0,9.36,12.06,3.16,.17,1.87,'#090d0e');
 box(-1.03,8.63,11.35,.045,1.12,.06,'#656c6d',.26);
 box(1.03,8.63,11.35,.045,1.12,.06,'#656c6d',.26);
 for(let xx of [-.86,.86]){
  rod([xx,5.89,12.63],[xx,7.74,12.63],.043,'#272e2d',.33);
  rod([xx,7.72,12.63],[xx*.82,7.95,12.23],.031,'#303737',.35);
 }
 // Small projector-side surveillance camera.
 rod([2.72,9.03,12.82],[2.35,9.03,12.55],.035,'#929992');
 sphere(2.26,8.96,12.52,.17,.16,.17,'#bdc2b7',.50);
 sphere(2.22,8.96,12.35,.083,.075,.018,'#0e1415',.60);
 // Actual photo: two BIG hanging rear speaker cabinets at far upper corners.
 for(const side of [-1,1]){
  const sx=side*7.65;
  box(sx,8.40,12.53,1.27,1.42,.90,'#0c1214',.18);
  box(sx,8.45,12.061,1.10,1.25,.066,'#2f3535',.17);
  circleOnFront(sx,8.69,12.015,.337,'#0a0e10');
  ringOnFront(sx,8.69,11.998,.251,.325,'#4d5455',.25);
  circleOnFront(sx,8.69,11.978,.194,'#1e282b');
  ringOnFront(sx,8.69,11.956,.065,.110,'#555d5c',.30);
  circleOnFront(sx,7.96,12.001,.173,'#070c0d');
  ringOnFront(sx,7.96,11.978,.112,.166,'#525958',.24);
  rod([sx,9.14,12.69],[sx,9.47,12.80],.060,'#181e1e');
  box(sx,7.66,12.18,1.04,.14,.41,'#1a2021');
 }
 // Small warm wall spots beside the rear gallery.
 for(const side of [-1,1]){
  box(side*8.59,9.12,12.77,.19,.095,.15,'#666b66',.10,0);
 }
 // [SCREEN-02 / FOLLOW-UP v4] Fine-tuned against the reference photo.
 // Goal: keep the screen dominant while making the lower vents/speakers sit clearly BELOW it,
 // with a more realistic gap and heavier, darker under-screen equipment.
 use('front');
 box(0,4.84,-10.62,18.55,9.70,.30,'#232827');
 // Screen recess and border: slightly larger and a touch higher, but with the visible image area
 // ending clearly above the equipment band (no visual clipping into the lower fixtures).
 box(0,5.54,-10.380,15.92,8.32,.22,'#05090b');
 box(0,5.54,-10.234,15.64,8.16,.040,'#090e10');
 box(0,5.54,-10.193,15.49,8.07,.040,'#a8a79f',.04,.02);
 box(0,5.54,-10.158,15.38,8.00,.030,'#ece7dc',.04,.08);
 // Under-screen fascia: lowered slightly to open a clearer gap below the projection surface.
 box(0,.64,-10.385,15.10,.96,.18,'#181d1f');
 box(0,1.085,-10.283,15.10,.040,.13,'#0c1113');
 // Horizontal vents: a bit larger and darker, seated lower so they read as wall equipment.
 for(const x of [-4.90,4.90]){
  box(x,.64,-10.238,2.26,.78,.14,'#080c0e');
  box(x,.64,-10.151,2.12,.68,.025,'#2c3232',.11);
  for(let i=0;i<8;i++){
   const yy=.385+i*.073;
   box(x,yy,-10.114,1.98,.032,.032,'#a4a99f',.34);
   box(x,yy-.024,-10.104,1.98,.014,.032,'#060a0b',.08);
  }
  box(x-1.115,.64,-10.101,.040,.78,.042,'#101415');
  box(x+1.115,.64,-10.101,.040,.78,.042,'#101415');
 }
 // Speaker bank: wider and slightly lower, so all 4 drivers sit fully below the screen.
 const speakerXs=[-2.50,-1.58,-.66,.26];
 box(-1.12,.63,-10.237,4.52,.78,.21,'#020506');
 box(-2.11,.63,-10.098,2.22,.72,.050,'#0c1113');
 box(-.13,.63,-10.098,2.22,.72,.050,'#0c1113');
 for(const xx of speakerXs)frontSpeaker(xx,.63,-10.050);
 // One seam dividing the two 2-speaker cabinets, not an extra unit.
 box(-1.12,.63,-10.045,.030,.72,.022,'#2b3030');
 // Single sloped front exit passage: no overlapping floor strips.
 frontExitCorridor();
 // V56: subdued, nearly-black acoustic ceiling, like the reference photographs.
 // Keep the ceiling hidden in overview/orbit and visible from seated positions.
 use('ceiling');
 box(0,9.52,1.46,18.18,.28,24.1,'#171a17');
 // Broad, low-contrast acoustic squares. Thin gaps are dark but not outlined boldly.
 for(let ix=0;ix<21;ix++)for(let iz=0;iz<27;iz++){
  const xx=-8.75+ix*.88,zz=-10.1+iz*.86;
  const tone=(ix*13+iz*7+ix*iz*3)%9;
  const shade=['#1b1e1a','#1c1f1b','#1d201c','#1a1d19','#1b1e1b','#1d1f1b','#1c1e1a','#1b1d19','#1c1f1a'][tone];
  box(xx,9.36,zz,.865,.012,.845,shade);
 }
 // Small recessed, unlit ceiling fixtures; no bright white glowing discs.
 for(const side of [-1,1])for(let zi=0;zi<8;zi++){
  const z=-8.75+zi*3.02;
  disc(side*8.45,9.34,z,.095,.012,'#282a24');
  torus(side*8.45,9.345,z,.11,.012,'#22241f');
 }
 box(0,9.04,11.26,.90,.60,1.16,'#111818');
 box(0,8.98,10.59,.33,.29,.27,'#0a1112');
 // Restore use(core) to prevent content being hidden by orbit-mode ceiling cutting.
 use('core');
}
function chair(x,y,z,id){
 // Full-width armchairs oriented with footrest toward -Z (the screen).
 const leather='#272a2b',dark='#171b1c',high='#373a3b',highlight='#424746';
 // Iron frame/ base / feet beneath cushion.
 box(x,y+.14,z+.10,.67,.28,.95,dark,.24);
 rounded(x,y+.49,z-.04,.79,.29,.84,.12,leather,.62);
 rounded(x,y+.63,z+.22,.67,.14,.56,.065,'#323637',.55);
 // Backrest: thick inclined upholstered slab, distinct head cushion and center plump patch.
 rounded(x,y+1.05,z+.49,.76,1.17,.34,.15,'#242829',.58,.12);
 rounded(x,y+1.10,z+.295,.62,.81,.12,.057,'#313637',.62,.12);
 rounded(x,y+1.61,z+.57,.78,.41,.39,.16,'#3b3f40',.64,.12);
 rounded(x,y+1.57,z+.335,.59,.11,.11,.045,'#454a49',.58,.12);
 // Side bolster arcs give seat a heavy padded-recliner silhouette.
 rounded(x-.36,y+1.02,z+.365,.20,.74,.31,.09,'#212627',.54,.12);
 rounded(x+.36,y+1.02,z+.365,.20,.74,.31,.09,'#212627',.54,.12);
 // Large, chunky armrests with raised consoles and recessed cupholders.
 for(let side of [-1,1]){
  const ax=x+side*.44;
  rounded(ax,y+.59,z-.055,.22,.31,.96,.085,'#1a1f20',.45);
  rounded(ax,y+.77,z-.12,.22,.15,.82,.075,'#2e3334',.67);
  disc(ax,y+.853,z-.31,.109,.012,'#060b0d',.06);
  torus(ax,y+.866,z-.31,.11,.020,'#737975',.8);
  // cuphole inner shadow ring
  torus(ax,y+.865,z-.31,.071,.012,'#252b2b',.5);
 }
 // Motorized recliner leg-rest protrudes in screen direction, with support linkage.
 box(x,y+.18,z-.46,.51,.14,.57,'#171b1b');
 rounded(x,y+.31,z-.61,.65,.24,.52,.095,'#2d3132',.52);
 rounded(x,y+.23,z-.90,.69,.18,.36,.08,'#373b3c',.58);
 box(x,y+.06,z+.52,.49,.12,.09,'#111719');
 // Fine upholstery panel / stitch seams, not flat cube chairs.
 rod([x-.23,y+.72,z-.34],[x+.23,y+.72,z-.34],.008,'#434847',.28);
 rod([x-.245,y+1.37,z+.34],[x+.245,y+1.37,z+.34],.008,'#444849',.25);
 // side-visible seat number plate, on stair-side corners
 box(x-.28,y+.07,z-.32,.20,.014,.09,'#323938');
}
function wheelBay(x,y,z,id){
 // Accessible bay: blank floor가 아니라 휠체어 공간임이 분명하게 보이도록 표시.
 box(x,y+.018,z,1.10,.034,1.48,'#565d56');
 const halfX=.55,halfZ=.72;
 for(const side of [-1,1]){
  rod([x+side*halfX,y+.043,z-halfZ],[x+side*halfX,y+.043,z+halfZ],.017,'#d6dcd2',.08,6);
 }
 for(const side of [-1,1]){
  rod([x-halfX,y+.043,z+side*halfZ],[x+halfX,y+.043,z+side*halfZ],.017,'#d6dcd2',.08,6);
 }
 // simple wheelchair icon + small companion folding seat marker so it doesn't look like a missing mesh
 disc(x-.15,y+.055,z+.05,.07,.02,'#dfe9e1');
 rod([x-.15,y+.06,z+.05],[x-.15,y+.17,z+.05],.012,'#dfe9e1');
 rod([x-.15,y+.14,z+.05],[x-.03,y+.11,z+.05],.012,'#dfe9e1');
 rod([x-.03,y+.11,z+.05],[x+.06,y+.06,z+.05],.012,'#dfe9e1');
 disc(x+.08,y+.055,z-.06,.04,.02,'#dfe9e1');
 box(x+.22,y+.11,z-.25,.18,.18,.24,'#4a4f4d',.18);
}
function allSeats(){
 use('core');
 // A/B/C: 10 individually spaced upholstered recliners on each of three tiers.
 for(let ri=0;ri<3;ri++)for(let n=1;n<=10;n++){
  const id=rows[ri]+n;
  // Put the RECLINER near the rear of its tier; the full, level floor
  // between the footrest and the FRONT partition is the passage for people.
  const x=(n-5.5)*seatPitch,y=rowYs[ri],z=rowZs[ri]+ROW_SEAT_BACK_OFFSET;
  seats[id]={x,y,z,wheel:false}; // includes camera, selection and hit testing
  chair(x,y,z,id);
 }
 // [V37] D9/D10 remain on the lower forward tier beside the OPEN side
 // access stair; D1/D2 remain at their original upper opposite location.
 // Seat IDs, pair order and both 2-chair groups remain exactly intact.
 const D9_D10_FORWARD_ADJUSTMENT=(rowZs[3]+REAR_GALLERY_SEAT_BACK_OFFSET)-(D_LOWER_SEAT_Z+0.45); // V70: move D9/D10 0.45 toward rear guardrail (+Z) // v36: Z=9.20, screenward relative to D1/D2
 const dSlots=[
  // [V51] Move both upper-gallery chairs 0.55 toward the screen (-Z)
  // so their entire recliner footprint fits within the existing grey bay outline.
  {id:'D1',x:-4.58,wheel:true,zOffset:-0.55,lower:false},
  {id:'D2',x:-3.18,wheel:true,zOffset:-0.55,lower:false},
  {id:'D9',x:4.12,wheel:false,zOffset:-D9_D10_FORWARD_ADJUSTMENT,lower:true},
  {id:'D10',x:5.46,wheel:false,zOffset:-D9_D10_FORWARD_ADJUSTMENT,lower:true}
 ];
 for(const q of dSlots){
  const y=rowYs[3]-(q.lower?D9_D10_LOWER_STEP:0);
  const z=rowZs[3]+REAR_GALLERY_SEAT_BACK_OFFSET+q.zOffset;
  seats[q.id]={x:q.x,y,z,wheel:q.wheel,chair:true};
  chair(q.x,y,z,q.id);
 }
}
function highlights(id){raw.highlight=[];use('highlight');const s=seats[id];if(!s)return;
 const y=s.y+.035,z=s.z;
 for(let i=0;i<33;i++){const a=i*2*Math.PI/33,b=(i+1)*2*Math.PI/33;
  const p=[s.x+Math.cos(a)*.59,y,z+Math.sin(a)*.61],q=[s.x+Math.cos(b)*.59,y,z+Math.sin(b)*.61];
  rod(p,q,.026,'#55efc8',.05,4);
 }
}
room();allSeats();
let currentId='C5';highlights(currentId);
const buffers={};function upload(name){const verts=raw[name];const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(verts),gl.STATIC_DRAW);buffers[name]={buffer,count:verts.length/11};}
for(const k of batchNames)upload(k);
function refreshHighlight(){gl.deleteBuffer(buffers.highlight.buffer);highlights(currentId);upload('highlight');}
function drawBatch(name){const a=buffers[name];if(!a||!a.count)return;gl.bindBuffer(gl.ARRAY_BUFFER,a.buffer);
 const stride=44;gl.vertexAttribPointer(attrib.p,3,gl.FLOAT,false,stride,0);gl.vertexAttribPointer(attrib.n,3,gl.FLOAT,false,stride,12);gl.vertexAttribPointer(attrib.c,3,gl.FLOAT,false,stride,24);gl.vertexAttribPointer(attrib.s,1,gl.FLOAT,false,stride,36);gl.vertexAttribPointer(attrib.g,1,gl.FLOAT,false,stride,40);
 gl.drawArrays(gl.TRIANGLES,0,a.count);
}
for(const name of Object.values(attrib))gl.enableVertexAttribArray(name);

// ---------- Full-orbit and 360° first-person camera ----------
let w=800,h=620,dpr=1;let mode='seat'; // V44: enter at C5 seated POV
let orbit={yaw:2.99,pitch:.18,dist:23.6,focus:[0,3.10,1.05]};
let look={yaw:0,pitch:0,fov:76};
let camera={eye:[0,8,16],forward:[0,-.2,-1],right:[1,0,0],up:[0,1,0],fov:60};
function matPerspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0])}
function matLook(eye,forward){const right=norm(cross(forward,[0,1,0])),up=norm(cross(right,forward));return new Float32Array([
 right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,
 -dot(right,eye),-dot(up,eye),dot(forward,eye),1]);}
function cameraUpdate(){
 if(mode==='orbit'){
  const cp=Math.cos(orbit.pitch);const focus=orbit.focus;
  // V64: keep the orbit camera above the auditorium floor so the underside of the front fascia and tier slabs cannot fill the screen.
  orbit.pitch=clamp(orbit.pitch,.12,1.51);
  const eye=[focus[0]+orbit.dist*cp*Math.sin(orbit.yaw),Math.max(3.35,focus[1]+orbit.dist*Math.sin(orbit.pitch)),focus[2]+orbit.dist*cp*Math.cos(orbit.yaw)];
  const forward=norm(sub(focus,eye));const right=norm(cross(forward,[0,1,0]));const up=norm(cross(right,forward));
  camera={eye,forward,right,up,fov:56};
 }else{
  const s=seats[currentId],eye=[s.x,s.y+(s.chair?1.39:(s.wheel?1.22:1.39)),s.z-.12];
  const forward=norm([Math.sin(look.yaw)*Math.cos(look.pitch),Math.sin(look.pitch),-Math.cos(look.yaw)*Math.cos(look.pitch)]);
  const right=norm(cross(forward,[0,1,0]));const up=norm(cross(right,forward));
  camera={eye,forward,right,up,fov:look.fov};
 }
}
function visible(name){
 if(mode==='seat')return true;
 if(name==='ceiling')return false;
 // V43: keep both side walls visible at every orbit camera position.
 // Previously the camera X position hid one entire wall batch abruptly.
 if(name==='left'||name==='right')return true;
 // V58: rear entrance/entryway must not disappear while rotating 360 degrees.
 // Keep rear geometry rendered at all orbit angles; depth testing handles occlusion.
 if(name==='rear')return true;
 // V44: do not remove the screen/front wall when orbiting toward the audience.
 if(name==='front')return true;
 return true;
}
function projected(pt){const v=sub(pt,camera.eye),z=dot(v,camera.forward);if(z<=.10)return null;const factor=1/Math.tan(camera.fov*Math.PI/360);return {x:w/2+dot(v,camera.right)/z*factor*h/2,y:h/2-dot(v,camera.up)/z*factor*h/2,z};}
function render(){
 const rect=stage.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const nw=Math.floor(rect.width),nh=Math.floor(rect.height),nd=Math.min(devicePixelRatio||1,1.65);
 if(nw!==w||nh!==h||nd!==dpr){w=nw;h=nh;dpr=nd;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);gl.viewport(0,0,canvas.width,canvas.height)}
 cameraUpdate();
 gl.clearColor(.065,.082,.083,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 gl.uniformMatrix4fv(uni.proj,false,matPerspective(camera.fov*Math.PI/180,w/h,.055,150));
 gl.uniformMatrix4fv(uni.view,false,matLook(camera.eye,camera.forward));
 gl.uniform3fv(uni.eye,new Float32Array(camera.eye));
 // Render room, then lit selection halo with depth testing, no 2D polygon glitches.
 for(const name of ['core','rear','left','right','front','ceiling','highlight'])if(visible(name))drawBatch(name);
}
let pending=0;function schedule(){if(pending)return;pending=requestAnimationFrame(()=>{pending=0;render()})}
function syncUI(){
 select.value=currentId;seatDesc.innerHTML='선택 좌석 <b>'+DATA.label(currentId)+'</b>'+(isWheel(currentId)?' · 휠체어 공간':' · 스크린 정면');
 document.querySelectorAll('.seat-token').forEach(btn=>{const chosen=btn.dataset.id===currentId;btn.classList.toggle('active',chosen);btn.setAttribute('aria-pressed',chosen?'true':'false')});
 btnCenter.style.display=mode==='seat'?'':'none';
 modeLabel.textContent=mode==='seat'?DATA.label(currentId)+' · 1인칭':'전체 관찰';
 caption.textContent=mode==='seat'?'현재 '+DATA.label(currentId)+' · 주위를 360° 둘러보세요':'상영관 전체 · 360° 자유 회전';
 btnOverview.classList.toggle('active',mode==='orbit');
 btnFront.classList.toggle('active',mode==='seat'&&Math.abs(look.yaw)<.005&&Math.abs(look.pitch)<.005);
 controlHint.innerHTML=mode==='seat'?'드래그: 고개를 돌려 360° 둘러보기<br>고개 정면: 스크린 다시 보기<br>전체 보기: 상영관으로 돌아가기':'드래그: 상영관 360° 회전<br>휠·두 손가락: 확대/축소<br>의자 클릭: 바로 앉아보기';
 lowerNote.innerHTML='좌석 직접 클릭 → 바로 앉기 · 번호 선택 → 버튼으로 앉기.'+(DATA.photo[currentId]?' <button class="photo-link" id="open-photo">이 좌석 실사 사진 보기 ↗</button>':'')+' D1·D2는 실제 배치도의 휠체어 공간입니다.';
 const photo=document.getElementById('open-photo');if(photo)photo.addEventListener('click',()=>openPhoto(currentId));
}
function chooseSeat(id,enter=false){if(!seats[id])return;currentId=id;refreshHighlight();if(enter){mode='seat';look={yaw:0,pitch:0,fov:76}}syncUI();schedule()}
function sitSeat(){chooseSeat(select.value,true)}
function overview(top=false){mode='orbit';orbit={yaw:Math.PI,pitch:top?1.38:.60,dist:top?22:27,focus:[0,3.10,1.05]};syncUI();schedule()}
function front(){if(mode==='seat'){look.yaw=0;look.pitch=0}else{mode='orbit';orbit={yaw:0,pitch:.20,dist:23.3,focus:[0,3.5,-.4]}}syncUI();schedule()}
select.innerHTML=DATA.seatIds.map(id=>`<option value="${id}">${DATA.label(id)}${isWheel(id)?' (휠체어)':''}</option>`).join('');
for(const r of rows){const row=document.createElement('div');row.className='seatmap-row';const header=document.createElement('span');header.className='rowname';header.textContent=r;row.append(header);
 for(let n=1;n<=10;n++){const id=r+n,b=document.createElement('button');b.type='button';b.className='seat-token'+(DATA.seatIds.includes(id)?(isWheel(id)?' access':''):' empty');b.textContent=DATA.seatIds.includes(id)?n:'';
  if(DATA.seatIds.includes(id)){b.dataset.id=id;b.title=DATA.label(id)+(isWheel(id)?' 휠체어 공간':'');b.setAttribute('aria-label',DATA.label(id));b.addEventListener('click',()=>chooseSeat(id,true));}else{b.disabled=true;b.tabIndex=-1;}
  row.append(b);
 }map.append(row)
}
select.addEventListener('change',()=>chooseSeat(select.value,false));sit.addEventListener('click',sitSeat);
btnOverview.addEventListener('click',()=>overview(false));btnTop.addEventListener('click',()=>overview(true));btnFront.addEventListener('click',front);btnCenter.addEventListener('click',()=>{look.yaw=0;look.pitch=0;syncUI();schedule()});

// ---------- Seat hit testing in 3D and pointer camera controls ----------
let pointers=new Map(),initial=null,zoomStart=null,hoverId=null;
function seatAt(x,y){if(mode!=='orbit')return null;
 let found=null,best=Infinity;
 for(const id of DATA.seatIds){const s=seats[id];const pts=s.wheel&&!s.chair?[[s.x,s.y+.12,s.z],[s.x,s.y+.15,s.z-.32]]:[[s.x,s.y+1.15,s.z+.30],[s.x,s.y+.55,s.z-.22]];
  for(const p of pts){const pp=projected(p);if(!pp)continue;
   const dist=Math.hypot(x-pp.x,y-pp.y),radius=clamp(42*17/Math.max(pp.z,1),22,73);
   if(dist<radius&&dist<best){best=dist;found=id;}
  }
 }
 return found;
}
function updateTooltip(x,y){if(mode!=='orbit'||pointers.size){tooltip.style.display='none';return}
 const id=seatAt(x,y);hoverId=id;if(!id){tooltip.style.display='none';canvas.style.cursor='grab';return}
 tooltip.style.display='block';tooltip.textContent=DATA.label(id)+(isWheel(id)?' · 휠체어 공간':' · 클릭해서 앉기');tooltip.style.left=x+'px';tooltip.style.top=y+'px';canvas.style.cursor='pointer';
}
const point=e=>{let box=canvas.getBoundingClientRect();return{x:e.clientX-box.left,y:e.clientY-box.top}};
canvas.addEventListener('pointerdown',e=>{
 const p=point(e);pointers.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);tooltip.style.display='none';
 if(pointers.size===1)initial={x:p.x,y:p.y,yaw:mode==='orbit'?orbit.yaw:look.yaw,pitch:mode==='orbit'?orbit.pitch:look.pitch,dragged:false};
 else if(pointers.size===2){let a=Array.from(pointers.values());zoomStart={dist:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),value:mode==='orbit'?orbit.dist:look.fov};initial=null}
});
canvas.addEventListener('pointermove',e=>{
 const p=point(e),old=pointers.get(e.pointerId);
 if(!old){updateTooltip(p.x,p.y);return}
 pointers.set(e.pointerId,p);
 if(pointers.size===2&&zoomStart){const a=Array.from(pointers.values()),len=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  if(mode==='orbit')orbit.dist=clamp(zoomStart.value*zoomStart.dist/Math.max(len,10),9,37);
  else look.fov=clamp(zoomStart.value*zoomStart.dist/Math.max(len,10),44,95);
  schedule();return;
 }
 if(!initial)return;const dx=p.x-initial.x,dy=p.y-initial.y;if(Math.hypot(dx,dy)>5)initial.dragged=true;
 if(initial.dragged){
  if(mode==='orbit'){orbit.yaw=initial.yaw-dx*.006;orbit.pitch=clamp(initial.pitch+dy*.0045,.12,1.51)}
  else{look.yaw=initial.yaw-dx*.006;look.pitch=clamp(initial.pitch-dy*.0045,-1.43,1.43)}
  schedule();
 }
});
canvas.addEventListener('pointerup',e=>{const p=point(e),tap=initial&&!initial.dragged&&pointers.size===1;
 pointers.delete(e.pointerId);if(pointers.size<2)zoomStart=null;
 if(tap){const picked=seatAt(p.x,p.y);if(picked)chooseSeat(picked,true)}
 initial=null;
});
canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);initial=null;zoomStart=null});
canvas.addEventListener('pointerleave',()=>{if(!pointers.size)tooltip.style.display='none'});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(mode==='orbit')orbit.dist=clamp(orbit.dist+e.deltaY*.013,9,37);else look.fov=clamp(look.fov+e.deltaY*.04,44,95);schedule()},{passive:false});
canvas.addEventListener('keydown',e=>{let handled=true;const k=e.key;
 if(k==='ArrowLeft')mode==='orbit'?orbit.yaw+=.12:look.yaw+=.12;
 else if(k==='ArrowRight')mode==='orbit'?orbit.yaw-=.12:look.yaw-=.12;
 else if(k==='ArrowUp')mode==='orbit'?orbit.pitch=clamp(orbit.pitch+.08,.12,1.51):look.pitch=clamp(look.pitch+.08,-1.43,1.43);
 else if(k==='ArrowDown')mode==='orbit'?orbit.pitch=clamp(orbit.pitch-.08,.12,1.51):look.pitch=clamp(look.pitch-.08,-1.43,1.43);
 else if(k==='Escape'){overview(false)}else handled=false;
 if(handled){e.preventDefault();schedule()}
});
let modal=document.getElementById('photo-pop');
function openPhoto(id){if(!DATA.photo[id])return;const img=document.getElementById('photo-img');img.src=DATA.photo[id];img.alt=DATA.label(id)+' 실제 촬영 사진';modal.classList.add('open')}
document.getElementById('photo-close').addEventListener('click',()=>modal.classList.remove('open'));
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')modal.classList.remove('open')});

function toggleFullscreen(){
 const el=stage;
 if(document.fullscreenElement===el || document.webkitFullscreenElement===el){
  if(document.exitFullscreen) document.exitFullscreen();
  else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  return;
 }
 if(el.requestFullscreen) el.requestFullscreen();
 else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}
function syncFullscreenBtn(){
 const active=(document.fullscreenElement===stage || document.webkitFullscreenElement===stage);
 if(btnFs) btnFs.textContent=active?'전체화면 종료':'전체화면';
}
if(btnFs) btnFs.addEventListener('click',()=>{toggleFullscreen();setTimeout(()=>{syncFullscreenBtn();schedule()},120)});
document.addEventListener('fullscreenchange',()=>{syncFullscreenBtn();schedule()});
document.addEventListener('webkitfullscreenchange',()=>{syncFullscreenBtn();schedule()});

if(window.ResizeObserver)new ResizeObserver(schedule).observe(stage);else window.addEventListener('resize',schedule);
window.addEventListener('resize',schedule);syncFullscreenBtn();syncUI();schedule();
})();
