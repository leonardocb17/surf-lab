const format=(value,digits=0)=>Number.isFinite(value)?value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';
export function velocityMetrics(state,gravity=800,{freeFly=false,onRamp=false}={}){
  const {vx=0,vy=0,vz=0,yaw=0}=state,c=Math.cos(yaw),s=Math.sin(yaw);
  const ramp=onRamp||Boolean(state.contact&&(typeof state.contact==='number'||state.contact.z<.7));
  const medium=freeFly?'exploração':state.onLadder?'escada':state.inWater||state.waterJumpTime>0?'água':state.grounded?'chão':ramp?'rampa':'voo';
  const ballistic=(medium==='voo'||medium==='rampa')&&gravity>0&&Number.isFinite(gravity);
  const up=Math.max(0,vz);
  return {horizontal:Math.hypot(vx,vy),vertical:vz,total:Math.hypot(vx,vy,vz),forward:vx*c+vy*s,side:-vx*s+vy*c,medium,rise:ballistic?up*up/(2*gravity):null,apexTime:ballistic?up/gravity:null};
}
export function createVelocityHUD(host,{prefix=''}={}){
  host.classList.add('velocity-hud');
  const id=name=>prefix+name;
  host.innerHTML=`<div class="velocity-main"><div class="velocity-metric"><span class="velocity-label">HORIZONTAL <small>u/s</small></span><strong id="${id('speed')}">0</strong></div><div class="velocity-metric"><span class="velocity-label">VERTICAL <small>u/s</small></span><strong id="${id('vertical')}">0</strong></div></div><div class="velocity-total"><span>RESULTANTE TOTAL</span><b id="${id('total')}">0 u/s</b></div><div class="velocity-axes"><span>Frente <b id="${id('forward-speed')}">0</b></span><span>Lado <b id="${id('side-speed')}">0</b></span><small>u/s · em relação à mira</small></div><div class="velocity-apex"><span id="${id('apex-label')}">SUBIDA LIVRE RESTANTE</span><b id="${id('apex-rise')}">—</b><small id="${id('apex-time')}">Sem novos contatos · gravidade atual</small></div>`;
  const fields=Object.fromEntries(['speed','vertical','total','forward-speed','side-speed','apex-label','apex-rise','apex-time'].map(name=>[name,host.querySelector('#'+id(name))]));
  const set=(name,value)=>{if(fields[name].textContent!==value)fields[name].textContent=value;};
  return (state,gravity,options={})=>{
    const m=velocityMetrics(state,gravity,options),arrow=m.vertical>.01?'↑ ':m.vertical<-.01?'↓ ':'';
    set('speed',format(m.horizontal));set('vertical',arrow+format(Math.abs(m.vertical)));set('total',format(m.total)+' u/s');
    set('forward-speed',(m.forward<-.5?'−':m.forward>.5?'+':'')+format(Math.abs(m.forward)));
    set('side-speed',(m.side<-.5?'← ':m.side>.5?'→ ':'')+format(Math.abs(m.side)));
    set('apex-label',m.medium==='rampa'?'SUBIDA LIVRE SE SAIR AGORA':'SUBIDA LIVRE RESTANTE');
    set('apex-rise',m.rise===null?'—':format(m.rise,1)+' u');
    set('apex-time',m.rise===null?({chão:'No chão · falta o impulso da saída',escada:'Na escada · depende do contato',água:'Na água · previsão livre indisponível',exploração:'Exploração · voo sem física'}[m.medium]):m.vertical>0?`Ápice em ${format(m.apexTime,2)} s · sem novos contatos`:'Já está no ápice ou descendo');
    host.dataset.medium=m.medium;host.dataset.vertical=m.vertical>.01?'up':m.vertical<-.01?'down':'level';
  };
}
