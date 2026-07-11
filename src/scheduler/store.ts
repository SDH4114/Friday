import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureRayaHome, RAYA_SCHEDULE_PATH } from "../config/paths.js";
export type ScheduledTask={id:string;message:string;nextRun:string;repeat:"none"|"daily";enabled:boolean};
export function listScheduled():ScheduledTask[]{ ensureRayaHome(); return existsSync(RAYA_SCHEDULE_PATH)?JSON.parse(readFileSync(RAYA_SCHEDULE_PATH,"utf8")):[]; }
function save(tasks:ScheduledTask[]){writeFileSync(RAYA_SCHEDULE_PATH,`${JSON.stringify(tasks,null,2)}\n`,{mode:0o600});}
export function createScheduled(message:string,nextRun:string,repeat:"none"|"daily"){const task={id:randomUUID().slice(0,8),message,nextRun:new Date(nextRun).toISOString(),repeat,enabled:true} satisfies ScheduledTask;const tasks=listScheduled();tasks.push(task);save(tasks);return task;}
export function cancelScheduled(id:string){const tasks=listScheduled();const task=tasks.find(t=>t.id===id);if(!task)throw new Error("Scheduled task not found");task.enabled=false;save(tasks);}
export function startScheduler(onDue:(task:ScheduledTask)=>void):()=>void{const tick=()=>{const tasks=listScheduled();let changed=false;for(const task of tasks){if(task.enabled&&Date.parse(task.nextRun)<=Date.now()){onDue(task);changed=true;if(task.repeat==="daily")task.nextRun=new Date(Date.parse(task.nextRun)+86400000).toISOString();else task.enabled=false;}}if(changed)save(tasks);};tick();const timer=setInterval(tick,30000);return()=>clearInterval(timer);}
