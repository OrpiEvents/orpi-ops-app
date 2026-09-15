'use client';
import React, { useState, useEffect } from "react";
import { createClient } from "@/lib/supabaseBrowser";
import DRINKS_DATA from "./drinks-data.json";

// Run sheet — Setup, Brief, Out, In.
//
// Changed from the prototype in three places, all marked below:
//   • the drinks library is imported rather than pasted in, so Notion stays
//     the only source of truth
//   • storage writes to the device first and Supabase second, so the tool
//     keeps working in a venue car park with no signal
//   • it renders inside AppShell like every other page

// The bundled file is the floor, not the source. It paints instantly and keeps
// the run sheet usable with no signal; Notion overwrites it a moment later.
const FALLBACK_LIB = DRINKS_DATA.drinks;
const FALLBACK_INV = DRINKS_DATA.inventory;

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
// Cost per ml from a bottle price and size — what makes a hand-added product
// cost exactly like a stocked one.
const cpmOf=(cost,ml)=>(Number(ml)>0?Number(cost)/Number(ml):0);
const SEC=["Cocktail spirits","Back bar","Chilled — critical","Mixers & juices"];
const GSEC="Garnish & consumables";
const DISPOSABLE=["Plastic Shot"];
const TYPES=["Welcome Cocktail","Welcome Mocktail","Cocktail","Mocktail","Shooter"];
const blank=()=>({id:String(Date.now()),ev:{client:"",date:"",venue:"",service:"5pm to 12am",arrival:"12pm",guests:"",uniform:"Black trousers, black shirts and aprons (provided)"},
 staff:[{id:1,name:"",role:"",transport:"Car"}],sel:{},ovr:{},prod:{},rm:{},add:{},extra:[],out:{},back:{},gCost:{},
 // Glassware order. gQty is the typed quantity per glass type, gExtra any type
 // the drinks list doesn't imply (toast flutes, beer glasses).
 gQty:{},gExtra:[],
 // Pulled from the confirmed booking in Notion. `requests` is the internal
 // notes field — the place anything a client specifically asked for ends up.
 bookingId:"",requests:"",
 // Event-only brand swaps: {"Absolut Vodka 1L":"Smirnoff Red 1L"}. Applies
 // across every recipe on this run sheet so the van carries one vodka, not two.
 // Nothing here touches the drinks library.
 swap:{},
 // Things the van needs that the store didn't have. buy is keyed by item name
 // with the quantity to get; buyExtra is anything off-list — blue roll, ice,
 // a bag of limes.
 buy:{},buyExtra:[],
 // Products used on this event that aren't in Inventory yet. They cost and
 // load out like anything else; pushing them to Notion is a separate button.
 newInv:[]});


// Collapsible section. Must live OUTSIDE Runsheet: defined inside, it becomes a
// new component type on every render, so React unmounts and remounts everything
// in it each keystroke — which on a phone closes the keyboard mid-word.
function Sec({k,title,sub,open,setOpen,children}){
 return (<div className="border-b" style={{borderColor:LINE}}>
  <button onClick={()=>setOpen(o=>({...o,[k]:!o[k]}))} className="w-full px-5 py-4 flex items-center justify-between text-left">
   <span><span className="text-base">{title}</span>{sub&&<span className="block text-xs text-neutral-500 mt-0.5">{sub}</span>}</span>
   <span className="text-neutral-300 text-lg">{open[k]?"−":"+"}</span></button>
  {open[k]&&<div className="px-5 pb-5">{children}</div>}</div>);
}

