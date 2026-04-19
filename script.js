const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

const SUPABASE_URL = 'https://qfinqcjjajivyjhwysbau.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmaW5xY2pqYWl2eWpod3lzYmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzAyMjcsImV4cCI6MjA5MjEwNjIyN30.K5kPE0_ckX32lhWJY3-7bwX18-bBgxlbxTq_R_CaTPo';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let playerData = null;
let mejaSlots = [];
let cooldownInterval = null;

// =====================================================
// INIT
// =====================================================
async function init() {
    try {
        const user = tg.initDataUnsafe?.user;
        if (!user) {
            document.getElementById('loading').innerHTML = '<p style="color:red; padding:20px;">❌ Buka dari bot Telegram</p>';
            return;
        }
        
        currentUser = user;
        document.getElementById('username').textContent = user.first_name || 'Pemain';
        
        await loadPlayerData();
        await loadMeja();
        
        document.getElementById('loading').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
        
        updateResourceDisplay();
        startCooldownTimer();
    } catch (e) {
        console.error('Init error:', e);
        document.getElementById('loading').innerHTML = '<p style="color:red; padding:20px;">❌ Gagal: ' + e.message + '</p>';
    }
}

// =====================================================
// DATABASE FUNCTIONS
// =====================================================
async function loadPlayerData() {
    const { data, error } = await supabase.from('players')
        .select('*').eq('user_id', currentUser.id).single();
    
    if (error) {
        console.error('Load player error:', error);
        throw error;
    }
    
    if (!data) {
        await supabase.from('players').insert({
            user_id: currentUser.id,
            username: currentUser.first_name || 'Pemain',
            balance_stonid: 5000,
            batu_mentah: 0,
            total_pecah: 0
        });
        
        await supabase.from('meja_gerinda').insert({
            user_id: currentUser.id,
            slot_number: 1,
            durability: 50,
            max_durability: 50
        });
        
        await supabase.from('leaderboard').insert({
            user_id: currentUser.id,
            username: currentUser.first_name || 'Pemain',
            total_pecah: 0,
            total_lapis: 0,
            total_berlian: 0
        });
        
        playerData = { balance_stonid: 5000, batu_mentah: 0 };
    } else {
        playerData = data;
    }
}

async function loadMeja() {
    const { data, error } = await supabase.from('meja_gerinda')
        .select('*').eq('user_id', currentUser.id).order('slot_number');
    
    if (error) throw error;
    
    mejaSlots = new Array(5).fill(null);
    if (data) data.forEach(s => { mejaSlots[s.slot_number - 1] = s; });
    
    renderMeja();
}

async function getCooldown(gerindaId) {
    const { data } = await supabase.from('gerinda_cooldown')
        .select('*').eq('gerinda_id', gerindaId).single();
    return data;
}

// =====================================================
// RENDER
// =====================================================
function renderMeja() {
    const grid = document.getElementById('slotGrid');
    grid.innerHTML = '';
    
    for (let i = 0; i < 5; i++) {
        const slot = mejaSlots[i];
        const card = document.createElement('div');
        card.className = 'slot-card';
        
        if (!slot) {
            card.classList.add('empty');
            card.innerHTML = '<div class="slot-icon">⬜</div><div class="slot-durability">Kosong</div>';
            card.onclick = () => buyGerindaSlot(i + 1);
        } else {
            getCooldown(slot.id).then(cd => {
                if (cd && cd.status === 'cooldown') {
                    card.classList.add('cooldown');
                    const end = new Date(cd.end_time);
                    const now = new Date();
                    const rem = Math.max(0, Math.floor((end - now) / 1000));
                    card.innerHTML = `<div class="slot-icon">⏳</div><div class="slot-durability">${slot.durability}/50</div><div class="slot-status">${formatTime(rem)}</div>`;
                } else {
                    card.classList.add('idle');
                    card.innerHTML = `<div class="slot-icon">🔧</div><div class="slot-durability">${slot.durability}/50</div><div class="slot-status">Siap</div>`;
                }
                card.onclick = () => selectSlot(i + 1, slot);
            });
        }
        
        grid.appendChild(card);
    }
}

function updateResourceDisplay() {
    if (playerData) {
        document.getElementById('balance').textContent = formatStonid(playerData.balance_stonid);
        document.getElementById('batuMentah').textContent = playerData.batu_mentah;
    }
}

