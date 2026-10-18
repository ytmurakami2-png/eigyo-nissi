/* ================= 定義 ================= */
const STYLES=["訪問","来社","電話","オンライン","出張"];
const PURPOSES=["新規","フォロー","契約","相談","その他"];
const EXP_CATS=["交通費","宿泊費","接待費","その他"];
const MODES=["新幹線","飛行機","電車","バス","タクシー","車"];
const NAMES={diary:"営業日誌",trip:"出張報告",exp:"出張旅費"};
const WD="日月火水木金土";
const TEMPLATE={
  company:"株式会社CSS", title:"出張旅費規程", effective:"",
  dayTrip:true, dayTripNote:"片道50km以上の日帰り出張に支給",
  transport:"実費（最も経済的な経路）。新幹線は普通車指定席まで", carRate:20,
  grades:[
   {name:"役員",dailyDay:3000,dailyStay:5000,lodging:15000,mode:"cap"},
   {name:"管理職",dailyDay:2000,dailyStay:3000,lodging:12000,mode:"cap"},
   {name:"一般",dailyDay:1500,dailyStay:2500,lodging:10000,mode:"cap"}],
  notes:""};

/* ================= 道具 ================= */
const pad=n=>String(n).padStart(2,"0");
const ds=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ds(new Date());
const daysBetween=(a,b)=>Math.round((new Date(b+"T00:00")-new Date(a+"T00:00"))/864e5);
const yen=n=>"¥"+Math.round(n||0).toLocaleString("ja-JP");
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const md=s=>s?Number(s.slice(5,7))+"/"+Number(s.slice(8)):"";
const clone=o=>o?JSON.parse(JSON.stringify(o)):o;
const $=id=>document.getElementById(id);

/* ================= 状態 ================= */
let me=null, email="", isAdmin=false, viewId=null, store={}, rules=null, members={};
const mode=Data.online?"db":"local";
let tab="rec", work=null, works=[], keepBlank=null; const addedIds=new Set();
let sel=today(), viewYm=today().slice(0,7), dateEdit=false, dePick=0;
let msg="", undo=null, retFor=null, retReason="", dump=null, saved="", pending=null;
let ruleDraft=null, stText="", stCls="";
let loginMode="in", loginMsg="", loginBusy=false, loginMail="", loginName="";
const timers={};

function loadPref(k,d){try{return JSON.parse(localStorage.getItem("eigyo-"+k))??d}catch(e){return d}}
function savePref(k,v){try{localStorage.setItem("eigyo-"+k,JSON.stringify(v))}catch(e){}}
function stamp(){const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes())}
function status(t,c){stText=t;stCls=c||"";const s=$("status");if(s){s.textContent=t;s.className="st "+stCls}}
function bucket(id){return store[id]||(store[id]={recs:{},appr:{},profile:{}})}
const R=()=>rules||TEMPLATE;
const myId=()=>me;
const showingId=()=>viewId||me;
const readOnly=()=>!!viewId&&viewId!==me;
const newRec=d=>({id:rid(),date:d||today(),end:"",client:"",style:"",purpose:"",note:"",dest:"",exps:[]});
const hasContent=r=>!!(r&&(r.client||r.note||r.style||r.purpose||r.dest||(r.exps||[]).length));
function recsOf(uid){return Object.values(bucket(uid).recs).filter(hasContent)}
function others(){return Object.keys(store).filter(id=>id!==me)}
function displayName(uid){const p=bucket(uid).profile;return p.name||p.email||(uid===me?"自分":"名前未設定")}

/* ================= 規程と計算 ================= */
function gradeOf(uid){const rr=R();if(!rr.grades||!rr.grades.length)return null;const g=members[uid];return rr.grades.find(x=>x.name===g)||rr.grades[rr.grades.length-1]}
const recDays=r=>r.end&&r.end>r.date?daysBetween(r.date,r.end)+1:1;
function expLine(x,uid){
  const n=Number(x.amount)||0; let claim=n,pay=n,warn="";
  if(x.cat==="交通費"){claim=pay=n*(x.round?2:1)}
  if(x.cat==="宿泊費"){const nt=Math.max(1,Number(x.nights)||1);claim=pay=n*nt;const g=gradeOf(uid);
    if(g&&g.mode==="flat"){pay=0;warn="定額支給のため集計外"}
    else if(g&&g.lodging&&n>g.lodging){pay=g.lodging*nt;warn="上限"+yen(g.lodging)+"/泊を超過"}}
  return{claim,pay,warn};
}
function autoFor(r,uid){
  if(r.style!=="出張")return[]; const g=gradeOf(uid); if(!g)return[];
  const n=recDays(r),nt=n-1,out=[];
  if(nt>0&&g.dailyStay)out.push({cat:"日当",label:`日当 ${yen(g.dailyStay)}×${n}日`,claim:g.dailyStay*n,pay:g.dailyStay*n});
  else if(nt===0&&R().dayTrip&&g.dailyDay)out.push({cat:"日当",label:"日帰り日当",claim:g.dailyDay,pay:g.dailyDay});
  if(g.mode==="flat"&&nt>0&&g.lodging)out.push({cat:"宿泊費",label:`宿泊料（定額）${yen(g.lodging)}×${nt}泊`,claim:g.lodging*nt,pay:g.lodging*nt});
  return out;
}
function recTotal(r,uid){return (r.exps||[]).reduce((a,x)=>a+expLine(x,uid).pay,0)+autoFor(r,uid).reduce((a,l)=>a+l.pay,0)}

/* ================= 保存 ================= */
const NOTE_TPL={"新規":c=>`${c||"お客様"}へ新規のご提案。\n提案内容：\n反応：\n次の一手：`,"フォロー":()=>`前回のご提案のその後を確認。\n状況：\n次の一手：`,"契約":()=>`契約の手続き。\n書類：\n残り：`,"相談":()=>`ご相談の内容：\n対応：`,"その他":()=>""};
function suggestNote(r){
  const past=recsOf(me).filter(x=>x.id!==r.id&&x.purpose===r.purpose&&x.note&&x.note!==x._lastSugg).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
  const same=r.client&&past.find(x=>x.client===r.client);
  if(same)return same.note;
  const cnt={};past.forEach(x=>{cnt[x.note]=(cnt[x.note]||0)+1});
  const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
  if(top&&top[1]>=2)return top[0];
  return (NOTE_TPL[r.purpose]||(()=>""))(r.client);
}
function touch(){if(work)work._dirty=true;savePref("works",{sel,works:works.filter(w=>w._dirty)})}
function saveRec(r){
  if(readOnly())return;
  const b=bucket(me);
  if(!hasContent(r)&&!b.recs[r.id])return;
  if(!r.createdAt)r.createdAt=Date.now();
  r.updatedAt=Date.now(); b.recs[r.id]=r;
  clearTimeout(timers[r.id]); status("保存中…");
  timers[r.id]=setTimeout(async()=>{
    try{await Data.saveRec(b.recs,clone(b.recs[r.id]||r));delete timers[r.id];status(mode==="db"?"保存済み "+stamp():"この端末に保存 "+stamp(),mode==="db"?"":"warn")}
    catch(e){delete timers[r.id];status("保存できませんでした。電波を確かめてください","warn")}
  },450);
}
async function removeRec(id){
  delete bucket(me).recs[id]; clearTimeout(timers[id]); delete timers[id];
  try{await Data.deleteRec(bucket(me).recs,id);status("削除しました")}catch(e){status("削除できませんでした","warn")}
}
function saveProfile(p){
  Object.assign(bucket(me).profile,p);
  clearTimeout(timers.profile);timers.profile=setTimeout(async()=>{try{await Data.saveProfile(bucket(me).profile);status("保存済み "+stamp())}catch(e){status("保存できませんでした","warn")}},500);
}
async function saveRules(r){
  try{await Data.saveSetting("rules",{...r,updatedAt:Date.now()});rules=r;ruleDraft=null;status("規程を保存しました")}
  catch(e){status("規程を保存できません（管理者のみ）","warn")}
  render();
}
async function saveMembers(){try{await Data.saveSetting("members",{map:members});status("保存しました")}catch(e){status("保存できませんでした","warn")}}

/* ================= よく使う物 ================= */
function mine(){return recsOf(me).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))}
function recentClients(){const s=new Set();mine().forEach(r=>{if(r.client)s.add(r.client)});return[...s].slice(0,6)}
function recentDests(){const s=new Set();mine().forEach(r=>{if(r.dest)s.add(r.dest)});return[...s].slice(0,5)}

