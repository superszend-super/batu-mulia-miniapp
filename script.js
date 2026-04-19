const tg = window.Telegram.WebApp;
tg.expand(); tg.ready();
const SUPABASE_URL = 'https://qfinqcjjajivyjhwysbau.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmaW5xY2pqYWl2eWpod3lzYmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzAyMjcsImV4cCI6MjA5MjEwNjIyN30.BwxcBSUrE6Q5BQ3RkRqUCCysI_f5vJVo28gDSx8t0PY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser=null, playerData=null, mejaSlots=[], cooldownInterval=null;

async function init(){
    const user=tg.initDataUnsafe?.user;
    if(!user){ document.getElementById('loading').innerHTML='<p>❌ Buka dari bot Telegram</p>'; return; }
    currentUser=user;
    document.getElementById('username').textContent=user.first_name;
    await loadPlayerData(); await loadMeja();
    document.getElementById('loading').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    startCooldownTimer();
}
async function loadPlayerData(){
    const {data}=await supabase.from('players').select('*').eq('user_id',currentUser.id).single();
    if(data){ playerData=data; updateResourceDisplay(); }
}
function updateResourceDisplay(){
    if(playerData){
        document.getElementById('balance').textContent=formatStonid(playerData.balance_stonid);
        document.getElementById('batuMentah').textContent=playerData.batu_mentah;
    }
}
async function loadMeja(){
    const {data}=await supabase.from('meja_gerinda').select('*').eq('user_id',currentUser.id).order('slot_number');
    mejaSlots=new Array(5).fill(null); if(data)data.forEach(s=>mejaSlots[s.slot_number-1]=s);
    renderMeja();
}
async function getCooldown(gerindaId){
    const {data}=await supabase.from('gerinda_cooldown').select('*').eq('gerinda_id',gerindaId).single();
    return data;
}
function renderMeja(){
    const grid=document.getElementById('slotGrid'); grid.innerHTML='';
    for(let i=0;i<5;i++){
        const slot=mejaSlots[i], card=document.createElement('div'); card.className='slot-card';
        if(!slot){ card.classList.add('empty'); card.innerHTML='<div class="slot-icon">⬜</div><div class="slot-durability">Kosong</div>'; card.onclick=()=>buyGerindaSlot(i+1); }
        else {
            getCooldown(slot.id).then(cd=>{
                if(cd&&cd.status==='cooldown'){ card.classList.add('cooldown'); const end=new Date(cd.end_time), now=new Date(), rem=Math.max(0,Math.floor((end-now)/1000)); card.innerHTML=`<div class="slot-icon">⏳</div><div class="slot-durability">${slot.durability}/50</div><div class="slot-status">${formatTime(rem)}</div>`; }
                else { card.classList.add('idle'); card.innerHTML=`<div class="slot-icon">🔧</div><div class="slot-durability">${slot.durability}/50</div><div class="slot-status">Siap</div>`; }
                card.onclick=()=>selectSlot(i+1,slot);
            });
        }
        grid.appendChild(card);
    }
}
async function selectSlot(slotNum,slot){
    if(!slot){ buyGerindaSlot(slotNum); return; }
    const cd=await getCooldown(slot.id);
    if(cd&&cd.status==='cooldown'){ document.getElementById('actionPanel').innerHTML=`<p>⏳ Cooldown: ${formatTime(Math.max(0,Math.floor((new Date(cd.end_time)-new Date())/1000)))}</p>`; return; }
    if(playerData.batu_mentah<1){ document.getElementById('actionPanel').innerHTML='<p>❌ Tidak punya batu mentah</p>'; return; }
    document.getElementById('actionPanel').innerHTML=`<p>🔧 Slot ${slotNum} [${slot.durability}/50]</p><button onclick="pecahBatu('${slot.id}')" style="padding:12px 24px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;">⛏️ PECAH</button>`;
}
async function pecahBatu(gerindaId){
    const {data:gerinda}=await supabase.from('meja_gerinda').select('*').eq('id',gerindaId).single();
    if(!gerinda)return;
    const cd=await getCooldown(gerindaId); if(cd&&cd.status==='cooldown'){ alert('Cooldown!'); return; }
    if(playerData.batu_mentah<1){ alert('Tidak punya batu mentah!'); return; }
    await supabase.from('players').update({batu_mentah:playerData.batu_mentah-1}).eq('user_id',currentUser.id);
    const newDur=gerinda.durability-1;
    if(newDur<=0){ await supabase.from('meja_gerinda').delete().eq('id',gerindaId); await supabase.from('gerinda_cooldown').delete().eq('gerinda_id',gerindaId); }
    else { await supabase.from('meja_gerinda').update({durability:newDur}).eq('id',gerindaId); const now=new Date(), end=new Date(now.getTime()+10*60*1000); await supabase.from('gerinda_cooldown').upsert({gerinda_id:gerindaId,user_id:currentUser.id,status:'cooldown',start_time:now.toISOString(),end_time:end.toISOString()}); }
    const hasil=[];
    for(let i=0;i<2;i++){ const t=rollBatu(), d=rollDamaged(t); hasil.push({type:t,damaged:d}); const {data:exist}=await supabase.from('inventory').select('*').eq('user_id',currentUser.id).eq('item_type','batu').eq('batu_type',t).eq('is_damaged',d).single(); if(exist) await supabase.from('inventory').update({quantity:exist.quantity+1}).eq('id',exist.id); else await supabase.from('inventory').insert({user_id:currentUser.id,item_type:'batu',batu_type:t,is_damaged:d,quantity:1}); }
    await loadPlayerData(); await loadMeja();
    document.getElementById('actionPanel').innerHTML=`<p>✅ Gerinda bekerja! 10 menit</p><p>${hasil.map(b=>{const e={merah:'🔴',silver:'⚪',lapis:'🔵',berlian:'💎'}[b.type]; return e+' '+b.type+(b.damaged?'⚠️':'');}).join(', ')}</p>`;
    tg.HapticFeedback.impactOccurred('medium');
}
function rollBatu(){ const r=Math.random()*100, c={merah:88,silver:10,lapis:1.999,berlian:0.001}; let cum=0; for(let [b,v] of Object.entries(c)){ cum+=v; if(r<cum)return b; } return 'merah'; }
function rollDamaged(t){ const r={merah:0.3,silver:0.3,lapis:0.3,berlian:0.5}; return Math.random()<(r[t]||0.3); }
async function buyGerindaSlot(slotNum){
    const empty=mejaSlots.findIndex(s=>s===null)+1; if(empty===0){ alert('Meja penuh!'); return; }
    if(playerData.balance_stonid<10000){ alert('Saldo tidak cukup!'); return; }
    await supabase.rpc('deduct_stonid',{p_user_id:currentUser.id,p_amount:10000});
    await supabase.from('meja_gerinda').insert({user_id:currentUser.id,slot_number:empty,durability:50,max_durability:50});
    await loadPlayerData(); await loadMeja(); tg.HapticFeedback.notificationOccurred('success');
}
async function buyBatu(amount){
    const total=amount*500; if(playerData.balance_stonid<total){ alert('Saldo tidak cukup!'); return; }
    await supabase.rpc('deduct_stonid',{p_user_id:currentUser.id,p_amount:total});
    await supabase.from('players').update({batu_mentah:playerData.batu_mentah+amount}).eq('user_id',currentUser.id);
    await loadPlayerData(); alert('✅ Beli '+amount+' batu mentah!');
}
async function buyGerinda(){ await buyGerindaSlot(0); }
function showTab(tab){
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById(tab+'-screen').classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
    event.target.classList.add('active');
    if(tab==='inventory') loadInventory(); if(tab==='toko') updateResourceDisplay(); if(tab==='pasar') loadPasarBeli();
}
async function loadInventory(){
    const {data}=await supabase.from('inventory').select('*').eq('user_id',currentUser.id);
    const c=document.getElementById('inventoryList');
    if(!data||data.length===0){ c.innerHTML='<p style="text-align:center">🎒 Kosong</p>'; return; }
    c.innerHTML=data.map(i=>i.item_type==='batu'?`<div class="inventory-item"><span>${ {merah:'🔴',silver:'⚪',lapis:'🔵',berlian:'💎'}[i.batu_type]||'🪨'} ${i.batu_type} ${i.is_damaged?'⚠️':''} x${i.quantity}</span></div>`:`<div class="inventory-item"><span>🔧 Gerinda [${i.durability}/${i.max_durability}]</span></div>`).join('');
}
async function loadPasarBeli(){
    const {data}=await supabase.from('market_listings').select('*').eq('status','active').limit(20);
    const c=document.getElementById('pasarList');
    if(!data||data.length===0){ c.innerHTML='<p style="text-align:center">📦 Kosong</p>'; return; }
    c.innerHTML=data.map(l=>l.item_type==='batu'?`<div class="pasar-item"><span>💎 ${l.item_details.batu_type}</span><span>${formatStonid(l.price_per_unit)}</span><button onclick="buyListing('${l.id}')">Beli</button></div>`:`<div class="pasar-item"><span>🔧 Gerinda [${l.item_details.durability}/${l.item_details.max_durability}]</span><span>${formatStonid(l.price_per_unit)}</span><button onclick="buyListing('${l.id}')">Beli</button></div>`).join('');
}
async function buyListing(listId){
    const {data:l}=await supabase.from('market_listings').select('*').eq('id',listId).single(); if(!l)return;
    if(playerData.balance_stonid<l.price_per_unit){ alert('Saldo kurang!'); return; }
    const fee=Math.floor(l.price_per_unit*0.1), sellerGet=l.price_per_unit-fee;
    await supabase.rpc('deduct_stonid',{p_user_id:currentUser.id,p_amount:l.price_per_unit});
    await supabase.rpc('add_stonid',{p_user_id:l.seller_id,p_amount:sellerGet});
    if(l.item_type==='batu'){ const {data:e}=await supabase.from('inventory').select('*').eq('user_id',currentUser.id).eq('item_type','batu').eq('batu_type',l.item_details.batu_type).eq('is_damaged',l.item_details.is_damaged).single(); if(e) await supabase.from('inventory').update({quantity:e.quantity+1}).eq('id',e.id); else await supabase.from('inventory').insert({user_id:currentUser.id,item_type:'batu',batu_type:l.item_details.batu_type,is_damaged:l.item_details.is_damaged,quantity:1}); }
    await supabase.from('market_listings').update({status:'sold'}).eq('id',listId);
    await loadPlayerData(); loadPasarBeli(); alert('✅ Berhasil!');
}
function loadPasarJual(){ document.getElementById('pasarList').innerHTML='<p style="text-align:center">Fitur segera hadir</p>'; }
function startCooldownTimer(){ if(cooldownInterval)clearInterval(cooldownInterval); cooldownInterval=setInterval(renderMeja,1000); }
function formatStonid(a){ return (a||0).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' STN'; }
function formatTime(s){ const m=Math.floor(s/60), sec=s%60; return m+':'+sec.toString().padStart(2,'0'); }
init();
