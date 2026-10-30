import {CT_CONFIG} from './ct-physics.mjs?v=20261030-guide';
export const CFG_FIELDS=Object.freeze([
  {key:'gravity',label:'Gravidade',cvar:'sv_gravity',min:100,max:1600,step:50},
  {key:'airAcceleration',label:'Aceleração aérea',cvar:'sv_airaccelerate',min:0,max:1000,step:10},
  {key:'groundAcceleration',label:'Aceleração no chão',cvar:'sv_accelerate',min:0,max:100,step:1},
  {key:'friction',label:'Atrito no chão',cvar:'sv_friction',min:0,max:20,step:.5},
  {key:'stopSpeed',label:'Velocidade de frenagem',cvar:'sv_stopspeed',min:0,max:500,step:25},
  {key:'maxSpeed',label:'Velocidade do comando',cvar:'sv_maxspeed',min:100,max:600,step:25},
  {key:'maxVelocity',label:'Limite por eixo',cvar:'sv_maxvelocity',min:500,max:6000,step:100},
]);
export const CFG_PRESETS=Object.freeze({
  surf:{...CT_CONFIG},
  reference:{...CT_CONFIG,airAcceleration:10,groundAcceleration:10,stopSpeed:100,stamina:true,bunnyCap:true},
  light:{...CT_CONFIG,gravity:400},
});
export function normalizeConfig(input={}){
  const config={...CT_CONFIG};
  for(const field of CFG_FIELDS){const value=Number(input[field.key]??config[field.key]);if(!Number.isFinite(value)||value<field.min||value>field.max)throw new RangeError(`${field.cvar}: use ${field.min} a ${field.max}.`);config[field.key]=value;}
  for(const key of ['stamina','bunnyCap'])config[key]=Boolean(input[key]??CT_CONFIG[key]);
  return Object.freeze(config);
}
export const configKey=config=>JSON.stringify(CFG_FIELDS.map(f=>config[f.key]).concat([config.stamina,config.bunnyCap]));
