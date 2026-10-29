export const MODES=Object.freeze([
  {id:'ct',group:'Mapa original',title:'Guia CT e gabaritos',href:'./ct.html?v=20261029-final',tag:'Guia ao vivo',description:'Saia do CT, assista aos percursos e ajuste a cfg antes de jogar.',art:'map'},
  {id:'ski2',group:'Mapa original',title:'surf_ski_2 livre',href:'./ski2.html?v=20261029-hub',tag:'Exploração e prática',description:'Explore o mapa original, suas rampas, escadas e teleportes.',art:'map'},
  {id:'fundamentos',group:'Percursos de surf',title:'Fundamentos',href:'./index.html?fase=fundamentos',tag:'01 · Comece aqui',description:'Seis rampas para aprender A/D, mouse e transferências.',art:'ramps'},
  {id:'abismo',group:'Percursos de surf',title:'Abismo',href:'./index.html?fase=abismo',tag:'02 · Avançado',description:'Transferências maiores, saídas altas e controle do voo.',art:'gap'},
  {id:'voo',group:'Percursos de surf',title:'Voo livre',href:'./index.html?fase=voo',tag:'03 · Longo alcance',description:'Desça, ganhe embalo e passe vários segundos no ar.',art:'flight'},
  {id:'lateral',group:'Percursos de surf',title:'Arcos laterais',href:'./index.html?fase=lateral&destino=wide',tag:'04 · Deslocamento lateral',description:'Curvas amplas para alcançar alvos distantes dos dois lados.',art:'arc'},
  {id:'jumps',group:'Laboratórios',title:'Laboratório do pulo',href:'./jumps.html?v=20261029-hub',tag:'Estudo de física',description:'Compare agachamento, velocidade, strafe e alcance.',art:'jump'},
]);
const current=document.querySelector('[data-mode-nav]')?.dataset.modeNav||new URLSearchParams(location.search).get('fase')||'home';
document.body.dataset.mode=current;
for(const host of document.querySelectorAll('[data-mode-nav]')){
  const details=document.createElement('details');details.className='mode-menu';
  const summary=document.createElement('summary');summary.textContent='☰ Fases e laboratórios';details.append(summary);
  const nav=document.createElement('nav');nav.setAttribute('aria-label','Fases e laboratórios');
  const home=document.createElement('a');home.href='./home.html';home.textContent='Ver todas as fases ↗';home.className='mode-home';nav.append(home);
  for(const group of ['Mapa original','Percursos de surf','Laboratórios']){
    const label=document.createElement('strong');label.textContent=group;nav.append(label);
    for(const mode of MODES.filter(m=>m.group===group)){const a=document.createElement('a');a.href=mode.href;a.textContent=mode.title;a.dataset.mode=mode.id;if(mode.id===current)a.setAttribute('aria-current','page');nav.append(a);}
  }
  details.append(nav);host.append(details);
}
document.addEventListener('pointerlockchange',()=>document.body.classList.toggle('mouse-captured',Boolean(document.pointerLockElement)));
document.addEventListener('click',event=>{for(const d of document.querySelectorAll('.mode-menu[open]'))if(!d.contains(event.target))d.open=false;});