export default function Runsheet(){
 const [events,setEvents]=useState(null),[cur,setCur]=useState(null),[ready,setReady]=useState(false);
 const [tab,setTab]=useState("setup"),[saved,setSaved]=useState("");
 const [online,setOnline]=useState(true);
 const [newProd,setNewProd]=useState(null);   // {apply} while the sheet is open
 const [pushing,setPushing]=useState("");
 const [open,setOpen]=useState({det:true,staff:false,drinks:true,swap:false,glass:false,bar:false});
 const [glassCopied,setGlassCopied]=useState(false);
 const [shopCopied,setShopCopied]=useState(false);
 const [briefCopied,setBriefCopied]=useState(false);
 const [subFor,setSubFor]=useState(null);   // drink whose substitute sheet is open
 const [bookings,setBookings]=useState([]);
 const [LIB,setLIB]=useState(FALLBACK_LIB);
 const [INV,setINV]=useState(FALLBACK_INV);
 const [libSource,setLibSource]=useState("bundled");

 // Live library from Notion. Failure is fine and silent — we already have a
 // working copy on screen.
 useEffect(()=>{
  fetch("/api/drinks").then(r=>r.json())
   .then(res=>{
    if(res.error||!res.drinks?.length)return;
    setLIB(res.drinks);setINV(res.inventory||FALLBACK_INV);
    setLibSource(res.stale?"cached":"notion");
   })
   .catch(()=>{});
 },[]);

 // Confirmed bookings, so a run sheet can be filled from one rather than
 // retyped. Silent on failure — the run sheet works offline and typing the
 // details by hand has to stay possible.
 useEffect(()=>{
  fetch("/api/bookings").then(r=>r.json())
   .then(res=>{if(!res.error)setBookings(res.bookings||[]);})
   .catch(()=>{});
 },[]);
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

 // Adds the product to this event and hands the name back to whichever picker
 // asked for it. Cost is optional — a bottle with no price still loads out,
 // it just contributes nothing to the drink cost until someone prices it.
 function saveNewProduct(f){
  const n=(f.n||"").trim(); if(!n)return;
  const ml=parseFloat(f.v)||0, uc=parseFloat(f.uc)||0;
  up("newInv",list=>[...(list||[]).filter(x=>x.n!==n),
   {n,cat:f.cat||"Other",v:ml,uc,cpm:cpmOf(uc,ml),size:f.size||(ml?`${ml}ml`:""),stock:0,isNew:true}]);
  if(newProd?.apply)newProd.apply(n);
  setNewProd(null);
 }

 // Sends them to Inventory Items as drafts with "Needs setup" ticked — the
 // same route the quote builder uses, so there's one way new stock arrives.
 async function pushNewToNotion(){
  const items=(E.newInv||[]).filter(x=>!x.pushed);
  if(!items.length)return;
  setPushing("Adding…");
  try{
   const r=await fetch("/api/inventory/draft",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({items:items.map(x=>({name:x.n,cat:x.cat}))})}).then(x=>x.json());
   if(r.error){setPushing("Couldn't add — try again later");}
   else{up("newInv",list=>(list||[]).map(x=>({...x,pushed:true})));
        setPushing(`${r.created} added to Inventory`);}
  }catch(e){setPushing("Couldn't add — no connection");}
  setTimeout(()=>setPushing(""),4000);
 }

 // Fills the event from a booking. Doesn't touch drinks or staff — those are
 // decisions, not facts, and overwriting them would lose real work.
 function pullBooking(id){
  const b=bookings.find(x=>x.id===id);
  if(!b){up("ev",p=>p);return;}
  up("bookingId",()=>id);
  up("requests",()=>b.internalNotes||"");
  up("ev",p=>({...p,
   client:b.clientName||b.name||p.client,
   date:b.eventDate?new Date(b.eventDate+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}):p.date,
   venue:b.venue||p.venue,
   guests:b.guestCount!=null?String(b.guestCount):p.guests,
  }));
 }

 if(!ready)return(<div className="min-h-screen flex items-center justify-center text-neutral-400">Loading…</div>);
 const E=events.find(x=>x.id===cur)||events[0];
 const up=(k,v)=>setEvents(es=>es.map(x=>x.id===E.id?{...x,[k]:typeof v==="function"?v(x[k]):v}:x));
 const {ev,staff,sel,ovr,prod,rm,add,extra,out,back,gCost}=E;
 // Stock plus anything added by hand on this event. Everything below reads
 // these rather than the bundled list, so a new product behaves identically.
 const newInv=E.newInv||[];
 const INVX=[...INV,...newInv];
 const BYX={}; INVX.forEach(i=>BYX[i.n]=i);
 const CATSX=[...new Set(INVX.map(i=>i.cat))].sort();

 const picked=LIB.filter(d=>sel[d.name]);
 // Declared here, ahead of baseProducts and pOf, both of which read it.
 const swap=E.swap||{};

 const buy=E.buy||{}, buyExtra=E.buyExtra||[];
 function toggleBuy(name){
  up("buy",p=>{const n={...(p||{})};
   if(n[name]!==undefined)delete n[name];else n[name]="";
   return n;});
 }
 const shopRows=[
  ...Object.keys(buy).sort().map(n=>({n,q:buy[n],fixed:true})),
  ...buyExtra.map((x,i)=>({n:x.n,q:x.q,i})),
 ];
 const shopCount=shopRows.filter(r=>r.n&&r.n.trim()).length;
 const shopList=[
  `Shopping — ${ev.client||"Event"}${ev.date?`, ${ev.date}`:""}`,
  "",
  ...shopRows.filter(r=>r.n&&r.n.trim()).map(r=>r.q?`${r.q} × ${r.n}`:r.n),
 ].join("\n");

 // ── Glassware ───────────────────────────────────────────────────
 // The menu decides WHICH glasses are needed. Quantities are typed — nobody
 // needs a formula guessing at a number they already know.
 // Every product the chosen menu calls for, before any swapping. This is the
 // list worth offering swaps on — no point showing brands not on this event.
 const baseProducts=(()=>{
  const set=new Set();
  picked.forEach(d=>d.ing.forEach((ing,i)=>{
   if(rm[d.name]?.[i])return;
   if(ing.s)set.add(ing.s);
  }));
  return [...set].sort();
 })();
 const swapCount=baseProducts.filter(b=>swap[b]&&swap[b]!==b).length;

 const glassRows=(()=>{
  const counts={};
  // Plastic shot glasses are ours, not the hire company's — they'd only
  // confuse an order, so they stay off this list.
  picked.forEach(d=>{if(d.glass&&!DISPOSABLE.includes(d.glass))counts[d.glass]=(counts[d.glass]||0)+1;});
  (E.gExtra||[]).forEach(x=>{if(x.t&&!counts[x.t])counts[x.t]=0;});
  return Object.keys(counts).sort().map(t=>({
   type:t,drinks:counts[t],qty:parseInt((E.gQty||{})[t],10)||0,
  }));
 })();
 const glassTotal=glassRows.reduce((a,r)=>a+r.qty,0);

 const glassOrder=[
  `Glassware — ${ev.client||"Event"}${ev.date?`, ${ev.date}`:""}`,
  ev.venue?ev.venue:null,
  ev.guests?`${ev.guests} guests`:null,
  "",
  ...glassRows.filter(r=>r.qty>0).map(r=>`${r.type} × ${r.qty}`),
  "",
  `Total: ${glassTotal}`,
 ].filter(x=>x!==null).join("\n");
 const qOf=(d,i)=>ovr[d.name]?.[i]??d.ing[i].q;
 // A per-drink change beats the event swap — if you deliberately set the
 // Espresso Martini to Grey Goose, a blanket vodka swap shouldn't undo it.
 const pOf=(d,i)=>{
  const perDrink=prod[d.name]?.[i];
  if(perDrink!==undefined)return perDrink;
  const base=d.ing[i].s||"";
  return swap[base]||base;
 };
 const edQ=(d,i)=>ovr[d.name]?.[i]!==undefined&&ovr[d.name][i]!==d.ing[i].q;
 const edP=(d,i)=>pOf(d,i)!==(d.ing[i].s||"");
 const lineCost=(d,i)=>{const it=BYX[pOf(d,i)];return it?qOf(d,i)*it.cpm:(d.ing[i].q?d.ing[i].c/d.ing[i].q*qOf(d,i):d.ing[i].c);};
 const secOf=n=>{const it=BYX[n],c=it?it.cat:"Other";
  if(/espresso|cream|milk/i.test(n))return "Chilled — critical";
  if(c==="Garnish")return GSEC;
  if(["Spirit","Liqueur","Wine","Prosecco","Champagne","Beer"].includes(c))return "Cocktail spirits";
  return "Mixers & juices";};
 const rws=d=>{const r=d.ing.map((ing,i)=>rm[d.name]?.[i]?null:({k:"b",i,u:ing.u,sec:ing.sec})).filter(Boolean);
  (add[d.name]||[]).forEach((a,j)=>r.push({k:"a",i:j,u:a.u,sec:a.s?secOf(a.s):"Mixers & juices"}));return r;};
 const aQ=(d,j)=>add[d.name][j].q,aP=(d,j)=>add[d.name][j].s;
 const aCost=(d,j)=>{const it=BYX[aP(d,j)];return it?aQ(d,j)*it.cpm:0;};
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
 if((E.requests||"").trim()){L.push("");L.push("CLIENT REQUESTS:");L.push(E.requests.trim());}
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
   {[["setup","Setup"],["brief","Brief"],["out","Out"],["back","In"]].map(([k,l])=>(
    <button key={k} onClick={()=>setTab(k)} className="flex-1 py-3 text-sm font-medium relative" style={{color:tab===k?INK:"#9A948A"}}>
     {l}{tab===k&&<span className="absolute left-0 right-0 bottom-0 h-[3px]" style={{background:GOLD}}/>}</button>))}</div>

  <main className="pb-28">
   {tab==="setup"&&<div>
    {!!(E.requests||"").trim()&&(
     <div className="mx-5 mt-4 rounded-xl px-4 py-3" style={{background:"#FFF6F5",border:"1px solid #E8B4AE"}}>
      <div className="text-xs font-medium mb-1" style={{color:"#A8453A",letterSpacing:".08em"}}>CLIENT REQUESTS</div>
      <div className="text-sm whitespace-pre-wrap" style={{color:"#6B3833"}}>{E.requests}</div>
     </div>)}

    {!!newInv.length&&(
     <div className="mx-5 mt-4 mb-1 rounded-xl px-4 py-3" style={{background:"#FFFDF7",border:"1px solid "+GOLD}}>
      <div className="text-sm" style={{color:GOLD}}>
       {newInv.length} product{newInv.length===1?"":"s"} not in inventory: {newInv.map(x=>x.n).join(", ")}
      </div>
      {newInv.every(x=>x.pushed)
       ? <div className="text-xs text-neutral-500 mt-1">Added to Inventory — give them a size and a purchase when you buy.</div>
       : <button onClick={pushNewToNotion} className="text-sm underline underline-offset-4 mt-1" style={{color:GOLD}}>
          {pushing||"Add to Inventory"}</button>}
     </div>)}

    <Sec open={open} setOpen={setOpen} k="det" title="Event details" sub={[ev.date,ev.venue].filter(Boolean).join(" · ")||"Not set"}>
     {!!bookings.length&&(
      <div className="mb-4">
       <label className="block text-xs text-neutral-500 mb-1">Fill from a confirmed booking</label>
       <select className={F} style={B} value={E.bookingId||""} onChange={e=>pullBooking(e.target.value)}>
        <option value="">Type the details by hand…</option>
        {bookings.map(b=>(<option key={b.id} value={b.id}>
         {(b.clientName||b.name)}{b.eventDate?` — ${new Date(b.eventDate+"T12:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`:""}
        </option>))}
       </select>
      </div>)}

     <div className="space-y-3">
      {[["client","Client"],["date","Date"],["venue","Venue & address"],["service","Service hours"],["arrival","Staff arrival"],["guests","Guests"],["uniform","Uniform"]].map(([k,l])=>(
       <div key={k}><label className="block text-xs text-neutral-500 mb-1">{l}</label>
        <input className={F} style={B} value={ev[k]} onChange={e=>{const v=e.target.value;up("ev",p=>({...p,[k]:v}));}}/></div>))}</div></Sec>

    <Sec open={open} setOpen={setOpen} k="staff" title="Staff" sub={staff.filter(s=>s.name.trim()).map(s=>s.name).join(", ")||"None added"}>
     {staff.map((s,i)=>(<div key={s.id} className="mb-3 p-3 rounded-xl space-y-2" style={{background:"#FAF8F4",border:"1px solid "+LINE}}>
      <input className={F} style={B} placeholder="Name" value={s.name} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,name:v}:x));}}/>
      <div className="grid grid-cols-2 gap-2">
       <input className={F} style={B} placeholder="Role" value={s.role} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,role:v}:x));}}/>
       <select className={F} style={B} value={s.transport} onChange={e=>{const v=e.target.value;up("staff",p=>p.map((x,j)=>j===i?{...x,transport:v}:x));}}>
        <option>Car</option><option>Van</option><option>Venue</option></select></div>
      <button onClick={()=>up("staff",p=>p.filter((_,j)=>j!==i))} className="text-xs underline underline-offset-4 text-neutral-400">Remove</button></div>))}
     <button onClick={()=>up("staff",s=>[...s,{id:Date.now(),name:"",role:"",transport:"Car"}])} className="w-full py-3 rounded-xl border text-sm" style={{borderColor:"#DDD8CE",color:GOLD}}>+ Add person</button></Sec>

    <Sec open={open} setOpen={setOpen} k="drinks" title="Drinks" sub={picked.length?`${picked.length} selected`:"None selected"}>
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
         <select value={pOf(d,i)} onChange={e=>{const v=e.target.value;
           if(v==="__new__"){setNewProd({apply:n=>up("prod",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:n}}))});return;}
           up("prod",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:v}}));}}
          className="w-full h-11 px-2 rounded-xl border text-sm"
          style={{borderColor:edP(d,i)?GOLD:"#EFECE6",background:edP(d,i)?"#FFFDF7":"#fff",color:edP(d,i)?GOLD:"#3f3f3f"}}>
          <option value={d.ing[i].s||""}>{d.ing[i].n}{d.ing[i].s?` — ${d.ing[i].s}`:""}</option>
          <option value="__new__">+ Product not in inventory…</option>
          {CATSX.map(c=>(<optgroup key={c} label={c}>{INVX.filter(y=>y.cat===c&&y.n!==(d.ing[i].s||"")).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select></div>))}
       {(add[d.name]||[]).map((a,j)=>{const st=(k,v)=>up("add",p=>({...p,[d.name]:p[d.name].map((y,z)=>z===j?{...y,[k]:v}:y)}));return(
        <div key={"a"+j} className="pb-2 border-b" style={{borderColor:"#F2F0EB"}}>
         <div className="flex items-center gap-2 mb-1.5">
          <input inputMode="decimal" value={a.q} onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");st("q",v===""?0:parseFloat(v));}}
           className="w-20 h-11 text-center rounded-xl border tabular-nums shrink-0" style={{borderColor:GOLD,color:GOLD}}/>
          <select value={a.u} onChange={e=>st("u",e.target.value)} className="h-11 px-2 rounded-xl border text-sm shrink-0" style={{borderColor:GOLD,color:GOLD}}>
           {["ml","dash","drop","piece","slice","wedge","sprig","cube","spoon"].map(u=>(<option key={u}>{u}</option>))}</select>
          <span className="text-xs tabular-nums text-neutral-400 ml-auto shrink-0">£{aCost(d,j).toFixed(2)}</span>
          <button onClick={()=>up("add",p=>({...p,[d.name]:p[d.name].filter((_,z)=>z!==j)}))} className="w-8 h-8 shrink-0 text-neutral-300 text-xl leading-none">×</button></div>
         <select value={a.s} onChange={e=>{const v=e.target.value;
           if(v==="__new__"){setNewProd({apply:n=>st("s",n)});return;}
           st("s",v);}} className="w-full h-11 px-2 rounded-xl border text-sm" style={{borderColor:GOLD,background:"#FFFDF7",color:GOLD}}>
          <option value="">Choose an item…</option>
          <option value="__new__">+ Product not in inventory…</option>
          {CATSX.map(c=>(<optgroup key={c} label={c}>{INVX.filter(y=>y.cat===c).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select></div>);})}
       <div className="flex gap-4 pt-1">
        <button onClick={()=>up("add",p=>({...p,[d.name]:[...(p[d.name]||[]),{q:25,u:"ml",s:""}]}))} className="text-sm underline underline-offset-4" style={{color:GOLD}}>+ Add ingredient</button>
        <button onClick={()=>setSubFor(d)} className="text-sm underline underline-offset-4" style={{color:GOLD}}>Substitute</button>
        {dirty(d)&&<button onClick={()=>{up("prod",p=>({...p,[d.name]:{}}));up("ovr",p=>({...p,[d.name]:{}}));up("rm",p=>({...p,[d.name]:{}}));up("add",p=>({...p,[d.name]:[]}));}}
         className="text-sm underline underline-offset-4 text-neutral-400">Reset</button>}</div></div>}
     </div>);})}</Sec>

    <Sec open={open} setOpen={setOpen} k="swap" title="Brand swaps"
      sub={swapCount?`${swapCount} swapped for this event`:(baseProducts.length?"Using recipe brands":"Choose drinks first")}>
     {!baseProducts.length
      ? <p className="text-sm text-neutral-400 text-center py-4">Pick your drinks first.</p>
      : (<>
       <p className="text-xs text-neutral-400 mb-3">
        For this event only — the drinks library doesn't change. Swap here and the
        loading list, costs and brief all follow, so you carry one bottle not two.
       </p>
       {baseProducts.map(b=>{
        const to=swap[b]||b, changed=to!==b;
        return (
         <div key={b} className="py-2 border-b" style={{borderColor:"#F2F0EB"}}>
          <div className="text-sm mb-1.5" style={{color:changed?"#9A9388":INK,textDecoration:changed?"line-through":"none"}}>{b}</div>
          <select value={to} onChange={e=>{const v=e.target.value;
            if(v==="__new__"){setNewProd({apply:nm=>up("swap",p=>({...(p||{}),[b]:nm}))});return;}
            up("swap",p=>{const n={...(p||{})};
             if(v===b)delete n[b];else n[b]=v;
             return n;});}}
           className="w-full h-11 px-2 rounded-xl border text-sm"
           style={{borderColor:changed?GOLD:"#EFECE6",background:changed?"#FFFDF7":"#fff",color:changed?GOLD:"#3f3f3f"}}>
           <option value={b}>{b}{changed?"":" — as per recipe"}</option>
           <option value="__new__">+ Product not in inventory…</option>
           {CATSX.map(c=>(<optgroup key={c} label={c}>
            {INVX.filter(y=>y.cat===c&&y.n!==b).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}
           </optgroup>))}
          </select>
         </div>);
       })}
       {swapCount>0&&(
        <button onClick={()=>up("swap",()=>({}))} className="text-sm underline underline-offset-4 text-neutral-400 mt-3">
         Reset all to recipe brands</button>)}
      </>)}
    </Sec>

    <Sec open={open} setOpen={setOpen} k="glass" title="Glassware order"
      sub={glassRows.length?(glassTotal?`${glassTotal} glasses · ${glassRows.length} type${glassRows.length===1?"":"s"}`:`${glassRows.length} type${glassRows.length===1?"":"s"} — quantities to add`):"Choose drinks first"}>
     {!picked.length&&!(E.gExtra||[]).length
      ? <p className="text-sm text-neutral-400 text-center py-4">Pick your drinks and the glass types follow.</p>
      : (<>
       <p className="text-xs text-neutral-400 mb-3">From your drinks menu. Type the quantity you need for each.</p>

       {glassRows.map(r=>(
        <div key={r.type} className="flex items-center gap-2 py-2 border-b" style={{borderColor:"#F2F0EB"}}>
         <span className="min-w-0 flex-1">
          <span className="block text-base">{r.type}</span>
          <span className="block text-xs text-neutral-400">
           {r.drinks?`${r.drinks} drink${r.drinks===1?"":"s"} on the menu`:"added by hand"}
          </span>
         </span>
         <input inputMode="numeric" placeholder="—" value={(E.gQty||{})[r.type]||""}
           onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"");up("gQty",q=>({...(q||{}),[r.type]:v}));}}
           className="w-20 h-11 text-center rounded-xl border tabular-nums shrink-0"
           style={{borderColor:r.qty?GOLD:"#E6E2DA",color:r.qty?GOLD:INK}}/>
        </div>))}

       {(E.gExtra||[]).map((x,i)=>(
        <div key={"gx"+i} className="flex items-center gap-2 py-2">
         <input value={x.t} placeholder="Glass type" onChange={e=>{const v=e.target.value;up("gExtra",p=>p.map((y,j)=>j===i?{t:v}:y));}}
           className="flex-1 min-w-0 h-11 px-3 rounded-xl border text-base" style={{borderColor:GOLD,color:GOLD}}/>
         <button onClick={()=>up("gExtra",p=>p.filter((_,j)=>j!==i))} className="w-8 h-8 shrink-0 text-neutral-300 text-xl leading-none">×</button>
        </div>))}

       <div className="flex items-center justify-between pt-3">
        <button onClick={()=>up("gExtra",p=>[...(p||[]),{t:""}])} className="text-sm underline underline-offset-4" style={{color:GOLD}}>+ Add glass type</button>
        <span className="text-sm tabular-nums">Total <strong>{glassTotal}</strong></span>
       </div>

       <button onClick={()=>{navigator.clipboard?.writeText(glassOrder);setGlassCopied(true);setTimeout(()=>setGlassCopied(false),2200);}}
         className="w-full py-3 rounded-xl text-white text-sm font-medium mt-4" style={{background:INK}}>
        {glassCopied?"✓ Copied":"Copy order for supplier"}</button>
      </>)}
    </Sec>

    <Sec open={open} setOpen={setOpen} k="bar" title="Back bar & standard service" sub={extra.filter(e=>e.n).length?`${extra.filter(e=>e.n).length} lines`:"From the quote"}>
     {extra.map((e,i)=>(<div key={e.id} className="flex gap-2 mb-2">
       <select className={F} style={B} value={e.n} onChange={x=>{const v=x.target.value;
         if(v==="__new__"){setNewProd({apply:nm=>up("extra",p=>p.map((y,j)=>j===i?{...y,n:nm}:y))});return;}
         up("extra",p=>p.map((y,j)=>j===i?{...y,n:v}:y));}}>
        <option value="">Choose an item…</option>
        <option value="__new__">+ Product not in inventory…</option>
        {CATSX.map(c=>(<optgroup key={c} label={c}>{INVX.filter(y=>y.cat===c).map(y=>(<option key={y.n} value={y.n}>{y.n}</option>))}</optgroup>))}</select>
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
        {tab==="back"&&<div className="text-xs mt-1" style={{color:GOLD}}>took {out[r.n]??0} · used {Math.max(0,(out[r.n]??0)-(back[r.n]??0))}</div>}
        {tab==="out"&&<button onClick={()=>toggleBuy(r.n)} className="text-xs underline underline-offset-4 mt-1"
          style={{color:buy[r.n]!==undefined?GOLD:"#B5AFA4"}}>
          {buy[r.n]!==undefined?"on shopping list":"need to buy"}</button>}</div>
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
        <div className="text-xs text-neutral-500 mt-0.5 truncate">{r.uses.join(" · ")}</div>
        {tab==="out"&&<button onClick={()=>toggleBuy(r.n)} className="text-xs underline underline-offset-4 mt-1"
          style={{color:buy[r.n]!==undefined?GOLD:"#B5AFA4"}}>
          {buy[r.n]!==undefined?"on shopping list":"need to buy"}</button>}</div>
       <div className="flex items-center gap-1 shrink-0"><span className="text-lg text-neutral-400">£</span>
        <input inputMode="decimal" placeholder="0.00" value={gCost[r.n]??""} onChange={e=>{const v=e.target.value.replace(/[^0-9.]/g,"");up("gCost",p=>({...p,[r.n]:v}));}}
         className="w-20 h-14 text-center text-xl tabular-nums rounded-xl border bg-white outline-none" style={{borderColor:LINE,color:(gCost[r.n]&&parseFloat(gCost[r.n]))?GOLD:INK}}/></div></div>))}</section>}
    {!grp.length&&!gRows.length&&<div className="px-5 py-16 text-center text-neutral-400">Pick some drinks first.</div>}</div>}
  </main>

  {tab==="brief"&&<div className="fixed bottom-0 left-0 right-0 px-5 py-3 bg-white border-t" style={{borderColor:LINE}}>
   <div className="flex gap-2">
    <a href={`https://wa.me/?text=${encodeURIComponent(brief)}`} target="_blank" rel="noreferrer"
      className="flex-1 py-4 rounded-full text-white text-base font-medium text-center" style={{background:INK,textDecoration:"none"}}>
     Send on WhatsApp</a>
    <button onClick={()=>{navigator.clipboard?.writeText(brief);setBriefCopied(true);setTimeout(()=>setBriefCopied(false),2200);}}
      className="px-5 py-4 rounded-full border text-base shrink-0" style={{borderColor:INK,color:INK}}>
     {briefCopied?"✓":"Copy"}</button>
   </div></div>}
  {tab==="out"&&(shopCount>0||buyExtra.length>0)&&(
   <div className="mx-5 mt-4 mb-3 rounded-xl px-4 py-3" style={{background:"#FFFDF7",border:"1px solid "+GOLD}}>
    <div className="text-xs font-medium mb-2" style={{color:"#7a6300",letterSpacing:".08em"}}>
     SHOPPING LIST · {shopCount} ITEM{shopCount===1?"":"S"}
    </div>
    {Object.keys(buy).sort().map(n=>(
     <div key={n} className="flex items-center gap-2 py-1">
      <input inputMode="numeric" placeholder="qty" value={buy[n]}
        onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"");up("buy",p=>({...(p||{}),[n]:v}));}}
        className="w-14 h-9 text-center rounded-lg border tabular-nums shrink-0" style={{borderColor:"#E6E2DA"}}/>
      <span className="text-sm min-w-0 flex-1">{n}</span>
      <button onClick={()=>toggleBuy(n)} className="w-7 h-7 shrink-0 text-neutral-300 text-lg leading-none">×</button>
     </div>))}
    {buyExtra.map((x,i)=>(
     <div key={"bx"+i} className="flex items-center gap-2 py-1">
      <input inputMode="numeric" placeholder="qty" value={x.q||""}
        onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,"");up("buyExtra",p=>p.map((y,j)=>j===i?{...y,q:v}:y));}}
        className="w-14 h-9 text-center rounded-lg border tabular-nums shrink-0" style={{borderColor:GOLD,color:GOLD}}/>
      <input placeholder="Blue roll, ice, limes…" value={x.n||""}
        onChange={e=>{const v=e.target.value;up("buyExtra",p=>p.map((y,j)=>j===i?{...y,n:v}:y));}}
        className="min-w-0 flex-1 h-9 px-2 rounded-lg border text-sm" style={{borderColor:GOLD,color:GOLD}}/>
      <button onClick={()=>up("buyExtra",p=>p.filter((_,j)=>j!==i))} className="w-7 h-7 shrink-0 text-neutral-300 text-lg leading-none">×</button>
     </div>))}
    <button onClick={()=>up("buyExtra",p=>[...(p||[]),{n:"",q:""}])} className="text-sm underline underline-offset-4 mt-2" style={{color:GOLD}}>+ Add item</button>
    {/* wa.me opens WhatsApp with the list ready and lets you choose who gets
        it — a person or a group — without us storing any numbers. */}
    <div className="flex gap-2 mt-3">
     <a href={`https://wa.me/?text=${encodeURIComponent(shopList)}`} target="_blank" rel="noreferrer"
       className="flex-1 py-3 rounded-xl text-white text-sm font-medium text-center" style={{background:INK,textDecoration:"none"}}>
      Send on WhatsApp</a>
     <button onClick={()=>{navigator.clipboard?.writeText(shopList);setShopCopied(true);setTimeout(()=>setShopCopied(false),2200);}}
       className="px-4 py-3 rounded-xl border text-sm shrink-0" style={{borderColor:GOLD,color:GOLD}}>
      {shopCopied?"✓":"Copy"}</button>
    </div>
   </div>)}

  {tab==="out"&&!shopCount&&!buyExtra.length&&(
   <div className="mx-5 mt-4 mb-1 text-right">
    <button onClick={()=>up("buyExtra",p=>[...(p||[]),{n:"",q:""}])} className="text-xs underline underline-offset-4 text-neutral-400">
     + Start a shopping list</button>
   </div>)}

  {tab==="out"&&!!(E.requests||"").trim()&&(
   <div className="mx-5 mb-3 rounded-xl px-4 py-3" style={{background:"#FFF6F5",border:"1px solid #E8B4AE"}}>
    <div className="text-xs font-medium mb-1" style={{color:"#A8453A",letterSpacing:".08em"}}>CLIENT REQUESTS</div>
    <div className="text-sm whitespace-pre-wrap" style={{color:"#6B3833"}}>{E.requests}</div>
   </div>)}
  {tab==="out"&&outAll>0&&<div className="fixed bottom-0 left-0 right-0 px-5 py-3 bg-white border-t flex items-center justify-between" style={{borderColor:LINE}}>
   <span className="text-sm text-neutral-500">{outDone}/{outAll} lines loaded</span>
   <button onClick={()=>setTab("back")} className="px-5 py-3 rounded-full text-white text-sm font-medium" style={{background:GOLD}}>Van loaded</button></div>}
  {subFor&&(
    <SubstituteSheet
      drink={subFor}
      rows={subFor.ing.map((ing,i)=>({i,name:ing.n,current:pOf(subFor,i)}))
             .filter(r=>!rm[subFor.name]?.[r.i])}
      options={INVX}
      onPick={(i,name)=>{up("prod",p=>({...p,[subFor.name]:{...(p[subFor.name]||{}),[i]:name}}));setSubFor(null);}}
      onNew={i=>{const d=subFor;setSubFor(null);
        setNewProd({apply:nm=>up("prod",p=>({...p,[d.name]:{...(p[d.name]||{}),[i]:nm}}))});}}
      onCancel={()=>setSubFor(null)}/>)}
  {newProd&&<NewProductSheet onCancel={()=>setNewProd(null)} onSave={saveNewProduct}/>}
 </div>);
}

