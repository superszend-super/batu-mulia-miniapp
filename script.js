alert('SCRIPT JS DIPANGGIL!');

const tg = window.Telegram.WebApp;
alert('Telegram WebApp: ' + (tg ? 'OK' : 'ERROR'));

tg.expand();
tg.ready();

const SUPABASE_URL = 'https://qfinqcjjajivyjhwysbau.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFmaW5xY2pqYWl2eWpod3lzYmF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzAyMjcsImV4cCI6MjA5MjEwNjIyN30.K5kPE0_ckX32lhWJY3-7bwX18-bBgxlbxTq_R_CaTPo';

alert('Supabase URL: ' + SUPABASE_URL);

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
alert('Supabase client: ' + (supabase ? 'OK' : 'ERROR'));

let currentUser = null;
let playerData = null;
let mejaSlots = [];

async function init() {
    alert('init() dipanggil');
    
    try {
        const user = tg.initDataUnsafe?.user;
        alert('User: ' + (user ? user.first_name : 'TIDAK ADA'));
        
        if (!user) {
            document.getElementById('loading').innerHTML = '<p style="color:red">Buka dari bot Telegram</p>';
            return;
        }
        
        currentUser = user;
        
        alert('Mulai loadPlayerData...');
        await loadPlayerData();
        alert('loadPlayerData selesai');
        
        alert('Mulai loadMeja...');
        await loadMeja();
        alert('loadMeja selesai');
        
        document.getElementById('loading').classList.remove('active');
        document.getElementById('main-screen').classList.add('active');
        updateResourceDisplay();
        
        alert('INIT SELESAI!');
    } catch (e) {
        alert('ERROR: ' + e.message);
        document.getElementById('loading').innerHTML = '<p style="color:red">ERROR: ' + e.message + '</p>';
    }
}

async function loadPlayerData() {
    alert('Query Supabase players... user_id=' + currentUser.id);
    
    const { data, error } = await supabase.from('players')
        .select('*').eq('user_id', currentUser.id).single();
    
    if (error) {
        alert('Supabase error: ' + error.message);
        throw error;
    }
    
    alert('Data player: ' + (data ? 'ADA' : 'KOSONG'));
    
    if (!data) {
        alert('Membuat player baru...');
        await supabase.from('players').insert({
            user_id: currentUser.id,
            username: currentUser.first_name || 'Pemain',
            balance_stonid: 5000,
            batu_mentah: 0
        });
        
        await supabase.from('meja_gerinda').insert({
            user_id: currentUser.id,
            slot_number: 1,
            durability: 50,
            max_durability: 50
        });
        
        playerData = { balance_stonid: 5000, batu_mentah: 0 };
        alert('Player baru dibuat!');
    } else {
        playerData = data;
        alert('Player ditemukan! Saldo: ' + data.balance_stonid);
    }
}

async function loadMeja() {
    const { data, error } = await supabase.from('meja_gerinda')
        .select('*').eq('user_id', currentUser.id);
    
    if (error) {
        alert('Meja error: ' + error.message);
        throw error;
    }
    
    alert('Data meja: ' + (data ? data.length + ' slot' : 'KOSONG'));
    
    mejaSlots = new Array(5).fill(null);
    if (data) data.forEach(s => { mejaSlots[s.slot_number - 1] = s; });
}

function updateResourceDisplay() {
    if (playerData) {
        document.getElementById('balance').textContent = playerData.balance_stonid || 0;
        document.getElementById('batuMentah').textContent = playerData.batu_mentah || 0;
    }
}

function renderMeja() {
    // Kosongkan dulu
}

// Fungsi dummy lainnya
function showTab(tab) { alert('showTab: ' + tab); }
function buyBatu(amount) { alert('buyBatu: ' + amount); }
function buyGerinda() { alert('buyGerinda'); }
function loadPasarBeli() { alert('loadPasarBeli'); }
function loadPasarJual() { alert('loadPasarJual'); }
function loadInventory() { alert('loadInventory'); }

// Start
init();
