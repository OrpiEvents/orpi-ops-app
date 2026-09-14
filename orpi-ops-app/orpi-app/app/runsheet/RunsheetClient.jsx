'use client';
import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseBrowser";
import DRINKS_DATA from "./drinks-data.json";

// Run sheet — Setup, Brief, Loading out, Coming back.
//
// Changed from the prototype in three places, all marked below:
//   • the drinks library is imported rather than pasted in, so Notion stays
//     the only source of truth
//   • storage writes to the device first and Supabase second, so the tool
//     keeps working in a venue car park with no signal
//   • it renders inside AppShell like every other page

const LIB = DRINKS_DATA.drinks;
const INV = DRINKS_DATA.inventory;

// ── Storage ──────────────────────────────────────────────────
// Offline first. The device copy is written every time and never fails; the
// shared copy is attempted after, so Snehal in the van and you at home see the
// same run sheet when there's signal. Last write wins if two people edit the
// same event at once — rare in practice, but worth knowing.
const LOCAL_KEY = "orpi-runsheet-events";
const SHARED_KEY = "runsheet-events";

async function loadEvents() {
  let local = null;
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) local = JSON.parse(raw);
  } catch (e) { /* private browsing, quota, corrupt JSON — fall through */ }

  try {
    const { data } = await createClient()
      .from("app_state").select("value").eq("key", SHARED_KEY).maybeSingle();
    if (data?.value?.length) return { events: data.value, synced: true };
  } catch (e) { /* offline — the device copy is the answer */ }

  return { events: local, synced: false };
}