/* ================= 承認 ================= */
// 承認の記録。差し戻しも同じ場所に returned 付きで置く
const apprOf=(uid,id)=>{const a=(bucket(uid).appr||{})[id];return a&&!a.returned?a:undefined};
const retOf=(uid,r)=>{const a=(bucket(uid).appr||{})[r.id];return a&&a.returned&&!((r.submittedAt||0)>a.at)?a:null};
const isLocked=(uid,r)=>!!(r&&apprOf(uid,r.id)&&!isAdmin);
async function setApproval(uid,id,on){
  if(!isAdmin||mode!=="db")return;
  const b=bucket(uid);
  const doc=on==="ret"?{returned:true,reason:retReason||"",by:me,at:Date.now()}:on?{by:me,at:Date.now()}:null;
  if(doc)b.appr[id]=doc;else delete b.appr[id];
  renderDay();
  try{await Data.setApproval(uid,id,doc);status("更新しました")}catch(e){status("更新できませんでした","warn")}
}

/* ================= 帯（カレンダー） ================= */
function covers(r,s){return r.date<=s&&(r.end&&r.end>r.date?r.end:r.date)>=s}
function dayRecs(uid,s){return recsOf(uid).filter(r=>covers(r,s)).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))}
function calHTML(){
  const[y,m]=viewYm.split("-").map(Number),lead=new Date(y,m-1,1).getDay(),n=new Date(y,m,0).getDate(),prevN=new Date(y,m-1,0).getDate();
  let c=[...WD].map((w,i)=>`<em class="${i===0?"su":""}">${w}</em>`).join("");
  for(let i=lead-1;i>=0;i--)c+=`<span>${prevN-i}</span>`;
  for(let i=1;i<=n;i++){const s=`${y}-${pad(m)}-${pad(i)}`,dw=new Date(s+"T00:00").getDay();
    const w=work,inr=w&&w.end&&s>w.date&&s<w.end,isEnd=w&&w.end&&s===w.end;
    c+=`<button type="button" data-day="${s}" class="${s===sel||isEnd?"on":""} ${inr?"in":""} ${s===today()?"today":""} ${dw===0?"su":dw===6?"sa":""}">${i}</button>`}
  return `<div class="month"><div class="ym"><span class="y num">${y}</span><span class="m num">${m}</span><small>月</small></div>
    <div class="arws"><button type="button" class="arw" data-vm="-1" aria-label="前の月">‹</button><button type="button" class="arw" data-vm="1" aria-label="次の月">›</button></div></div>
    <div class="cal${dateEdit?" edit":""}">${c}</div>`;
}
function renderBand(title){
  let h=`<div class="in"><div class="brand"><b>営業日誌</b><span class="st ${stCls}" id="status">${esc(stText)}</span></div>`;
  if(title)h+=`<div class="htitle">${esc(title)}</div>`;
  else{
    if(tab==="rec"&&isAdmin&&others().length)h+=`<select class="who" id="who" aria-label="表示する人"><option value="">自分の記録</option>${others().map(id=>`<option value="${esc(id)}" ${viewId===id?"selected":""}>${esc(displayName(id))} の記録</option>`).join("")}</select>`;
    h+=tab==="rec"?calHTML():`<div class="htitle">${tab==="out"?"出力":"設定"}</div>`;
  }
  $("band").innerHTML=h+`</div>`;
}

/* ================= その日の記録 ================= */
function syncWorks(){
  const uid=showingId(),rs=dayRecs(uid,sel),ro=readOnly();
  const old=works;
  const out=rs.filter(r=>{const w=old.find(x=>x.id===r.id);return ro||!(w&&w._dirty&&!covers(w,sel))}).map(r=>{const w=old.find(x=>x.id===r.id);return w&&w._dirty&&!ro?w:clone(r)});
  const drafts=ro?[]:old.filter(w=>!out.some(o=>o.id===w.id)&&covers(w,sel)&&(w._dirty||!bucket(uid).recs[w.id]));
  works=[...out,...drafts.filter(w=>hasContent(w)||!out.length||w===keepBlank)];
  if(!works.length&&!ro)works=[newRec(sel)];
  if(!works.includes(work))work=works[0]||null;
}
function dayHTML(){
  const d=new Date(sel+"T00:00"),w=work,rng=w&&w.end&&w.end>w.date&&covers(w,sel);
  let h=`<div class="day"><span class="d num">${d.getMonth()+1}.${pad(d.getDate())}</span><span class="w">${WD[d.getDay()]}曜日${rng?`〜${md(w.end)}（${WD[new Date(w.end+"T00:00").getDay()]}）`:""}</span><span class="grow"></span>`;
  if(!readOnly()&&w&&!isLocked(showingId(),w))h+=`<button type="button" class="rnd${dateEdit?" fill":""}" id="dateEdit">${dateEdit?"決定":"日付を変える"}</button>`;
  h+=`</div>`;
  if(dateEdit)h+=`<p class="hint">上のカレンダーで日付を押してください（泊まりは終わりの日も）</p>`;
  if(readOnly()&&!works.length)return h+`<p class="empty">${esc(displayName(showingId()))} さんのこの日の記録はありません。</p>`;
  const shown=works.filter((x,i)=>i===0||addedIds.has(x.id)||!bucket(showingId()).recs[x.id]);
  if(!shown.includes(work))work=shown[0]||null;
  h+=shown.map(x=>formHTML(x,works.indexOf(x))).join("");
  if(!readOnly())h+=`<button type="button" class="more" id="addRec">＋ 記録を追加</button>`;
  return h;
}
const uniq=(html,i)=>html.replace(/(id|for)="(fc|fn|fd|x[ftkna]\d+)"/g,`$1="$2-${i}"`);
function seg(list,key,val,cls){return `<div class="seg ${cls||""}">${list.map(p=>`<button type="button" data-pill="${key}" data-v="${p}" aria-pressed="${val===p}">${p}</button>`).join("")}</div>`}
function formHTML(r,idx){
  const uid=showingId(),ap=apprOf(uid,r.id),locked=readOnly()||!!ap;
  const exists=!!bucket(uid).recs[r.id];
  const rt=!ap&&exists?retOf(uid,r):null;
  const ink=ap?'<div class="inkan">承認</div>':rt?'<div class="inkan ng">差戻し</div>':exists?'<div class="inkan wait">申請中</div>':"";
  let h=`<section class="card" data-w="${idx}"><div class="chead"><h2>記録</h2>${ink}</div><fieldset ${locked?"disabled":""}>`;
  const rc=!r.client&&!locked?recentClients():[];
  h+=`<div class="f"><label for="fc">訪問先</label><input type="text" id="fc" data-k="client" value="${esc(r.client)}" placeholder="会社名・お名前" autocomplete="off">${rc.length?`<div class="chips">${rc.map(c=>`<button type="button" data-fillc="${esc(c)}">${esc(c)}</button>`).join("")}</div>`:""}</div>`;
  h+=`<div class="f"><span class="lbl">形式</span>${seg(STYLES,"style",r.style)}</div>`;
  h+=`<div class="f"><span class="lbl">目的</span>${seg(PURPOSES,"purpose",r.purpose)}</div>`;
  h+=`<div class="f"><label for="fn">内容</label><textarea id="fn" data-k="note">${esc(r.note)}</textarea>${r.note&&r.note===r._lastSugg&&!locked?`<p class="hint">よく使う書き方を下書きとして入れました。書き換えてください。</p>`:""}</div>`;
  if(r.style==="出張")h+=tripHTML(r,locked);
  h+=`</fieldset>`;
  if(rt&&rt.reason)h+=`<p class="notebox">差し戻し：${esc(rt.reason)}</p>`;
  const adm=isAdmin&&mode==="db"&&exists?(ap?`<button type="button" class="link" data-unappr="${r.id}">承認を取り消す</button>`:rt?"":`<button type="button" class="ok" data-appr="${r.id}">承認</button><button type="button" class="back" data-ret="${r.id}">差し戻し</button>`):"";
  if(!locked)h+=`<div class="acts"><button type="button" class="go" id="submit">申請</button>${exists||works.length>1?`<button type="button" class="link del" id="delRec">削除</button>`:""}</div>`;
  if(adm)h+=`<div class="acts">${adm}</div>`;
  if(adm&&retFor===r.id)h+=`<div class="f"><input type="text" id="retReason" placeholder="差し戻しの理由" autocomplete="off"></div>`;
  if(r===work&&msg)h+=`<p class="hint">${esc(msg)}</p>`;
  return uniq(h+`</section>`,idx);
}
function tripHTML(r,ro){
  const uid=showingId(),n=recDays(r),g=gradeOf(uid);
  let h=`<div class="trip"><h3>出張旅費<span>${n>1?`${n-1}泊${n}日`:"日帰り"}${g?`・${esc(g.name)}の規程${rules?"":"（仮）"}`:""}</span></h3>`;
  const dests=recentDests().filter(t=>t!==r.dest);
  h+=`<div class="f"><label for="fd">行き先</label><input type="text" id="fd" data-k="dest" value="${esc(r.dest)}" placeholder="例：大阪" autocomplete="off">${!ro&&dests.length&&!r.dest?`<div class="chips">${dests.map(t=>`<button type="button" data-dest="${esc(t)}">${esc(t)}</button>`).join("")}</div>`:""}</div>`;
  h+=autoFor(r,uid).map(a=>`<div class="line"><span>${esc(a.label)}<small>規程で自動</small></span><b class="num">${yen(a.pay)}</b></div>`).join("");
  (r.exps||[]).forEach((x,i)=>{const l=expLine(x,uid);
    h+=`<div class="xbox"><div class="xhead"><span>${esc(x.cat||"旅費")}</span>${ro?"":`<button type="button" class="x" data-xdel="${i}">削除</button>`}</div>
     <div class="f"><span class="lbl">区分</span>${seg(EXP_CATS,"xc"+i,x.cat)}</div>
     ${x.cat==="交通費"?`<div class="f"><span class="lbl">交通手段</span>${seg(MODES,"xm"+i,x.mode,"sm")}</div>
       <div class="row2"><div class="f"><label for="xf${i}">出発</label><input type="text" id="xf${i}" data-xi="${i}" data-xk="from" value="${esc(x.from)}" autocomplete="off"></div><div class="f"><label for="xt${i}">到着</label><input type="text" id="xt${i}" data-xi="${i}" data-xk="to" value="${esc(x.to)}" autocomplete="off"></div></div>
       <label class="toggle"><input type="checkbox" data-xi="${i}" data-xk="round" ${x.round?"checked":""}>往復</label>
       ${x.mode==="車"&&R().carRate?`<div class="f"><label for="xk${i}">走行距離（km・片道）</label><input type="number" inputmode="decimal" id="xk${i}" data-xi="${i}" data-xk="km" value="${esc(x.km)}"><p class="hint">1km ${yen(R().carRate)}で金額を自動計算</p></div>`:""}`:""}
     ${x.cat==="宿泊費"?`<div class="f"><label for="xn${i}">泊数</label><input type="number" inputmode="numeric" id="xn${i}" data-xi="${i}" data-xk="nights" value="${esc(x.nights||Math.max(1,recDays(r)-1))}" min="1"></div>`:""}
     <div class="f"><label for="xa${i}">金額${x.cat==="交通費"?"（片道）":x.cat==="宿泊費"?"（1泊）":""}</label><div class="yen"><input type="number" inputmode="numeric" id="xa${i}" data-xi="${i}" data-xk="amount" value="${esc(x.amount)}"></div><p class="calc ${l.warn?"warn":""}" data-calc="${i}">${calcStr(x)}</p></div></div>`});
  if(!ro)h+=`<button type="button" class="add" data-addx="1">＋ 旅費を追加</button>`;
  h+=`<div class="sum"><span>合計</span><b class="num" data-sum>${yen(recTotal(r,uid))}</b></div>`;
  return h+`</div>`;
}
function calcStr(x){const l=expLine(x,showingId());if(!x.amount)return"";return l.warn?`${l.warn}　精算 ${yen(l.pay)}（申請 ${yen(l.claim)}）`:(x.round||(x.cat==="宿泊費"&&x.nights>1)?`計 ${yen(l.claim)}`:"")}