// Two steps: which ingredient, then what to pour instead. The per-ingredient
// dropdown does the same job, but it doesn't look like a substitute control —
// this is the same action with a name on it.
function SubstituteSheet({drink,rows,options,onPick,onNew,onCancel}){
 const [pick,setPick]=useState(null);
 const [q,setQ]=useState("");
 const F2="w-full h-12 px-3 rounded-xl border text-base";
 const B2={borderColor:"#E6E2DA"};
 const term=q.trim().toLowerCase();
 const list=options
  .filter(o=>!term||o.name.toLowerCase().includes(term))
  .slice(0,40);

 return (
  <div className="fixed inset-0 z-50 flex items-end" style={{background:"rgba(0,0,0,.35)"}}>
   <div className="w-full rounded-t-2xl bg-white p-5 pb-8" style={{maxHeight:"85vh",overflowY:"auto"}}>
    <div className="flex items-baseline justify-between mb-1">
     <div className="text-lg" style={{fontFamily:"'Cormorant Garamond',serif"}}>
      {pick===null?"Substitute":"Swap for"}</div>
     <button onClick={onCancel} className="text-sm text-neutral-400">Cancel</button>
    </div>
    <div className="text-xs text-neutral-400 mb-4">{drink.name}</div>

    {pick===null ? (
     rows.length
      ? rows.map(r=>(
         <button key={r.i} onClick={()=>{setPick(r.i);setQ("");}}
           className="w-full text-left py-3 border-b" style={{borderColor:"#F2F0EB"}}>
          <div className="text-base">{r.name}</div>
          <div className="text-xs text-neutral-400 mt-0.5">{r.current||"nothing linked"}</div>
         </button>))
      : <p className="text-sm text-neutral-400 py-4 text-center">Nothing left to substitute.</p>
    ) : (<>
     <button onClick={()=>setPick(null)} className="text-sm underline underline-offset-4 mb-3" style={{color:GOLD}}>← pick a different ingredient</button>
     <input autoFocus className={F2} style={B2} placeholder="Search stock…" value={q} onChange={e=>setQ(e.target.value)}/>
     <button onClick={()=>onNew(pick)} className="w-full text-left py-3 mt-2 text-sm" style={{color:"#7a6300"}}>
      + Product not in inventory…</button>
     {list.map(o=>(
      <button key={o.n} onClick={()=>onPick(pick,o.n)} className="w-full text-left py-3 border-b" style={{borderColor:"#F2F0EB"}}>
       <div className="text-base">{o.n}</div>
       {o.cat&&<div className="text-xs text-neutral-400 mt-0.5">{o.cat}</div>}
      </button>))}
     {!list.length&&<p className="text-sm text-neutral-400 py-4 text-center">Nothing matches — add it as a new product above.</p>}
    </>)}
   </div>
  </div>
 );
}