async function saveEvents(events) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(events)); } catch (e) {}
  try {
    const { error } = await createClient().from("app_state").upsert({
      key: SHARED_KEY, value: events, updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
    return !error;
  } catch (e) { return false; }
}

const GOLD="#B48A3C",INK="#101010",LINE="#E6E2DA";
const BY={}; INV.forEach(i=>BY[i.n]=i);
const CATS=[...new Set(INV.map(i=>i.cat))].sort();
const SEC=["Cocktail spirits","Back bar","Chilled — critical","Mixers & juices"];
const GSEC="Garnish & consumables";
const TYPES=["Welcome Cocktail","Welcome Mocktail","Cocktail","Mocktail","Shooter"];
const blank=()=>({id:String(Date.now()),ev:{client:"",date:"",venue:"",service:"5pm to 12am",arrival:"12pm",guests:"",uniform:"Black trousers, black shirts and aprons (provided)"},
 staff:[{id:1,name:"",role:"",transport:"Car"}],sel:{},ovr:{},prod:{},rm:{},add:{},extra:[],out:{},back:{},gCost:{}});

export default function Runsheet(){
 const [events,setEvents]=useState(null),[cur,setCur]=useState(null),[ready,setReady]=useState(false);
 const [tab,setTab]=useState("setup"),[saved,setSaved]=useState("");
 const [online,setOnline]=useState(true);
 const [open,setOpen]=useState({det:true,staff:false,drinks:true,bar:false});
 const [picker,setPicker]=useState(false),[q,setQ]=useState(""),[ft,setFt]=useState("All");
 const [expand,setExpand]=useState({});

 useEffect(()=>{(async()=>{
   const {events:e,synced}=await loadEvents();
   const list=(e&&e.length)?e:[blank()];
   setEvents(list);setCur(list[0].id);setOnline(synced);setReady(true);
  })();},[]);
 useEffect(()=>{if(!ready||!events)return;const t=setTimeout(async()=>{
   const ok=await saveEvents(events);setOnline(ok);
   setSaved(new Date().toLocaleTimeString().slice(0,5));},600);
  return()=>clearTimeout(t);},[events,ready]);

 if(!ready)return(<div className="min-h-screen flex items-center justify-center text-neutral-400">Loading…</div>);
 const E=events.find(x=>x.id===cur)||events[0];
 const up=(k,v)=>setEvents(es=>es.map(x=>x.id===E.id?{...x,[k]:typeof v==="function"?v(x[k]):v}:x));
 const {ev,staff,sel,ovr,prod,rm,add,extra,out,back,gCost}=E;

 const picked=LIB.filter(d=>sel[d.name]);
 const qOf=(d,i)=>ovr[d.name]?.[i]??d.ing[i].q;
 const pOf=(d,i)=>prod[d.name]?.[i]??(d.ing[i].s||"");
 const edQ=(d,i)=>ovr[d.name]?.[i]!==undefined&&ovr[d.name][i]!==d.ing[i].q;
 const edP=(d,i)=>prod[d.name]?.[i]!==undefined&&prod[d.name][i]!==(d.ing[i].s||"");
 const lineCost=(d,i)=>{const it=BY[pOf(d,i)];return it?qOf(d,i)*it.cpm:(d.ing[i].q?d.ing[i].c/d.ing[i].q*qOf(d,i):d.ing[i].c);};
 const secOf=n=>{const it=BY[n],c=it?it.cat:"Other";
  if(/espresso|cream|milk/i.test(n))return "Chilled — critical";
  if(c==="Garnish")return GSEC;
  if(["Spirit","Liqueur","Wine","Prosecco","Champagne","Beer"].includes(c))return "Cocktail spirits";
  return "Mixers & juices";};
 const rws=d=>{const r=d.ing.map((ing,i)=>rm[d.name]?.[i]?null:({k:"b",i,u:ing.u,sec:ing.sec})).filter(Boolean);
  (add[d.name]||[]).forEach((a,j)=>r.push({k:"a",i:j,u:a.u,sec:a.s?secOf(a.s):"Mixers & juices"}));return r;};
 const aQ=(d,j)=>add[d.name][j].q,aP=(d,j)=>add[d.name][j].s;
 const aCost=(d,j)=>{const it=BY[aP(d,j)];return it?aQ(d,j)*it.cpm:0;};
 const cost=d=>rws(d).reduce((t,r)=>r.sec===GSEC?t:t+(r.k==="b"?lineCost(d,r.i):aCost(d,r.i)),0);
 const dirty=d=>Object.keys(prod[d.name]||{}).length>0||Object.keys(ovr[d.name]||{}).length>0||(add[d.name]||[]).length>0||Object.values(rm[d.name]||{}).some(Boolean);

 const map={};
 picked.forEach(d=>rws(d).forEach(r=>{const b=r.k==="b",k=b?(pOf(d,r.i)||d.ing[r.i].n):aP(d,r.i);if(!k)return;
  if(!map[k])map[k]={n:k,sec:r.sec,uses:[]};
  map[k].uses.push(`${d.name} @ ${b?qOf(d,r.i):aQ(d,r.i)}${r.u}`);}));
 const all=Object.values(map);
 extra.forEach(e=>e.n&&e.n.trim()&&all.push({n:e.n,sec:"Back bar",uses:["Standard bar service"]}));
 const grp=SEC.map(s=>({s,rows:all.filter(l=>l.sec===s)})).filter(g=>g.rows.length);
 const gRows=all.filter(l=>l.sec===GSEC);
 const gTotal=gRows.reduce((t,r)=>t+(parseFloat(gCost[r.n])||0),0);
 const total=picked.reduce((t,d)=>t+cost(d),0);
 const outDone=grp.reduce((t,g)=>t+g.rows.filter(r=>(out[r.n]??0)>0).length,0);
 const outAll=grp.reduce((t,g)=>t+g.rows.length,0);

 const L=[];
 L.push(`${ev.client||"Event"} — ${ev.date}${ev.venue?`, ${ev.venue}`:""}`);
 L.push(`Service: ${ev.service}${ev.guests?` · ${ev.guests} guests`:""}`);L.push("");
 L.push("Normal bar service and cocktails and mocktails");L.push("");
 L.push(`Staff: ${ev.arrival} arrival`);
 staff.forEach(s=>s.name.trim()&&L.push(`${s.name}${s.role?` ${s.role}`:""} - ${s.transport}`));
 TYPES.forEach(t=>{const ks=picked.filter(d=>d.type===t);if(!ks.length)return;
  L.push("");L.push(`${t}s:`);
  ks.forEach(d=>{L.push("");L.push(`${d.name} - ${d.method} - ${d.glass} - ${d.ice} ice`);
   rws(d).forEach(r=>{if(r.sec===GSEC)return;const b=r.k==="b";
    const nm=b?(edP(d,r.i)?pOf(d,r.i):d.ing[r.i].n):aP(d,r.i),qq=b?qOf(d,r.i):aQ(d,r.i);
    if(!nm)return;L.push(r.u==="ml"?`- ${qq}ml ${nm}`:`- ${qq} ${r.u} ${nm}`);});
   const gl=rws(d).map(r=>{if(r.sec!==GSEC)return null;const b=r.k==="b";
    return (b?(edP(d,r.i)?pOf(d,r.i):d.ing[r.i].n):aP(d,r.i)||"").replace(/ Garnish$/,"");}).filter(Boolean);
   if(gl.length)L.push(`- Garnish: ${gl.join(", ")}`);else if(d.gar)L.push(`- Garnish: ${d.gar}`);});});
 L.push("");L.push(`UNIFORMS: ${ev.uniform}`);
 const brief=L.join("\n");

 const F="h-12 px-3 rounded-xl border bg-white outline-none text-base w-full";
 const B={borderColor:"#DDD8CE"};
 const Sec=({k,title,sub,children})=>(<div className="border-b" style={{borderColor:LINE}}>
  <button onClick={()=>setOpen(o=>({...o,[k]:!o[k]}))} className="w-full px-5 py-4 flex items-center justify-between text-left">
   <span><span className="text-base">{title}</span>{sub&&<span className="block text-xs text-neutral-500 mt-0.5">{sub}</span>}</span>
   <span className="text-neutral-300 text-lg">{open[k]?"−":"+"}</span></button>
  {open[k]&&<div className="px-5 pb-5">{children}</div>}</div>);

 const pickList=LIB.filter(d=>(ft==="All"||d.type===ft)&&d.name.toLowerCase().includes(q.toLowerCase()));

 return(<div className="min-h-screen bg-white text-neutral-900" style={{fontFamily:"Outfit,system-ui,sans-serif"}}>
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Outfit:wght@300;400;500;600&display=swap');
   input,select,textarea{font-size:16px}`}</style>

  {picker&&<div className="fixed inset-0 z-50 bg-white flex flex-col">
   <div className="px-4 pt-4 pb-3 border-b" style={{borderColor:LINE}}>
    <div className="flex gap-2 items-center mb-3">
     <input autoFocus className={F} style={B} placeholder="Search drinks…" value={q} onChange={e=>setQ(e.target.value)}/>
     <button onClick={()=>{setPicker(false);setQ("");}} className="px-4 h-12 rounded-xl text-white shrink-0" style={{background:INK}}>Done</button></div>
    <div className="flex gap-2 overflow-x-auto pb-1">
     {["All",...TYPES].map(t=>(<button key={t} onClick={()=>setFt(t)} className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 border"
       style={{background:ft===t?INK:"#fff",color:ft===t?"#fff":"#6B6459",borderColor:ft===t?INK:"#DDD8CE"}}>{t}</button>))}</div></div>
   <div className="flex-1 overflow-y-auto">
    {pickList.map(d=>{const on=!!sel[d.name];return(
     <button key={d.name} onClick={()=>up("sel",p=>({...p,[d.name]:!on}))} className="w-full px-5 py-4 border-b flex items-center gap-3 text-left" style={{borderColor:"#EFECE6"}}>
      <span className="w-7 h-7 rounded-lg border flex items-center justify-center shrink-0" style={{background:on?GOLD:"#fff",borderColor:on?GOLD:"#DDD8CE",color:"#fff"}}>{on?"✓":""}</span>
      <span className="min-w-0 flex-1"><span className="block">{d.name}</span>
       <span className="block text-xs text-neutral-400">{d.type} · {d.glass}</span></span>
      <span className="text-xs shrink-0" style={{color:d.tier==="Premium"?GOLD:"#B7B1A6"}}>{d.tier==="Premium"?"★ ":""}£{cost(d).toFixed(2)}</span></button>);})}
    <div className="h-20"/></div></div>}

  <header className="px-5 pt-4 pb-3 border-b" style={{borderColor:LINE}}>
   <div className="flex items-center gap-2 mb-3 overflow-x-auto">
    {events.map(x=>(<button key={x.id} onClick={()=>setCur(x.id)} className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap shrink-0 border"
      style={{background:x.id===E.id?INK:"#fff",color:x.id===E.id?"#fff":"#6B6459",borderColor:x.id===E.id?INK:"#DDD8CE"}}>{x.ev.client||"Untitled"}</button>))}
    <button onClick={()=>{const n=blank();setEvents(es=>[...es,n]);setCur(n.id);setTab("setup");}} className="px-3 py-1.5 rounded-full text-xs shrink-0 border" style={{borderColor:"#DDD8CE",color:GOLD}}>+ Event</button></div>
   <div className="flex items-baseline justify-between gap-2">
    <h1 className="min-w-0 truncate" style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24}}>{ev.client||"New event"}</h1>
    {saved&&<span className="text-[11px] text-neutral-400 shrink-0">saved {saved}{saved&&!online?" · on this device only":""}</span>}</div>
   <p className="text-xs text-neutral-500 mt-0.5">{picked.length} drinks · £{total.toFixed(2)} liquid · £{gTotal.toFixed(2)} garnish</p>
  </header>

  <div className="sticky top-0 z-20 bg-white border-b flex" style={{borderColor:LINE}}>
   {[["setup","Setup"],["brief","Brief"],["out","Out"],["back","Back"]].map(([k,l])=>(
    <button key={k} onClick={()=>setTab(k)} className="flex-1 py-3 text-sm font-medium relative" style={{color:tab===k?INK:"#9A948A"}}>
     {l}{tab===k&&<span className="absolute left-0 right-0 bottom-0 h-[3px]" style={{background:GOLD}}/>}</button>))}</div>

  <main className="pb-28">
   {tab==="setup"&&<div>
    <Sec k="det" title="Event details" sub={[ev.date,ev.venue].filter(Boolean).join(" · ")||"Not set"}>
     <div className="space-y-3">
      {[["client","Client"],["date","Date"],["venue","Venue & address"],["service","Service hours"],["arrival","Staff arrival"],["guests","Guests"],["uniform","Uniform"]].map(([k,l])=>(
       <div key={k}><label className="block text-xs text-neutral-500 mb-1">{l}</label>
        <input className={F} style={B} value={ev[k]} onChange={e=>{const v=e.target.value;up("ev",p=>({...p,[k]:v}));}}/></div>))}</div></Sec>

    <Sec k="staff" title="Staff" sub={staff.filter(s=>s.name.trim()).map(s=>s.name).join(", ")||"None added"}>
     {staff.map((s,i)=>(<div key={s.id} className="mb-3 p-3 rounded-xl space-y-2" style={{background:"#FAF8F4",border:"1px solid "+LINE}}>
      <input className={F} style={B} placeholder="Name" value={s.name} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,name:v}:x));}}/>
      <div className="grid grid-cols-2 gap-2">
       <input className={F} style={B} placeholder="Role" value={s.role} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,role:v}:x));}}/>
       <select className={F} style={B} value={s.transport} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,transport:v}:x));}}>
        <option>Car</option><option>Van</option><option>Venue</option></select></div>
      <button onClick={()=>up("staff",p=>p.filter((_,j)=>j!==i))} className="text-xs underline underline-offset-4 text-neutral-400">Remove</button></div>))}
     <button onClick={()=>up("staff",s=>[...s,{id:Date.now(),name:"",role:"",transport:"Car"}])} className="w-full py-3 rounded-xl border text-sm" style={{borderColor:"#DDD8CE",color:GOLD}}>+ Add person</button></Sec>

    <Sec k="drinks" title="Drinks" sub={picked.length?`${picked.length} selected`:"None selected"}>
     <button onClick={()=>setPicker(true)} className="w-full py-3 rounded-xl text-white text-sm font-medium mb-4" style={{background:INK}}>Choose drinks</button>
     {!picked.length&&<p className="text-sm text-neutral-400 text-center py-4">Nothing selected yet.</p>}
     {picked.map(d=>{const x=!!expand[d.name];return(<div key={d.name} className="mb-2 rounded-xl" style={{border:"1px solid "+(dirty(d)?GOLD:LINE)}}>
      <button onClick={()=>setExpand(p=>({...p,[d.name]:!x}))} className="w-full px-3 py-3 flex items-center gap-2 text-left">
       <span className="min-w-0 flex-1"><span className="block text-base">{d.name}</span>
        <span className="block text-xs text-neutral-400">{d.method} · {d.glass} · {d.ice} ice{dirty(d)?" · edited":""}</span></span>
       <span className="text-xs tabular-nums shrink-0" style={{color:GOLD}}>£{cost(d).toFixed(2)}</span>
       <span className="text-neutral-300 shrink-0">{x?"−":"+"}</span></button>
      {x&&<div className="px-3 pb-3 space-y-3">
       {d.ing.map((ing,i)=>rm[d.name]?.[i]?(
        <div key={i} className="flex items-center justify-between text-sm text-neutral-400 py-1">
         <span className="line-through">{ing.q}{ing.u} {ing.n}</span>
         <button onClick={()=>up("rm",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:false}}))} className="text-xs underline underline-offset-4" style={{color:GOLD}}>undo</button></div>
       ):(<div key={i} className="pb-2 border-b" style={{borderColor:"#F2F0EB"}}>
         <div className="flex items-center gap-2 mb-1.5">
          <input inputMode="decimal" value={qOf(d,i)} onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");up("ovr",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:v===""?0:parseFloat(v)}}));}}
           className="w-20 h-11 text-center rounded-xl border tabular-nums shrink-0" style={{borderColor:edQ(d,i)?GOLD:"#E6E2DA",color:edQ(d,i)?GOLD:INK}}/>
          <span className="text-sm text-neutral-400 shrink-0">{ing.u}</span>
          <span className="text-xs tabular-nums text-neutral-400 ml-auto shrink-0">£{lineCost(d,i).toFixed(2)}</span>
          <button onClick={()=>up("rm",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:true}}))} className="w-8 h-8 shrink-0 text-neutral-300 text-xl leading-none">×</button></div>
         <select value={pOf(d,i)} onChange={e=>{const v=e.target.value;up("prod",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:v}}));}}
          className="w-full h-11 px-2 rounded-xl border text-sm"
          style={{borderColor:edP(d,i)?GOLD:"#EFECE6",background:edP(d,i)?"#FFFDF7":"#fff",color:edP(d,i)?GOLD:"#3f3f3f"}}>
          <option value={d.ing[i].s||""}>{d.ing[i].n}{d.ing[i].s?` — ${d.ing[i].s}`:""}</option>
          {CATS.map(c=>(<optgroup key={c} label={c}>{INV.filter(y=>y.cat===c&&y.n!==(d.ing[i].s||"")).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select></div>))}
       {(add[d.name]||[]).map((a,j)=>{const st=(k,v)=>up("add",p=>({...p,[d.name]:p[d.name].map((y,z)=>z===j?{...y,[k]:v}:y)}));return(
        <div key={"a"+j} className="pb-2 border-b" style={{borderColor:"#F2F0EB"}}>
         <div className="flex items-center gap-2 mb-1.5">
          <input inputMode="decimal" value={a.q} onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");st("q",v===""?0:parseFloat(v));}}
           className="w-20 h-11 text-center rounded-xl border tabular-nums shrink-0" style={{borderColor:GOLD,color:GOLD}}/>
          <select value={a.u} onChange={e=>st("u",e.target.value)} className="h-11 px-2 rounded-xl border text-sm shrink-0" style={{borderColor:GOLD,color:GOLD}}>
           {["ml","dash","drop","piece","slice","wedge","sprig","cube","spoon"].map(u=>(<option key={u}>{u}</option>))}</select>
          <span className="text-xs tabular-nums text-neutral-400 ml-auto shrink-0">£{aCost(d,j).toFixed(2)}</span>
          <button onClick={()=>up("add",p=>({...p,[d.name]:p[d.name].filter((_,z)=>z!==j)}))} className="w-8 h-8 shrink-0 text-neutral-300 text-xl leading-none">×</button></div>
         <select value={a.s} onChange={e=>st("s",e.target.value)} className="w-full h-11 px-2 rounded-xl border text-sm" style={{borderColor:GOLD,background:"#FFFDF7",color:GOLD}}>
          <option value="">Choose an item…</option>
          {CATS.map(c=>(<optgroup key={c} label={c}>{INV.filter(y=>y.cat===c).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select></div>);})}
       <div className="flex gap-4 pt-1">
        <button onClick={()=>up("add",p=>({...p,[d.name]:[...(p[d.name]||[]),{q:25,u:"ml",s:""}]}))} className="text-sm underline underline-offset-4" style={{color:GOLD}}>+ Add ingredient</button>
        {dirty(d)&&<button onClick={()=>{up("prod",p=>({...p,[d.name]:{}}));up("ovr",p=>({...p,[d.name]:{}}));up("rm",p=>({...p,[d.name]:{}}));up("add",p=>({...p,[d.name]:[]}));}}
         className="text-sm underline underline-offset-4 text-neutral-400">Reset</button>}</div></div>}
     </div>);})}</Sec>

    <Sec k="bar" title="Back bar & standard service" sub={extra.filter(e=>e.n).length?`${extra.filter(e=>e.n).length} lines`:"From the quote"}>
     {extra.map((e,i)=>(<div key={e.id} className="flex gap-2 mb-2">
       <select className={F} style={B} value={e.n} onChange={x=>{const v=x.target.value;up("extra",p=>p.map((y,j)=>j===i?{...y,n:v}:y));}}>
        <option value="">Choose an item…</option>
        {CATS.map(c=>(<optgroup key={c} label={c}>{INV.filter(y=>y.cat===c).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select>
       <button onClick={()=>up("extra",p=>p.filter((_,j)=>j!==i))} className="w-10 shrink-0 text-neutral-300 text-xl">×</button></div>))}
     <button onClick={()=>up("extra",x=>[...x,{id:Date.now(),n:""}])} className="w-full py-3 rounded-xl border text-sm" style={{borderColor:"#DDD8CE",color:GOLD}}>+ Add line</button></Sec>

    <div className="px-5 py-6">
     <button onClick={()=>{if(events.length<2)return;const o=events.find(x=>x.id!==E.id);setEvents(es=>es.filter(x=>x.id!==E.id));setCur(o.id);}}
      className="text-xs underline underline-offset-4 text-neutral-400">Delete this event</button></div></div>}

   {tab==="brief"&&<div className="px-5 py-5">
    <pre className="whitespace-pre-wrap text-sm leading-relaxed p-4 rounded-xl" style={{background:"#FAF8F4",border:"1px solid "+LINE,fontFamily:"inherit"}}>{brief}</pre></div>}

   {(tab==="out"||tab==="back")&&<div>
    {tab==="back"&&<div className="mx-5 mt-4 p-4 rounded-xl text-sm" style={{background:"#FBF3F1",border:"1px solid #E7C9C2",color:"#8A2E1A"}}>Sealed bottles only. Anything opened counts as used.</div>}
    {grp.map(g=>(<section key={g.s}>
     <h2 className="px-5 py-2 text-xs font-medium uppercase tracking-wide sticky top-[45px] z-10" style={{background:"#F5F3EF",color:"#6B6459",borderTop:"1px solid "+LINE,borderBottom:"1px solid "+LINE}}>{g.s}</h2>
     {g.rows.filter(r=>tab==="out"||(out[r.n]??0)>0).map(r=>(
      <div key={r.n} className="px-5 py-3 border-b flex items-center justify-between gap-3" style={{borderColor:"#EFECE6"}}>
       <div className="min-w-0 flex-1"><div className="text-base leading-tight">{r.n}</div>
        <div className="text-xs text-neutral-500 mt-0.5 truncate">{r.uses.join(" · ")}</div>
        {tab==="back"&&<div className="text-xs mt-1" style={{color:GOLD}}>took {out[r.n]??0} · used {Math.max(0,(out[r.n]??0)-(back[r.n]??0))}</div>}</div>
       <input inputMode="numeric" placeholder="0" value={tab==="out"?(out[r.n]??""):(back[r.n]??"")}
        onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,""),n=v===""?0:parseInt(v,10);
         if(tab==="out")up("out",p=>({...p,[r.n]:n}));else up("back",p=>({...p,[r.n]:Math.min(n,out[r.n]??0)}));}}
        className="w-16 h-14 text-center text-2xl tabular-nums rounded-xl border bg-white outline-none shrink-0"
        style={{borderColor:LINE,color:tab==="back"?GOLD:INK}}/></div>))}</section>))}
    {gRows.length>0&&<section>
     <h2 className="px-5 py-2 text-xs font-medium uppercase tracking-wide sticky top-[45px] z-10" style={{background:"#F5F3EF",color:"#6B6459",borderTop:"1px solid "+LINE,borderBottom:"1px solid "+LINE}}>{GSEC} · £{gTotal.toFixed(2)}</h2>
     {gRows.map(r=>(
      <div key={r.n} className="px-5 py-3 border-b flex items-center justify-between gap-3" style={{borderColor:"#EFECE6"}}>
       <div className="min-w-0 flex-1"><div className="text-base leading-tight">{r.n}</div>
        <div className="text-xs text-neutral-500 mt-0.5 truncate">{r.uses.join(" · ")}</div></div>
       <div className="flex items-center gap-1 shrink-0"><span className="text-lg text-neutral-400">£</span>
        <input inputMode="decimal" placeholder="0.00" value={gCost[r.n]??""} onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");up("gCost",p=>({...p,[r.n]:v}));}}
         className="w-20 h-14 text-center text-xl tabular-nums rounded-xl border bg-white outline-none" style={{borderColor:LINE,color:(gCost[r.n]&&parseFloat(gCost[r.n]))?GOLD:INK}}/></div></div>))}</section>}
    {!grp.length&&!gRows.length&&<div className="px-5 py-16 text-center text-neutral-400">Pick some drinks first.</div>}</div>}
  </main>

  {tab==="brief"&&<div className="fixed bottom-0 left-0 right-0 px-5 py-3 bg-white border-t" style={{borderColor:LINE}}>
   <button onClick={()=>navigator.clipboard?.writeText(brief)} className="w-full py-4 rounded-full text-white text-base font-medium" style={{background:INK}}>Copy message for the team</button></div>}
  {tab==="out"&&outAll>0&&<div className="fixed bottom-0 left-0 right-0 px-5 py-3 bg-white border-t flex items-center justify-between" style={{borderColor:LINE}}>
   <span className="text-sm text-neutral-500">{outDone}/{outAll} lines loaded</span>
   <button onClick={()=>setTab("back")} className="px-5 py-3 rounded-full text-white text-sm font-medium" style={{background:GOLD}}>Van loaded</button></div>}
 </div>);
}