/* ================= 描画 ================= */
function grow(t){t.style.height="auto";t.style.height=Math.min(t.scrollHeight+2,320)+"px"}
function renderTabs(){$("tabs").innerHTML=[["rec","記録"],["out","出力"],["set","設定"]].map(([k,l])=>`<button type="button" data-tab="${k}" aria-current="${k===tab}">${l}</button>`).join("");$("nav").hidden=false}
function renderDay(){
  if(tab!=="rec")return;
  syncWorks();const m=$("main");m.innerHTML=dayHTML();m.querySelectorAll("textarea[data-k]").forEach(grow);renderBand();
}
function renderForm(){const i=works.indexOf(work),el=document.querySelector(`[data-w="${i}"]`);if(!el){renderDay();return}const t=document.createElement("div");t.innerHTML=formHTML(work,i);const n=t.firstElementChild;el.replaceWith(n);n.querySelectorAll("textarea[data-k]").forEach(grow)}
function activeBox(){return document.querySelector(`[data-w="${works.indexOf(work)}"]`)||document}
// 書いている途中の欄は消さない
function renderList(){const a=document.activeElement;if(tab!=="rec"){if(!ruleDraft&&!(a&&/INPUT|TEXTAREA/.test(a.tagName)))render();return}
  if(a&&/INPUT|TEXTAREA/.test(a.tagName)&&a.type!=="checkbox")renderBand();else renderDay()}
function refreshHead(){const box=activeBox();if(box===document)return;const t=document.createElement("div");t.innerHTML=formHTML(work,works.indexOf(work));
  [".chead",".acts"].forEach(s=>{const nh=t.querySelector(s),oh=box.querySelector(s);if(nh&&oh)oh.replaceWith(nh)})}
function renderUndo(){const u=$("undo");u.innerHTML=undo?`<span>${esc(undo.label)}を削除しました</span><button type="button" id="undoBtn">元に戻す</button>`:"";u.hidden=!undo}
function render(){
  if(!me){renderLogin();return}
  renderTabs();
  if(tab==="rec"){renderDay()}
  else{renderBand();$("main").innerHTML=tab==="out"?outHTML():setHTML()}
  renderUndo();
}
function setUndo(label,fn){clearTimeout(timers.undo);undo={label,fn};timers.undo=setTimeout(()=>{undo=null;renderUndo()},6000)}
function submitWork(){
  const r=work; if(!hasContent(r)){msg="訪問先か内容を入れてから申請してください。";renderForm();return}
  if(apprOf(me,r.id)){msg="承認済みのため変更できません。";renderForm();return}
  const x=clone(r); delete x._dirty; delete x._lastSugg; x.submittedAt=Date.now(); saveRec(x); r.submittedAt=x.submittedAt;
  delete r._dirty; msg=""; savePref("works",{sel,works:works.filter(w=>w._dirty)}); status("申請しました"); renderForm(); renderBand();
}