// =====================================================
// SLOT ACTIONS
// =====================================================
async function selectSlot(slotNum, slot) {
    if (!slot) {
        buyGerindaSlot(slotNum);
        return;
    }
    
    const cd = await getCooldown(slot.id);
    if (cd && cd.status === 'cooldown') {
        const end = new Date(cd.end_time);
        const now = new Date();
        const rem = Math.max(0, Math.floor((end - now) / 1000));
        document.getElementById('actionPanel').innerHTML = `<p>⏳ Cooldown: ${formatTime(rem)}</p>`;
        return;
    }
    
    if (playerData.batu_mentah < 1) {
        document.getElementById('actionPanel').innerHTML = '<p>❌ Tidak punya batu mentah. Beli di Toko.</p>';
        return;
    }
    
    document.getElementById('actionPanel').innerHTML = `
        <p>🔧 Slot ${slotNum} [${slot.durability}/50]</p>
        <button onclick="pecahBatu('${slot.id}', ${slotNum})" style="padding:12px 24px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;margin-top:10px;">⛏️ PECAH BATU</button>
    `;
}

async function pecahBatu(gerindaId, slotNum) {
    const slot = mejaSlots[slotNum - 1];
    if (!slot) return;
    
    const cd = await getCooldown(gerindaId);
    if (cd && cd.status === 'cooldown') {
        alert('Gerinda sedang cooldown!');
        return;
    }
    
    if (playerData.batu_mentah < 1) {
        alert('Tidak punya batu mentah!');
        return;
    }
    
    // Kurangi batu mentah
    await supabase.from('players').update({ batu_mentah: playerData.batu_mentah - 1 }).eq('user_id', currentUser.id);
    
    // Kurangi durability
    const newDur = slot.durability - 1;
    let rusakMsg = '';
    
    if (newDur <= 0) {
        await supabase.from('meja_gerinda').delete().eq('id', gerindaId);
        await supabase.from('gerinda_cooldown').delete().eq('gerinda_id', gerindaId);
        rusakMsg = '⚠️ Gerinda rusak!';
    } else {
        await supabase.from('meja_gerinda').update({ durability: newDur }).eq('id', gerindaId);
        
        const now = new Date();
        const end = new Date(now.getTime() + 10 * 60 * 1000);
        await supabase.from('gerinda_cooldown').upsert({
            gerinda_id: gerindaId,
            user_id: currentUser.id,
            status: 'cooldown',
            start_time: now.toISOString(),
            end_time: end.toISOString()
        });
    }
    
    // Hasil pecahan
    const hasil = [];
    for (let i = 0; i < 2; i++) {
        const t = rollBatu();
        const d = rollDamaged(t);
        hasil.push({ type: t, damaged: d });
        
        const { data: exist } = await supabase.from('inventory')
            .select('*').eq('user_id', currentUser.id).eq('item_type', 'batu')
            .eq('batu_type', t).eq('is_damaged', d).single();
        
        if (exist) {
            await supabase.from('inventory').update({ quantity: exist.quantity + 1 }).eq('id', exist.id);
        } else {
            await supabase.from('inventory').insert({
                user_id: currentUser.id, item_type: 'batu', batu_type: t,
                is_damaged: d, quantity: 1
            });
        }
    }
    
    await loadPlayerData();
    await loadMeja();
    updateResourceDisplay();
    
    let hasilText = hasil.map(b => {
        const e = { merah: '🔴', silver: '⚪', lapis: '🔵', berlian: '💎' }[b.type];
        return `${e} ${b.type} ${b.damaged ? '⚠️' : '✅'}`;
    }).join(', ');
    
    document.getElementById('actionPanel').innerHTML = `
        <p>✅ Gerinda bekerja! 10 menit</p>
        <p>${hasilText}</p>
        ${rusakMsg ? '<p style="color:orange">' + rusakMsg + '</p>' : ''}
    `;
    
    tg.HapticFeedback?.impactOccurred('medium');
}

function rollBatu() {
    const r = Math.random() * 100;
    const c = { merah: 88, silver: 10, lapis: 1.999, berlian: 0.001 };
    let cum = 0;
    for (let [b, v] of Object.entries(c)) {
        cum += v;
        if (r < cum) return b;
    }
    return 'merah';
}

function rollDamaged(t) {
    const r = { merah: 0.3, silver: 0.3, lapis: 0.3, berlian: 0.5 };
    return Math.random() < (r[t] || 0.3);
}

async function buyGerindaSlot(slotNum) {
    const empty = mejaSlots.findIndex(s => s === null) + 1;
    if (empty === 0) {
        alert('Meja penuh!');
        return;
    }
    
    if (playerData.balance_stonid < 10000) {
        alert('Saldo tidak cukup!');
        return;
    }
    
    await supabase.rpc('deduct_stonid', { p_user_id: currentUser.id, p_amount: 10000 });
    await supabase.from('meja_gerinda').insert({
        user_id: currentUser.id, slot_number: empty, durability: 50, max_durability: 50
    });
    
    await loadPlayerData();
    await loadMeja();
    updateResourceDisplay();
    tg.HapticFeedback?.notificationOccurred('success');
}