// Asked for whenever a picker hits something the inventory doesn't have.
// Deliberately short: name and category are required, price and size are not,
// because in a van you often know the bottle before you know what it cost.
function NewProductSheet({onSave,onCancel}){
 const [f,setF]=useState({n:"",cat:"Spirit",v:"700",uc:"",size:""});
 const set=(k,v)=>setF(p=>({...p,[k]:v}));
 const F2="w-full h-12 px-3 rounded-xl border text-base";
 const B2={borderColor:"#E6E2DA"};
 return (
  <div className="fixed inset-0 z-50 flex items-end" style={{background:"rgba(0,0,0,.35)"}}>
   <div className="w-full rounded-t-2xl bg-white p-5 pb-8" style={{maxHeight:"90vh",overflowY:"auto"}}>
    <div className="text-lg mb-4" style={{fontFamily:"'Cormorant Garamond',serif"}}>New product</div>

    <label className="block text-xs text-neutral-500 mb-1">Name</label>
    <input autoFocus className={F2} style={B2} placeholder="Courvoisier VS 70cl"
      value={f.n} onChange={e=>set("n",e.target.value)}/>

    <label className="block text-xs text-neutral-500 mb-1 mt-3">Category</label>
    <select className={F2} style={B2} value={f.cat} onChange={e=>set("cat",e.target.value)}>
     {["Spirit","Liqueur","Wine","Prosecco","Champagne","Beer","Mixer","Soft Drink","Garnish","Ice","Other"]
      .map(c=>(<option key={c}>{c}</option>))}
    </select>

    <div className="grid grid-cols-2 gap-2 mt-3">
     <div>
      <label className="block text-xs text-neutral-500 mb-1">Bottle size (ml)</label>
      <input inputMode="decimal" className={F2} style={B2} placeholder="700"
        value={f.v} onChange={e=>set("v",e.target.value.replace(/[^0-9.]/g,""))}/>
     </div>
     <div>
      <label className="block text-xs text-neutral-500 mb-1">Bottle cost (£)</label>
      <input inputMode="decimal" className={F2} style={B2} placeholder="optional"
        value={f.uc} onChange={e=>set("uc",e.target.value.replace(/[^0-9.]/g,""))}/>
     </div>
    </div>
    <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
     Leave the cost blank if you don't know it. The product still loads out and
     appears on the brief — it just won't add to the drink cost until it's priced.
    </p>

    <div className="flex gap-2 mt-5">
     <button onClick={onCancel} className="flex-1 h-12 rounded-xl border text-base" style={{borderColor:"#DDD8CE",color:"#6B6459"}}>Cancel</button>
     <button onClick={()=>onSave(f)} disabled={!f.n.trim()}
       className="flex-1 h-12 rounded-xl text-white text-base" style={{background:f.n.trim()?INK:"#C9C4BA"}}>Add</button>
    </div>
   </div>
  </div>
 );
}