/* ================= 出力 ================= */
// 月の初め（5日まで）は前の月、それ以外は今月を最初に出す
function defYm(){const d=new Date();if(d.getDate()<=5)d.setDate(0);return ds(d).slice(0,7)}
let outP={from:"",to:"",...loadPref("period",{kind:"month"}),ym:defYm(),y:defYm().slice(0,4)};
let outKind=loadPref("okind","report"), outFmt="pdf", outScope="me", outBusy=false;
const KINDS={report:["営業報告書",["diary","trip","exp"]],exp:["旅費精算書",["exp"]],diary:["営業日誌の一覧",["diary"]]};
function lastDay(y,m){return new Date(y,m,0).getDate()}
function periodRange(){
  if(outP.kind==="year")return[`${outP.y}-01-01`,`${outP.y}-12-31`];
  if(outP.kind==="range"){const a=outP.from||today(),z=outP.to||a;return a<=z?[a,z]:[z,a]}
  const[y,m]=outP.ym.split("-").map(Number);return[`${outP.ym}-01`,`${outP.ym}-${pad(lastDay(y,m))}`];
}
function periodLabel(){
  if(outP.kind==="year")return `${outP.y}年`;
  if(outP.kind==="range"){const[a,z]=periodRange();return `${a.replace(/-/g,"/")}〜${z.replace(/-/g,"/")}`}
  return outP.ym.replace("-","年")+"月";
}
function periodTag(){const[a,z]=periodRange();return outP.kind==="month"?outP.ym.replace("-",""):outP.kind==="year"?outP.y:a.replace(/-/g,"")+"-"+z.replace(/-/g,"")}
function rangeRecs(uid){const[a,z]=periodRange();return recsOf(uid).filter(r=>r.date>=a&&r.date<=z).sort((x,y)=>x.date.localeCompare(y.date)||(x.createdAt||0)-(y.createdAt||0))}
function expMonth(uid){
  const lines=[],auto=[];
  rangeRecs(uid).forEach(r=>{(r.exps||[]).forEach(x=>{if(x.amount||x.cat)lines.push({r,x,...expLine(x,uid)})});autoFor(r,uid).forEach(a=>auto.push({r,...a}))});
  const all=[...lines,...auto],by={};all.forEach(l=>{const c=(l.x?l.x.cat:l.cat)||"未分類";by[c]=(by[c]||0)+l.pay});
  return{lines,auto,by,claim:all.reduce((a,l)=>a+l.claim,0),pay:all.reduce((a,l)=>a+l.pay,0),count:all.length};
}
function targets(){if(isAdmin&&outScope==="all")return Object.keys(store);return[me]}
function outHTML(){
  const[y,m]=outP.ym.split("-").map(Number);
  let ctrl="";
  if(outP.kind==="month")ctrl=`<div class="mnav"><button type="button" class="arw" data-pm="-1" aria-label="前の月">‹</button><b class="num">${y}.${pad(m)}</b><button type="button" class="arw" data-pm="1" aria-label="次の月">›</button></div>`;
  if(outP.kind==="year")ctrl=`<div class="mnav"><button type="button" class="arw" data-py="-1" aria-label="前の年">‹</button><b class="num">${outP.y}</b><button type="button" class="arw" data-py="1" aria-label="次の年">›</button></div>`;
  if(outP.kind==="range")ctrl=`<div class="row2"><div class="f"><label for="pf">開始日</label><input type="date" id="pf" data-pr="from" value="${esc(outP.from)}"></div><div class="f"><label for="pt">終了日</label><input type="date" id="pt" data-pr="to" value="${esc(outP.to)}"></div></div>`;
  const tg=targets(),multi=tg.length>1;
  return `<section class="card">
   <div class="f"><span class="lbl">期間</span><div class="seg">${[["month","月"],["year","年"],["range","期間を指定"]].map(([k,v])=>`<button type="button" data-pk="${k}" aria-pressed="${outP.kind===k}">${v}</button>`).join("")}</div>${ctrl}</div>
   ${isAdmin&&others().length?`<div class="f"><span class="lbl">対象</span><div class="seg"><button type="button" data-os="me" aria-pressed="${outScope==="me"}">自分</button><button type="button" data-os="all" aria-pressed="${outScope==="all"}">全員</button></div></div>`:""}
   <div class="f"><span class="lbl">中身</span><div class="seg">${[["diary","活動の一覧"],["exp","金額の一覧"],["report","報告書"]].map(([k,v])=>`<button type="button" data-ok="${k}" aria-pressed="${outKind===k}">${v}</button>`).join("")}</div></div>
   <div class="f"><span class="lbl">保存</span><div class="seg">${[["pdf","PDF"],["xlsx","Excel"],["csv","CSV"]].map(([k,v])=>`<button type="button" data-save="${k}" ${outBusy?"disabled":""}>${outBusy===k?"作成中…":v}</button>`).join("")}</div></div>
   ${pending?`<button type="button" class="wide" id="sharePending">${esc(pending.file.name)} を保存する</button>`:""}
   ${saved?`<p class="notebox ok">${esc(saved)}</p>`:""}
  </section>
  ${KINDS[outKind][1].includes("diary")?previewDiary(tg,multi):""}${KINDS[outKind][1].includes("exp")?previewExp(tg,multi):""}
  ${dump?`<section class="card"><p class="hint">${esc(dump.msg)}</p><textarea class="dump" readonly>${esc(dump.text)}</textarea><button type="button" class="ghost" id="copyDump">中身をコピー</button></section>`:""}`;
}
function previewDiary(ids,multi){
  const rows=ids.flatMap(u=>rangeRecs(u).map(r=>({u,r})));
  return `<section class="card"><div class="ohead"><h2>活動の一覧</h2><b class="num">${rows.length}<small style="font-size:15px">件</small></b></div>${rows.length?`<div>${rows.map(({u,r})=>`<div class="row"><span class="dt num">${md(r.date)}${r.end&&r.end>r.date?"<br>〜"+md(r.end):""}</span><span class="t"><b>${esc(r.client||(r.dest?r.dest+"出張":"―"))}</b><small>${esc([multi?displayName(u):"",r.style,r.purpose].filter(Boolean).join("・"))}${r.note?"　"+esc(r.note.split("\n")[0]):""}</small></span><span></span></div>`).join("")}</div>`:`<p class="empty">この期間の記録はありません。</p>`}</section>`;
}
function previewExp(ids,multi){
  let tot=0;const rows=ids.flatMap(u=>{const r=rowsFor("exp",u);tot+=r.m.pay;return r.rows.map(x=>({u,x}))}).sort((a,b)=>String(a.x[1]).localeCompare(String(b.x[1])));
  return `<section class="card"><div class="ohead"><h2>金額の一覧</h2><b class="num">${yen(tot)}</b></div>${rows.length?`<div>${rows.map(({u,x})=>`<div class="row"><span class="dt num">${md(x[1])}</span><span class="t"><b>${esc(x[2])}${x[12]?"（"+esc(x[12])+"）":""}</b><small>${esc([multi?displayName(u):"",x[3],x[4]||x[5]?x[4]+"→"+x[5]:"",x[6]].filter(Boolean).join(" "))}</small></span><span class="y num">${yen(x[10])}</span></div>`).join("")}</div>`:`<p class="empty">この期間の旅費はありません。</p>`}</section>`;
}
function rowsFor(type,uid){
  const who=displayName(uid), rs=rangeRecs(uid);
  if(type==="diary")return{head:["氏名","日付","終了日","訪問先","形式","目的","内容"],rows:rs.map(r=>[who,r.date,r.end||"",r.client,r.style,r.purpose,r.note])};
  if(type==="trip")return{head:["氏名","出発日","帰着日","泊数","行き先","訪問先","内容"],rows:rs.filter(r=>r.style==="出張").map(r=>[who,r.date,r.end||r.date,recDays(r)-1,r.dest,r.client,r.note])};
  const m=expMonth(uid);
  const rows=[...m.lines.map(({r,x,claim,pay,warn})=>[who,r.date,x.cat,x.mode,x.from,x.to,x.round?"往復":"",x.cat==="宿泊費"?(x.nights||1):"",Number(x.amount)||0,claim,pay,[warn,x.km?x.km+"km":""].filter(Boolean).join(" "),r.dest]),
    ...m.auto.map(a=>[who,a.r.date,a.cat,"","","","","","",a.claim,a.pay,"規程で自動："+a.label,a.r.dest])].sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
  return{head:["氏名","日付","区分","交通手段","出発","到着","往復","泊数","単価","申請額","精算額","備考","出張先"],rows,m};
}
const q=v=>{v=String(v??"");return /[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
function csvText(type,ids){
  let head=null,rows=[],tail=[];
  ids.forEach(uid=>{const r=rowsFor(type,uid);head=r.head;rows.push(...r.rows);
    if(type==="exp"){tail.push([],[displayName(uid)+" 区分別"]);Object.entries(r.m.by).forEach(([k,v])=>tail.push(["",k,"","","","","","","","",v]));tail.push([displayName(uid)+" 合計","","","","","","","","",r.m.claim,r.m.pay])}});
  if(!head)head=rowsFor(type,me).head;
  return [head,...rows,...tail].map(r=>r.map(q).join(",")).join("\r\n");
}
function textOut(types,ids){
  const L=[];
  ids.forEach(uid=>{L.push(`■ ${displayName(uid)}　${periodLabel()}`);
    types.forEach(t=>{const r=rowsFor(t,uid);
      if(t==="exp"){L.push(`【出張旅費】精算 ${yen(r.m.pay)}`);r.rows.forEach(x=>L.push(`　${md(x[1])} ${x[2]} ${yen(x[10])}`))}
      if(t==="diary"){L.push("【営業日誌】");r.rows.forEach(x=>L.push(`・${md(x[1])} ${x[3]||""} ${[x[4],x[5]].filter(Boolean).join("・")} ${(x[6]||"").replace(/\n/g," ")}`))}
      if(t==="trip"){L.push("【出張報告】");r.rows.forEach(x=>L.push(`・${md(x[1])}〜${md(x[2])} ${x[4]||""}（${x[3]}泊）`))}});L.push("")});
  return L.join("\n");
}
/* ---------- 報告書（PDF） ---------- */
function reportHTML(types,ids){
  const co=esc(R().company||"株式会社CSS"), made=today().replace(/-/g,"/");
  const th=`style="border:1px solid #9aa3b2;background:#e6ecf3;padding:5px 6px;font-size:10.5px;text-align:left;font-weight:700"`;
  const td=`style="border:1px solid #c3c9d4;padding:5px 6px;font-size:10.5px;vertical-align:top"`;
  const tdn=`style="border:1px solid #c3c9d4;padding:5px 6px;font-size:10.5px;text-align:right;white-space:nowrap"`;
  const sec=t=>`<h2 style="font-size:14px;margin:18px 0 8px;padding:4px 8px;border-left:4px solid #1a3a5b;background:#f1f3f6">${t}</h2>`;
  let out="";
  ids.forEach(uid=>{
    const rs=rangeRecs(uid), m=expMonth(uid), trips=rs.filter(r=>r.style==="出張");
    const cnt=k=>{const o={};rs.forEach(r=>{if(r[k])o[r[k]]=(o[r[k]]||0)+1});return Object.entries(o).map(([a,b])=>`${a} ${b}件`).join("　")||"―"};
    let h=`<div style="font-family:'Hiragino Sans','Yu Gothic','Meiryo',sans-serif;color:#151a22;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1a3a5b;padding-bottom:8px">
        <div><div style="font-size:22px;font-weight:700;letter-spacing:.08em">${esc(KINDS[outKind][0])}</div><div style="font-size:12px;margin-top:4px">対象期間：${esc(periodLabel())}</div></div>
        <div style="text-align:right;font-size:11px;line-height:1.7">${co}<br>氏名：${esc(displayName(uid))}${bucket(uid).profile.dept?"（"+esc(bucket(uid).profile.dept)+"）":""}<br>作成日：${made}</div></div>`;
    if(types.length>1){
      h+=sec("概要")+`<table style="border-collapse:collapse;width:100%;table-layout:fixed"><colgroup><col style="width:110px"><col><col style="width:80px"><col></colgroup><tr><th ${th}>記録の件数</th><td ${td}>${rs.length}件</td><th ${th}>出張</th><td ${td}>${trips.length}回・${trips.reduce((a,r)=>a+recDays(r),0)}日</td></tr>
        <tr><th ${th}>形式別</th><td ${td} colspan="3">${esc(cnt("style"))}</td></tr><tr><th ${th}>目的別</th><td ${td} colspan="3">${esc(cnt("purpose"))}</td></tr>
        <tr><th ${th}>旅費の精算額</th><td ${td} colspan="3"><b>${yen(m.pay)}</b>　${Object.entries(m.by).map(([k,v])=>`${esc(k)} ${yen(v)}`).join("　")}</td></tr></table>`;
    }
    if(types.includes("diary")){
      h+=sec("営業日誌")+`<table style="border-collapse:collapse;width:100%"><tr><th ${th} width="78">日付</th><th ${th} width="130">訪問先</th><th ${th} width="90">形式・目的</th><th ${th}>内容</th></tr>
        ${rs.map(r=>`<tr><td ${td}>${md(r.date)}${r.end&&r.end>r.date?"〜"+md(r.end):""}</td><td ${td}>${esc(r.client||"―")}</td><td ${td}>${esc([r.style,r.purpose].filter(Boolean).join("・"))}</td><td ${td}>${esc(r.note).replace(/\n/g,"<br>")}</td></tr>`).join("")||`<tr><td ${td} colspan="4">記録はありません</td></tr>`}</table>`;
    }
    if(types.includes("trip")&&types.length>1){
      h+=sec("出張報告")+`<table style="border-collapse:collapse;width:100%"><tr><th ${th} width="110">期間</th><th ${th} width="80">行き先</th><th ${th} width="120">訪問先</th><th ${th}>内容</th><th ${th} width="80">旅費</th></tr>
        ${trips.map(r=>`<tr><td ${td}>${md(r.date)}〜${md(r.end||r.date)}<br>${recDays(r)>1?`${recDays(r)-1}泊${recDays(r)}日`:"日帰り"}</td><td ${td}>${esc(r.dest||"―")}</td><td ${td}>${esc(r.client||"―")}</td><td ${td}>${esc(r.note).replace(/\n/g,"<br>")}</td><td ${tdn}>${yen(recTotal(r,uid))}</td></tr>`).join("")||`<tr><td ${td} colspan="5">出張はありません</td></tr>`}</table>`;
    }
    if(types.includes("exp")){
      const r=rowsFor("exp",uid);
      h+=sec("旅費精算明細")+`<table style="border-collapse:collapse;width:100%"><tr><th ${th} width="52">日付</th><th ${th} width="58">区分</th><th ${th}>内容</th><th ${th} width="78">申請額</th><th ${th} width="78">精算額</th></tr>
        ${r.rows.map(x=>`<tr><td ${td}>${md(x[1])}</td><td ${td}>${esc(x[2])}</td><td ${td}>${esc([x[3],x[4]||x[5]?x[4]+"→"+x[5]:"",x[6],x[7]?x[7]+"泊":"",x[11],x[12]?"（"+x[12]+"）":""].filter(Boolean).join(" "))}</td><td ${tdn}>${yen(x[9])}</td><td ${tdn}>${yen(x[10])}</td></tr>`).join("")||`<tr><td ${td} colspan="5">旅費はありません</td></tr>`}
        <tr><th ${th} colspan="3" style="text-align:right">合計</th><td ${tdn}><b>${yen(r.m.claim)}</b></td><td ${tdn}><b>${yen(r.m.pay)}</b></td></tr></table>
        <p style="font-size:10px;color:#5a6371;margin:6px 0 0">${R()===TEMPLATE?"※旅費規程が未設定のため、日当・宿泊上限はひな形の金額で計算しています。":"※日当・宿泊上限は出張旅費規程により計算しています。"}</p>`;
    }
    h+=`<table style="border-collapse:collapse;margin:22px 0 0 auto"><tr><th ${th} style="text-align:center;width:90px">申請者</th><th ${th} style="text-align:center;width:90px">承認</th></tr><tr><td style="border:1px solid #9aa3b2;height:64px"></td><td style="border:1px solid #9aa3b2"></td></tr></table></div>`;
    out+=h;
  });
  return out;
}
function loadScript(src){return new Promise((ok,ng)=>{if(document.querySelector(`script[src="${src}"]`))return ok();const s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=ng;document.head.appendChild(s)})}
async function pdfBlob(types,ids){
  await loadScript("vendor/html2pdf.bundle.min.js");
  // 画面の外に置いた枠の中身だけを渡す（枠ごと渡すと白紙になる）。1人ずつ描き、長い時は細かさを下げてスマホの描画上限に収める
  const box=document.createElement("div");box.style.cssText="position:fixed;left:-10000px;top:0";
  const tmp=document.createElement("div");tmp.innerHTML=reportHTML(types,ids);
  const parts=[...tmp.children].map(el=>{const d=document.createElement("div");d.style.cssText="width:700px;background:#fff";d.appendChild(el);box.appendChild(d);return d});
  document.body.appendChild(box);
  const opt=h=>({margin:[12,12,14,12],image:{type:"jpeg",quality:.95},html2canvas:{scale:Math.max(.8,Math.min(2,Math.sqrt(15e6/(703*(h*1.1+200))))),backgroundColor:"#ffffff"},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},pagebreak:{mode:["css","avoid-all"]}});
  try{let w=html2pdf().set(opt(parts[0].scrollHeight)).from(parts[0]).toPdf();
    parts.slice(1).forEach(d=>{w=w.get("pdf").then(pdf=>{pdf.addPage()}).set(opt(d.scrollHeight)).from(d).toContainer().toCanvas().toPdf()});
    return await w.outputPdf("blob")}
  finally{box.remove()}
}
async function xlsxBlob(types,ids){
  await loadScript("vendor/xlsx.full.min.js");
  const wb=XLSX.utils.book_new();
  types.forEach(t=>{let aoa=[];
    if(t==="exp"){ids.forEach(uid=>{const r=rowsFor("exp",uid),g=gradeOf(uid);
      aoa.push([`出張旅費精算書　${periodLabel()}`],[R().company||"",`氏名：${displayName(uid)}`,`等級：${g?g.name:"―"}`],[],["精算額",r.m.pay,"申請額",r.m.claim]);
      Object.entries(r.m.by).forEach(([k,v])=>aoa.push([k,v]));aoa.push([],r.head.slice(1));r.rows.forEach(x=>aoa.push(x.slice(1)));aoa.push([],["申請者印","","承認印"],[],[])})}
    else{const all=ids.map(uid=>rowsFor(t,uid));aoa=[all[0].head];all.forEach(r=>aoa.push(...r.rows))}
    const ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=Array.from({length:14},(_,i)=>({wch:i===0?12:(t!=="exp"&&i>=5)?40:13}));
    XLSX.utils.book_append_sheet(wb,ws,NAMES[t])});
  return new Blob([XLSX.write(wb,{bookType:"xlsx",type:"array"})],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
// iPhone は共有画面から「"ファイル"に保存」。作るのに時間がかかって共有画面が開けない時は、もう一度押してもらう
async function share(file,fallback){
  try{
    if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file]})}
    else{const a=document.createElement("a");a.href=URL.createObjectURL(file);a.download=file.name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}
    pending=null;saved=`${file.name} を保存しました。`;status("保存しました");
  }catch(e){
    if(e&&e.name==="AbortError"){pending=null;status("保存をやめました")}
    else if(e&&e.name==="NotAllowedError"&&!pending){pending={file,fallback}}
    else{pending=null;dump={msg:`保存できませんでした（${e&&e.name||"不明"}）。中身をここに出しました。`,text:fallback||""}}
  }
  render();
}
async function doOutput(){
  const ids=targets(),types=KINDS[outKind][1],name=KINDS[outKind][0],tag=periodTag()+(ids.length>1?"_全員":"_"+displayName(ids[0]));
  dump=null;saved="";pending=null;outBusy=outFmt;render();status("作成中…");
  let file=null,fb="";
  try{
    if(outFmt==="pdf"){fb=textOut(types,ids);file=new File([await pdfBlob(types,ids)],`${name}_${tag}.pdf`,{type:"application/pdf"})}
    else if(outFmt==="csv"){const c=types.length>1?types.map(t=>`【${NAMES[t]}】\r\n`+csvText(t,ids)).join("\r\n\r\n"):csvText(types[0],ids);fb=c;file=new File(["﻿"+c],`${name}_${tag}.csv`,{type:"text/csv"})}
    else{fb=types.map(t=>csvText(t,ids)).join("\n\n");file=new File([await xlsxBlob(types,ids)],`${name}_${tag}.xlsx`,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})}
  }catch(e){dump={msg:"作成できなかったため、文章で出しました。",text:textOut(types,ids)};status("作成できませんでした","warn")}
  outBusy=false;
  if(file)await share(file,fb);else render();
}