// =====================================================
// TOKO
// =====================================================
async function buyBatu(amount) {
    const total = amount * 500;
    if (playerData.balance_stonid < total) {
        alert('Saldo tidak cukup!');
        return;
    }
    
    await supabase.rpc('deduct_stonid', { p_user_id: currentUser.id, p_amount: total });
    await supabase.from('players').update({ batu_mentah: playerData.batu_mentah + amount }).eq('user_id', currentUser.id);
    
    await loadPlayerData();
    updateResourceDisplay();
    alert('✅ Beli ' + amount + ' batu mentah!');
}

async function buyGerinda() {
    await buyGerindaSlot(0);
}

// =====================================================
// INVENTORY
// =====================================================
async function loadInventory() {
    const { data } = await supabase.from('inventory')
        .select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
    
    const container = document.getElementById('inventoryList');
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;">🎒 Inventory kosong</p>';
        return;
    }
    
    container.innerHTML = data.map(item => {
        if (item.item_type === 'batu') {
            const e = { merah: '🔴', silver: '⚪', lapis: '🔵', berlian: '💎' }[item.batu_type] || '🪨';
            return `<div class="inventory-item"><span>${e} ${item.batu_type} ${item.is_damaged ? '⚠️' : ''} x${item.quantity}</span></div>`;
        } else {
            return `<div class="inventory-item"><span>🔧 Gerinda [${item.durability}/${item.max_durability}]</span></div>`;
        }
    }).join('');
}

// =====================================================
// PASAR
// =====================================================
async function loadPasarBeli() {
    const { data } = await supabase.from('market_listings')
        .select('*').eq('status', 'active').limit(20);
    
    const container = document.getElementById('pasarList');
    if (!data || data.length === 0) {
        container.innerHTML = '<p style="text-align:center;padding:20px;">📦 Belum ada listing</p>';
        return;
    }
    
    container.innerHTML = data.map(list => {
        if (list.item_type === 'batu') {
            return `<div class="pasar-item"><span>💎 ${list.item_details.batu_type}</span><span>${formatStonid(list.price_per_unit)}</span><button onclick="buyListing('${list.id}')">Beli</button></div>`;
        } else {
            return `<div class="pasar-item"><span>🔧 Gerinda [${list.item_details.durability}/${list.item_details.max_durability}]</span><span>${formatStonid(list.price_per_unit)}</span><button onclick="buyListing('${list.id}')">Beli</button></div>`;
        }
    }).join('');
}

async function buyListing(listId) {
    const { data: list } = await supabase.from('market_listings').select('*').eq('id', listId).single();
    if (!list) return;
    
    if (playerData.balance_stonid < list.price_per_unit) {
        alert('Saldo tidak cukup!');
        return;
    }
    
    const fee = Math.floor(list.price_per_unit * 0.1);
    const sellerGet = list.price_per_unit - fee;
    
    await supabase.rpc('deduct_stonid', { p_user_id: currentUser.id, p_amount: list.price_per_unit });
    await supabase.rpc('add_stonid', { p_user_id: list.seller_id, p_amount: sellerGet });
    
    if (list.item_type === 'batu') {
        const { data: exist } = await supabase.from('inventory')
            .select('*').eq('user_id', currentUser.id).eq('item_type', 'batu')
            .eq('batu_type', list.item_details.batu_type).eq('is_damaged', list.item_details.is_damaged).single();
        
        if (exist) {
            await supabase.from('inventory').update({ quantity: exist.quantity + 1 }).eq('id', exist.id);
        } else {
            await supabase.from('inventory').insert({
                user_id: currentUser.id, item_type: 'batu',
                batu_type: list.item_details.batu_type, is_damaged: list.item_details.is_damaged, quantity: 1
            });
        }
    }
    
    await supabase.from('market_listings').update({ status: 'sold' }).eq('id', listId);
    await loadPlayerData();
    updateResourceDisplay();
    loadPasarBeli();
    alert('✅ Pembelian berhasil!');
}

function loadPasarJual() {
    document.getElementById('pasarList').innerHTML = '<p style="text-align:center;padding:20px;">📦 Fitur segera hadir</p>';
}

// =====================================================
// UI
// =====================================================
function showTab(tab) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(tab + '-screen').classList.add('active');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    if (tab === 'inventory') loadInventory();
    if (tab === 'toko') updateResourceDisplay();
    if (tab === 'pasar') loadPasarBeli();
}

function startCooldownTimer() {
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = setInterval(renderMeja, 1000);
}

function formatStonid(a) {
    return (a || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' STN';
}

function formatTime(s) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + sec.toString().padStart(2, '0');
}

// Start
init();