/* ================= 設定 ================= */
function setHTML(){
  const p=bucket(me).profile,g=gradeOf(me);
  let h=`<section class="card"><h2>自分の情報</h2>
   <div class="f"><label for="p_name">氏名（帳票に載ります）</label><input type="text" id="p_name" data-prof="name" value="${esc(p.name||"")}" placeholder="例：村上 晃之"></div>
   <div class="f"><label for="p_dept">部署</label><input type="text" id="p_dept" data-prof="dept" value="${esc(p.dept||"")}"></div>
   <p class="hint">旅費の等級：${g?esc(g.name):"―"}${rules?"":"（旅費規程が未設定のため、ひな形の金額で計算しています）"}</p></section>`;
  h+=ruleHTML(); if(isAdmin&&mode==="db")h+=membersHTML();
  if(mode==="db")h+=`<section class="card"><h2>アカウント</h2><p class="hint">${esc(email)}</p><button type="button" class="ghost" id="logout" style="align-self:flex-start">ログアウト</button></section>`;
  else h+=`<p class="notebox">いまはこの端末だけに保存しています。</p>`;
  return h;
}
function ruleHTML(){
  const canEdit=isAdmin||mode!=="db";
  if(ruleDraft&&canEdit){const r=ruleDraft;
    return `<section class="card"><h2>旅費規程を直す</h2>
     <div class="row2"><div class="f"><label for="r_company">会社名</label><input type="text" id="r_company" data-rule="company" value="${esc(r.company)}"></div><div class="f"><label for="r_eff">施行日</label><input type="date" id="r_eff" data-rule="effective" value="${esc(r.effective)}"></div></div>
     <div class="f"><label for="r_tr">交通費の決まり</label><input type="text" id="r_tr" data-rule="transport" value="${esc(r.transport)}"></div>
     <div class="f"><label for="r_car">自家用車の単価（1kmあたり）</label><div class="yen"><input type="number" inputmode="numeric" id="r_car" data-rule="carRate" value="${esc(r.carRate||"")}"></div></div>
     <label class="toggle" for="r_dt"><input type="checkbox" id="r_dt" data-rule="dayTrip" ${r.dayTrip?"checked":""}>日帰り出張にも日当を出す</label>
     ${r.dayTrip?`<div class="f"><label for="r_dtn">日帰り日当の条件</label><input type="text" id="r_dtn" data-rule="dayTripNote" value="${esc(r.dayTripNote)}"></div>`:""}
     <span class="lbl">等級ごとの金額</span>${r.grades.map((g,i)=>`<div class="grade">
       <div class="xhead"><input type="text" class="gname" aria-label="等級名" data-g="${i}" data-gk="name" value="${esc(g.name)}"><button type="button" class="x" data-gdel="${i}">外す</button></div>
       <div class="row2"><div class="f"><label for="g${i}s">日当（泊まり・1日）</label><div class="yen"><input type="number" inputmode="numeric" id="g${i}s" data-g="${i}" data-gk="dailyStay" value="${g.dailyStay}"></div></div>
       <div class="f"><label for="g${i}d">日当（日帰り）</label><div class="yen"><input type="number" inputmode="numeric" id="g${i}d" data-g="${i}" data-gk="dailyDay" value="${g.dailyDay}"></div></div></div>
       <div class="f"><label for="g${i}l">宿泊料（1泊）</label><div class="yen"><input type="number" inputmode="numeric" id="g${i}l" data-g="${i}" data-gk="lodging" value="${g.lodging}"></div></div>
       <div class="seg"><button type="button" data-gmode="${i}" data-v="cap" aria-pressed="${g.mode==="cap"}">実費（上限）</button><button type="button" data-gmode="${i}" data-v="flat" aria-pressed="${g.mode==="flat"}">定額で支給</button></div>
     </div>`).join("")}<button type="button" class="add" id="gadd">＋ 等級を足す</button>
     <div class="f"><label for="r_notes">その他の定め</label><textarea id="r_notes" data-rule="notes">${esc(r.notes)}</textarea></div>
     <div class="acts"><button type="button" class="go" id="rsave">保存</button><button type="button" class="link" id="rcancel">やめる</button></div></section>`;}
  let h=`<section class="card"><h2>出張旅費規程</h2>`;
  const rr=rules||TEMPLATE;
  h+=`<p class="hint">${esc(rr.company||"")}　${esc(rr.title||"出張旅費規程")}${rr.effective?"（"+esc(rr.effective)+" 施行）":""}${rules?"":"　ひな形の金額"}</p>
    <div class="tbl"><table><tr><th>等級</th><th>日当</th><th>日帰り</th><th>宿泊</th></tr>${rr.grades.map(g=>`<tr><td>${esc(g.name)}</td><td class="n">${yen(g.dailyStay)}</td><td class="n">${rr.dayTrip?yen(g.dailyDay):"―"}</td><td class="n">${yen(g.lodging)}<small style="font-family:var(--jp);font-size:11px">${g.mode==="flat"?" 定額":" 上限"}</small></td></tr>`).join("")}</table></div>
    <p class="hint">交通費：${esc(rr.transport||"")}${rr.carRate?`／自家用車 1kmあたり ${yen(rr.carRate)}`:""}</p>`;
  h+=`<div class="btnrow">${canEdit?`<button type="button" class="ghost" id="ruleEdit">規程を直す</button>`:""}<button type="button" class="ghost" id="ruleDoc">Wordで書き出す</button></div>`;
  return h+`</section>`;
}
function membersHTML(){
  const ids=Object.keys(store);
  return `<section class="card"><h2>社員と等級</h2>
   <div class="tbl"><table>${ids.map(id=>`<tr><td>${esc(displayName(id))}${id===me?"（自分）":""}</td><td style="text-align:right"><select data-member="${esc(id)}" aria-label="等級">${R().grades.map(g=>`<option ${(members[id]||R().grades[R().grades.length-1].name)===g.name?"selected":""}>${esc(g.name)}</option>`).join("")}</select></td></tr>`).join("")}</table></div>
   <p class="hint">社員にはこのアプリのアドレスを送り、「はじめて使う」から登録してもらってください。</p></section>`;
}
function ruleDocHTML(r){
  const art=[];let n=1;const A=(t,b)=>art.push(`<h3>第${n++}条（${t}）</h3><p>${b}</p>`);
  A("目的",`この規程は、${esc(r.company)}の役員および従業員が業務のため出張する場合の旅費の支給について定める。`);
  A("旅費の種類","旅費は、交通費、日当および宿泊料とする。");
  A("交通費",esc(r.transport)+"を支給する。"+(r.carRate?`業務で自家用車を使用した場合は、走行距離1kmにつき${Number(r.carRate)}円を支給する。`:""));
  A("日当","日当は出張の日数に応じ、別表の額を支給する。"+(r.dayTrip?"日帰り出張については、"+esc(r.dayTripNote)+"として別表の日帰り日当を支給する。":"日帰り出張には日当を支給しない。"));
  A("宿泊料","宿泊料は宿泊の夜数に応じ、別表の額を"+(r.grades.every(g=>g.mode==="flat")?"定額で支給する。":"上限として実費を支給する（定額と定めた等級は定額を支給する）。"));
  A("精算","出張者は出張終了後、所定の方法で旅費を申請し、承認を受けて精算する。");
  if(r.notes)A("その他",esc(r.notes).replace(/\n/g,"<br>"));
  A("施行",`この規程は${r.effective?esc(r.effective.replace(/^(\d+)-(\d+)-(\d+)$/,(m,y,mo,d)=>`${y}年${Number(mo)}月${Number(d)}日`)):"　　年　月　日"}から施行する。`);
  return art.join("");
}
/* Word（.docx）で書き出す。中身を組み立てて固める */
function ruleDocx(r){
  const x=t=>String(t??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const P=(t,o={})=>`<w:p><w:pPr>${o.c?'<w:jc w:val="center"/>':""}<w:spacing w:before="${o.b||0}" w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:eastAsia="游明朝"/>${o.bold?"<w:b/>":""}<w:sz w:val="${o.sz||21}"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r></w:p>`;
  const body=[P(r.title||"出張旅費規程",{c:1,bold:1,sz:32})];
  ruleDocHTML(r).replace(/<h3>(.*?)<\/h3><p>(.*?)<\/p>/g,(m,h,t)=>{const un=v=>String(v||"").replace(/<br>/g,"\n").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");
    body.push(P(un(h),{bold:1,b:200}));un(t).split("\n").forEach(l=>body.push(P(l)))});
  body.push(P("別表",{bold:1,b:200}));
  const cell=t=>`<w:tc><w:p><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r></w:p></w:tc>`;
  const rows=[["等級","日当（1日）",...(r.dayTrip?["日帰り日当"]:[]),"宿泊料（1泊）"],...r.grades.map(g=>[g.name,yen(g.dailyStay),...(r.dayTrip?[yen(g.dailyDay)]:[]),`${yen(g.lodging)}（${g.mode==="flat"?"定額":"上限"}）`])];
  const bd=["top","left","bottom","right","insideH","insideV"].map(k=>`<w:${k} w:val="single" w:sz="4" w:color="999999"/>`).join("");
  body.push(`<w:tbl><w:tblPr><w:tblBorders>${bd}</w:tblBorders><w:tblW w:w="0" w:type="auto"/></w:tblPr>${rows.map(rw=>`<w:tr>${rw.map(cell).join("")}</w:tr>`).join("")}</w:tbl>`);
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1418" w:bottom="1701" w:left="1418" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  return zipBlob({"[Content_Types].xml":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels":`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml":doc},"application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}
function zipBlob(files,type){
  const T=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;T[n]=c>>>0}
  const crc=b=>{let c=0xFFFFFFFF;for(const v of b)c=T[(c^v)&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0};
  const te=new TextEncoder(),out=[],cen=[];let off=0;
  const u16=v=>[v&255,v>>8&255],u32=v=>[v&255,v>>8&255,v>>16&255,v>>>24&255];
  for(const[name,text]of Object.entries(files)){const nm=te.encode(name),d=te.encode(text),c=crc(d);
    const h=[...u32(0x04034b50),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(d.length),...u32(d.length),...u16(nm.length),...u16(0)];
    out.push(new Uint8Array(h),nm,d);
    cen.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(d.length),...u32(d.length),...u16(nm.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nm);
    off+=h.length+nm.length+d.length}
  const cs=cen.reduce((a,b)=>a+b.length,0),n=Object.keys(files).length;
  return new Blob([...out,...cen,new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(n),...u16(n),...u32(cs),...u32(off),...u16(0)])],{type});
}

/* ================= ログイン ================= */
function renderLogin(){
  $("nav").hidden=true;
  renderBand(loginMode==="in"?"ログイン":"はじめて使う");
  $("main").innerHTML=`<form class="card login" id="loginForm" novalidate>
    ${loginMode==="up"?`<div class="f"><label for="l_name">お名前</label><input type="text" id="l_name" autocomplete="name" placeholder="例：村上 晃之" value="${esc(loginName)}"></div>`:""}
    <div class="f"><label for="l_mail">メールアドレス</label><input type="email" id="l_mail" autocomplete="email" inputmode="email" value="${esc(loginMail)}"></div>
    <div class="f"><label for="l_pw">パスワード</label><input type="password" id="l_pw" autocomplete="${loginMode==="up"?"new-password":"current-password"}"></div>
    ${loginMsg?`<p class="notebox">${esc(loginMsg)}</p>`:""}
    <div class="acts"><button type="submit" class="go" ${loginBusy?"disabled":""}>${loginMode==="in"?"ログイン":"登録"}</button></div>
    <button type="button" class="link" id="loginSwitch">${loginMode==="in"?"はじめて使う方はこちら":"登録済みの方はログイン"}</button>
  </form>`;
}
function authMsg(e){const m=String(e&&e.message||"");
  if(/Invalid login/i.test(m))return"メールアドレスかパスワードが違います。";
  if(/already registered/i.test(m))return"このメールアドレスは登録済みです。ログインしてください。";
  if(/Password should be/i.test(m))return"パスワードは6文字以上にしてください。";
  if(/Email not confirmed/i.test(m))return"届いた確認メールのリンクを押してから、ログインしてください。";
  if(/fetch|network/i.test(m))return"つながりません。電波を確かめてください。";
  return"うまくいきませんでした（"+m+"）";
}
async function doLogin(){
  const mail=$("l_mail").value.trim(),pw=$("l_pw").value,name=$("l_name")?$("l_name").value.trim():"";loginMail=mail;loginName=name;
  if(!mail||!pw||(loginMode==="up"&&!name)){loginMsg="すべての欄を入れてください。";renderLogin();return}
  loginBusy=true;loginMsg="";renderLogin();
  try{
    const id=loginMode==="in"?await Data.signIn(mail,pw):await Data.signUp(mail,pw,name);
    loginBusy=false;
    if(!id){loginMode="in";loginMsg="確認メールを送りました。メールのリンクを押してから、ログインしてください。";renderLogin();return}
    me=id;email=mail;await start();
  }catch(e){loginBusy=false;loginMsg=authMsg(e);renderLogin()}
}

/* ================= 操作 ================= */
/* ---------- カレンダーをなぞって複数日を選ぶ ---------- */
let drag=null, suppressClick=false;
function dayAt(x,y){const el=document.elementFromPoint(x,y);const b=el&&el.closest&&el.closest(".cal button[data-day]");return b?b.dataset.day:null}
function paintDrag(){const[a,z]=[drag.start,drag.end].sort();document.querySelectorAll(".cal button[data-day]").forEach(b=>{const s=b.dataset.day;b.classList.toggle("on",s===a||s===z);b.classList.toggle("in",s>a&&s<z)})}
document.addEventListener("pointerdown",ev=>{const b=ev.target.closest&&ev.target.closest(".cal button[data-day]");if(!b||readOnly()||!work||!dateEdit)return;drag={start:b.dataset.day,end:b.dataset.day,moved:false}});
document.addEventListener("pointermove",ev=>{if(!drag)return;const s=dayAt(ev.clientX,ev.clientY);if(s&&s!==drag.end){drag.end=s;drag.moved=true;paintDrag()}});
document.addEventListener("pointerup",()=>{if(!drag)return;const d=drag;drag=null;if(!d.moved)return;
  suppressClick=true;setTimeout(()=>{suppressClick=false},350);
  const[a,z]=[d.start,d.end].sort();const r=work;
  r.date=a;r.end=z>a?z:"";sel=a;viewYm=a.slice(0,7);dateEdit=false;dePick=0;touch();renderDay()});
document.addEventListener("pointercancel",()=>{if(drag){drag=null;renderBand()}});
document.addEventListener("submit",ev=>{if(ev.target.id==="loginForm"){ev.preventDefault();if(!loginBusy)doLogin()}});
document.addEventListener("click",ev=>{
  if(suppressClick&&ev.target.closest&&ev.target.closest(".cal")){suppressClick=false;return}
  const b=ev.target.closest("button"); if(!b||b.disabled)return; const D=b.dataset;
  if(b.id==="loginSwitch"){loginMode=loginMode==="in"?"up":"in";loginMsg="";renderLogin();return}
  const box=b.closest("[data-w]"); if(box&&works[+box.dataset.w]&&works[+box.dataset.w]!==work){work=works[+box.dataset.w];msg=""}
  if(D.tab){tab=D.tab;dump=null;dateEdit=false;render();scrollTo(0,0);return}
  if(b.id==="dateEdit"){dateEdit=!dateEdit;dePick=0;renderDay();if(dateEdit)scrollTo({top:0,behavior:"smooth"});return}
  // 日付を変えている時：1回目で始めの日、2回目で終わりの日（同じ日なら1日だけ）
  if(D.day&&dateEdit&&work){const s=D.day,r=work;
    if(!dePick||s<r.date){r.date=s;r.end="";dePick=1}
    else{r.end=s>r.date?s:"";dateEdit=false;dePick=0}
    sel=r.date;touch();renderDay();return}
  if(D.day){sel=D.day;msg="";
    works.forEach(w=>{if(!bucket(me).recs[w.id]&&!hasContent(w))w.date=sel});
    if(work&&!bucket(me).recs[work.id]&&work._dirty&&hasContent(work)){work.end="";work.date=sel;touch()}
    renderDay();return}
  if(D.vm){const[y,m]=viewYm.split("-").map(Number);const d=new Date(y,m-1+Number(D.vm),1);viewYm=d.getFullYear()+"-"+pad(d.getMonth()+1);renderBand();return}
  if(D.appr){setApproval(showingId(),D.appr,true);return}
  if(D.unappr){setApproval(showingId(),D.unappr,false);return}
  if(D.ret){if(retFor!==D.ret){retFor=D.ret;renderForm();const t=$("retReason");if(t)t.focus();return}
    const t=$("retReason");retReason=t?t.value.trim():"";retFor=null;setApproval(showingId(),D.ret,"ret");return}
  if(b.id==="submit"){submitWork();return}
  if(b.id==="addRec"){const n=newRec(sel);works.push(n);work=n;keepBlank=n;addedIds.add(n.id);msg="";renderDay();const el=document.querySelector(`[data-w="${works.length-1}"]`);if(el)el.scrollIntoView({behavior:"smooth",block:"start"});return}
  if(b.id==="undoBtn"&&undo){undo.fn();undo=null;render();return}
  // 出力
  if(D.pk){outP.kind=D.pk;if(D.pk==="range"&&!outP.from){outP.from=outP.ym+"-01";outP.to=outP.ym+"-"+pad(lastDay(+outP.ym.slice(0,4),+outP.ym.slice(5)))}savePref("period",outP);render();return}
  if(D.pm){const[y,m]=outP.ym.split("-").map(Number);const d=new Date(y,m-1+Number(D.pm),1);outP.ym=d.getFullYear()+"-"+pad(d.getMonth()+1);render();return}
  if(D.py){outP.y=String(Number(outP.y)+Number(D.py));render();return}
  if(D.ok){outKind=D.ok;saved="";savePref("okind",outKind);render();return}
  if(D.save){outFmt=D.save;doOutput();return}
  if(D.os){outScope=D.os;render();return}
  if(b.id==="sharePending"&&pending){const p=pending;share(p.file,p.fallback);return}
  if(b.id==="copyDump"){navigator.clipboard.writeText(dump.text).then(()=>status("コピーしました"),()=>document.querySelector(".dump").select());return}
  // 設定
  if(b.id==="logout"){Data.signOut().finally(()=>{me=null;store={};works=[];work=null;viewId=null;tab="rec";render()});return}
  if(b.id==="ruleEdit"){ruleDraft=clone(R());render();return}
  if(b.id==="rcancel"){ruleDraft=null;render();return}
  if(b.id==="rsave"){saveRules(ruleDraft);return}
  if(b.id==="gadd"){ruleDraft.grades.push({name:"新しい等級",dailyStay:0,dailyDay:0,lodging:0,mode:"cap"});render();return}
  if(D.gdel){ruleDraft.grades.splice(Number(D.gdel),1);render();return}
  if(D.gmode){ruleDraft.grades[Number(D.gmode)].mode=D.v;render();return}
  if(b.id==="ruleDoc"){const r=R();share(new File([ruleDocx(r)],`${r.title||"出張旅費規程"}.docx`,{type:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}),ruleDocHTML(r).replace(/<[^>]+>/g,"\n").replace(/\n+/g,"\n"));return}
  // 記録
  if(readOnly())return;
  const r=work; if(!r||isLocked(showingId(),r))return;
  if(D.pill){
    if(D.pill==="style"||D.pill==="purpose"){const k=D.pill;r[k]=r[k]===D.v?"":D.v;
      if(k==="purpose"&&(!String(r.note||"").trim()||r.note===r._lastSugg)){const sg=r.purpose?suggestNote(r):"";r.note=sg;r._lastSugg=sg}
      touch();renderDay();return}
    const i=Number(D.pill.slice(2)),x=r.exps[i];
    if(D.pill.startsWith("xc"))x.cat=D.v; else x.mode=x.mode===D.v?"":D.v;
    touch();renderForm();return}
  if(D.fillc!==undefined){r.client=D.fillc;touch();renderForm();return}
  if(D.dest!==undefined){r.dest=D.dest;touch();renderForm();return}
  if(D.addx){r.exps.push({cat:"交通費",mode:"",from:"",to:"",round:false,amount:"",nights:Math.max(1,recDays(r)-1)});touch();renderForm();return}
  if(D.xdel){const i=Number(D.xdel),x=r.exps.splice(i,1)[0];touch();setUndo("旅費",()=>{r.exps.splice(i,0,x);touch()});renderForm();renderUndo();return}
  if(b.id==="delRec"){const sv=bucket(me).recs[r.id];works=works.filter(w=>w!==r);work=works[0]||null;
    if(sv){const copy=clone(sv);removeRec(r.id);setUndo(copy.client||"記録",()=>{bucket(me).recs[copy.id]=copy;saveRec(copy)})}
    renderDay();renderUndo();return}
});
document.addEventListener("input",ev=>{
  const el=ev.target,D=el.dataset;
  if(D.prof){saveProfile({[D.prof]:el.value});return}
  if(D.rule&&ruleDraft){ruleDraft[D.rule]=el.type==="checkbox"?el.checked:(D.rule==="carRate"?Number(el.value)||0:el.value);if(el.type==="checkbox")render();return}
  if(D.g&&ruleDraft){ruleDraft.grades[Number(D.g)][D.gk]=D.gk==="name"?el.value:Number(el.value)||0;return}
  if(readOnly())return;
  const box=el.closest("[data-w]"); if(box&&works[+box.dataset.w])work=works[+box.dataset.w];
  const r=work; if(!r||apprOf(me,r.id))return;
  const wasDirty=!!r._dirty;
  if(D.k){r[D.k]=el.value;if(el.tagName==="TEXTAREA")grow(el);
    // 下書きのままなら、訪問先を変えた時に下書きも入れ直す
    if(D.k==="client"&&r.purpose&&r.note&&r.note===r._lastSugg){const sg=suggestNote(r);r.note=r._lastSugg=sg;const t=activeBox().querySelector('textarea[data-k="note"]');if(t){t.value=sg;grow(t)}}
    touch();if(!wasDirty)refreshHead();return}
  if(D.xk){const i=Number(D.xi),x=r.exps[i];
    if(el.type==="checkbox"){x[D.xk]=el.checked;touch();renderForm();return}
    x[D.xk]=el.type==="number"?(el.value===""?"":Number(el.value)):el.value;
    if(D.xk==="km"&&R().carRate){x.amount=Math.round((Number(el.value)||0)*R().carRate);const a=activeBox().querySelector(`[data-xi="${i}"][data-xk="amount"]`);if(a)a.value=x.amount}
    const c=activeBox().querySelector(`[data-calc="${i}"]`);if(c){c.textContent=calcStr(x);c.className="calc"+(expLine(x,me).warn?" warn":"")}
    touch();const tt=activeBox().querySelector("[data-sum]");if(tt)tt.textContent=yen(recTotal(r,me));if(!wasDirty)refreshHead();return}
});
document.addEventListener("change",ev=>{
  const el=ev.target;
  if(el.id==="who"){viewId=el.value||null;works=[];work=null;render();return}
  if(el.dataset.pr){outP[el.dataset.pr]=el.value;savePref("period",outP);render();return}
  if(el.dataset.member){members[el.dataset.member]=el.value;saveMembers();render();return}
});

/* ================= 起動 ================= */
async function reload(){
  try{
    const d=await Data.loadAll();
    isAdmin=d.isAdmin;rules=d.rules;members=d.members||{};
    const next={};
    new Set([...Object.keys(d.profiles),...Object.keys(d.recs),me]).forEach(uid=>{next[uid]={recs:d.recs[uid]||{},appr:d.appr[uid]||{},profile:d.profiles[uid]||{}}});
    // まだ送っていない自分の書きかけは残す
    if(store[me]){const loc=store[me].recs,fr=next[me].recs;for(const id in loc){if(timers[id]||(fr[id]&&(loc[id].updatedAt||0)>(fr[id].updatedAt||0)))fr[id]=loc[id]}}
    store=next;
    if(!stText||stText==="読み込み中…")status(mode==="db"?"保存済み":"この端末に保存",mode==="db"?"":"warn");
  }catch(e){status("読み込めませんでした","warn")}
}
let reloadT=null;
function remoteChanged(){clearTimeout(reloadT);reloadT=setTimeout(async()=>{await reload();renderList()},400)}
async function start(){
  status("読み込み中…");
  const o=loadPref("works",null);if(o&&o.works&&o.works.length){works=o.works;sel=o.sel||sel;viewYm=sel.slice(0,7)}
  if(mode==="db"){try{const n=await Data.moveLocal();if(n)status(`この端末の記録${n}件を引き継ぎました`)}catch(e){}}
  await reload();render();
  Data.watch(remoteChanged);
}
(async function boot(){
  if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&me)remoteChanged()});
  let s={me:null};try{s=await Data.session()}catch(e){}
  me=s.me;email=s.email||"";
  if(!me){renderLogin();return}
  await start();
})();
