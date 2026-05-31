/* ════════════════════════════════════════════════════════════════
   COUNTRYBALL WORLD CUP 2026 — GACHA
   No rarity tiers — equal chance for all 48 nations
   ════════════════════════════════════════════════════════════════ */

import walletManager from './wallet.js';

const API = '';

function getFlagUrl(code) {
  if (!code) return '';
  const c = code.toLowerCase();
  if (c === 'wc') return ''; // Trophy has no flag
  if (c === 'en') return 'https://flagcdn.com/w40/gb-eng.png';
  return `https://flagcdn.com/w40/${c}.png`;
}

function getFlagImg(code, size = 40) {
  const url = getFlagUrl(code);
  if (!url) return '<span class="flag-trophy">🏆</span>';
  return `<img src="${url}" alt="${code}" width="${size}" height="${Math.round(size*0.67)}" class="flag-img" loading="lazy" onerror="this.style.display='none'">`;
}

let state = {
  wallet: null,
  user: null,
  cooldownRemaining: 0,
  nations: [],
  allNations: null,
  pullCost: 0.005,
  multiplier: { current: 1.0, highMark: 0, daysHeld: 0, discountedCost: 0.005, discount: 0, totalEarned: 0, claimable: 0, rewardPool: 0 },
  currentSection: 'home'
};

// ─── Navigation ─────────────────────────────────────────────────
function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));

  const el = document.getElementById(section);
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-section="${section}"]`).forEach(btn => btn.classList.add('active'));

  state.currentSection = section;
  if (section === 'nations') loadNations();
  if (section === 'rewards') refreshState();
  if (section === 'leaderboard') loadLeaderboard();
  if (section === 'gacha') refreshState();
}

document.querySelectorAll('[data-section]').forEach(btn => {
  btn.addEventListener('click', e => { e.preventDefault(); navigateTo(btn.dataset.section); });
});
window.navigateTo = navigateTo;

// ─── Wallet ─────────────────────────────────────────────────────
walletManager.onConnect = async (pubkey, tokenBalance) => {
  state.wallet = pubkey;
  try {
    await fetch(`${API}/api/wallet/connect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: pubkey })
    });
    await fetch(`${API}/api/wallet/balance`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: pubkey, balance: tokenBalance, tokenBalance })
    });
    await refreshState();
  } catch (err) { console.error('Sync failed:', err); }
};

walletManager.onDisconnect = () => {
  state.wallet = null; state.user = null; state.nations = [];
  document.getElementById('walletAddr').textContent = 'Not connected';
  document.getElementById('tokenBalance').textContent = '0';
  document.getElementById('holdingStatus')?.classList.add('hidden');
  document.getElementById('holdingWarning')?.classList.add('hidden');
  updatePullButton();
};

walletManager.onBalanceUpdate = async (solBalance, tokenBalance) => {
  document.getElementById('tokenBalance').textContent = tokenBalance?.toLocaleString() || '0';
  if (state.wallet) {
    try {
      await fetch(`${API}/api/wallet/balance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: state.wallet, balance: tokenBalance, tokenBalance })
      });
    } catch {}
  }
};

// ─── Refresh State ───────────────────────────────────────────────
async function refreshState() {
  if (!state.wallet) return;
  try {
    await walletManager.refreshBalance();
    const res = await fetch(`${API}/api/user/${state.wallet}`);
    const data = await res.json();

    state.user = data.user;
    state.cooldownRemaining = data.cooldownRemaining;
    state.nations = data.nations;
    state.pullCost = data.pullCost;
    state.multiplier = data.multiplier;

    document.getElementById('walletAddr').textContent = walletManager.shortAddress || state.wallet;
    document.getElementById('tokenBalance').textContent = walletManager.tokenBalance?.toLocaleString() || '0';

    if (data.hasTokens) {
      document.getElementById('holdingStatus')?.classList.remove('hidden');
      document.getElementById('holdingWarning')?.classList.add('hidden');
    } else {
      document.getElementById('holdingStatus')?.classList.add('hidden');
      document.getElementById('holdingWarning')?.classList.remove('hidden');
    }

    updatePullButton();
    startCooldownTimer();

    document.getElementById('nationProgress').textContent = data.nationProgress;
    document.getElementById('nationTotal').textContent = data.totalNations;
    const pct = data.totalNations > 0 ? (data.nationProgress / data.totalNations * 100) : 0;
    document.getElementById('nationBar').style.width = pct + '%';
    updateRewardsUI();
  } catch (err) { console.error('Refresh failed:', err); }
}

// ─── Pull Button ────────────────────────────────────────────────
function updatePullButton() {
  const btn = document.getElementById('pullBtn');
  const status = document.getElementById('pullStatus');

  if (!state.wallet || !walletManager.isConnected) {
    btn.disabled = true; status.textContent = 'Connect wallet first'; return;
  }
  if (walletManager.tokenBalance <= 0) {
    btn.disabled = true; status.textContent = 'Hold tokens to play!'; return;
  }
  if (state.cooldownRemaining > 0) {
    btn.disabled = true; status.textContent = 'On cooldown...'; return;
  }
  btn.disabled = false;
  status.textContent = 'Pull a nation — FREE';
}

document.getElementById('pullBtn').addEventListener('click', pullGacha);

// ─── GACHA PULL ─────────────────────────────────────────────────
async function pullGacha() {
  if (!state.wallet || !walletManager.isConnected) return;
  const btn = document.getElementById('pullBtn');
  const ball = document.getElementById('gachaBall');
  const status = document.getElementById('pullStatus');
  const machine = document.querySelector('.gacha-machine');

  btn.disabled = true;
  btn.classList.add('pulling');
  btn.querySelector('.pull-text').textContent = 'PULLING...';
  status.textContent = 'Charging the machine...';
  machine?.classList.add('pulling');
  ball.classList.add('charging');
  spawnParticles(28);

  try {
    const pullRequest = fetch(`${API}/api/gacha/pull`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: state.wallet })
    });

    await runPullIntro(status, ball);
    const res = await pullRequest;
    const data = await res.json();
    if (!res.ok) {
      status.textContent = data.message || 'Pull failed';
      if (data.cooldownRemaining) {
        state.cooldownRemaining = data.cooldownRemaining;
        startCooldownTimer();
      }
      machine?.classList.remove('pulling');
      ball.classList.remove('charging', 'launching');
      btn.classList.remove('pulling');
      btn.querySelector('.pull-text').textContent = 'PULL!';
      updatePullButton(); return;
    }
    status.textContent = 'Nation found!';
    machine?.classList.remove('pulling');
    ball.classList.remove('charging', 'launching');
    ball.classList.add('revealed');
    showResult(data.result);
    setTimeout(() => ball.classList.remove('revealed'), 700);
    await refreshState();
    await walletManager.refreshBalance();
  } catch (err) {
    console.error('Pull failed:', err);
    status.textContent = 'Network error!';
    machine?.classList.remove('pulling');
    ball.classList.remove('charging', 'launching');
    btn.classList.remove('pulling');
    btn.querySelector('.pull-text').textContent = 'PULL!';
  }
}

async function runPullIntro(status, ball) {
  const steps = [
    ['Scanning the pitch...', 520],
    ['Opening the capsule...', 620],
    ['Locking nation signal...', 620]
  ];

  for (const [text, delay] of steps) {
    status.textContent = text;
    spawnParticles(12);
    await sleep(delay);
  }

  ball.classList.remove('charging');
  ball.classList.add('launching');
  status.textContent = 'Reveal incoming!';
  spawnParticles(36);
  await sleep(520);
}

// ─── Show Result ────────────────────────────────────────────────
function showResult(result) {
  const overlay = document.getElementById('resultOverlay');
  const card = document.getElementById('resultCard');
  const kicker = document.getElementById('resultKicker');

  const resultFlagEl = document.getElementById('resultFlag');
  if (result.flag === 'WC') {
    resultFlagEl.innerHTML = '🏆';
    resultFlagEl.style.fontSize = '80px';
  } else {
    resultFlagEl.innerHTML = `<img src="https://flagcdn.com/w160/${result.flag.toLowerCase()}.png" width="120" height="80" class="result-flag-img" onerror="this.parentElement.textContent='⚽'">`;
    resultFlagEl.style.fontSize = '';
  }
  document.getElementById('resultName').textContent = result.name;
  document.getElementById('resultConfed').textContent = result.confederation || '';
  document.getElementById('resultCost').textContent = '';
  document.getElementById('resultNew').textContent =
    result.isNew ? '✨ NEW NATION!' : '🔄 Already owned — keep trying!';
  kicker.textContent = result.isNew ? 'Nation unlocked' : 'Duplicate pull';
  card.className = `result-card ${getConfedClass(result.confederation)} ${result.isNew ? 'is-new' : 'is-dupe'}`;

  overlay.classList.add('result-revealing');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.remove('result-revealing'), 1800);
  if (result.isNew) spawnCelebrationParticles();
}

function closeResult() {
  const overlay = document.getElementById('resultOverlay');
  overlay.classList.add('hidden');
  overlay.classList.remove('result-revealing');
  document.getElementById('pullBtn').classList.remove('pulling');
  document.getElementById('pullBtn').querySelector('.pull-text').textContent = 'PULL!';
  updatePullButton();
}
window.closeResult = closeResult;

function getConfedClass(confed) {
  const key = String(confed || 'world').toLowerCase();
  return `confed-${key.replace(/[^a-z0-9]/g, '')}`;
}

// ─── Particles ──────────────────────────────────────────────────
function spawnParticles(count = 20) {
  const c = document.getElementById('machineParticles');
  c.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = '50%'; p.style.top = '50%';
    p.style.setProperty('--dx', (Math.random() - 0.5) * 200 + 'px');
    p.style.setProperty('--dy', (Math.random() - 0.5) * 200 + 'px');
    p.style.animationDelay = (Math.random() * 0.5) + 's';
    p.style.background = ['#f59e0b','#22c55e','#3b82f6','#ef4444','#a855f7'][Math.floor(Math.random()*5)];
    c.appendChild(p);
  }
}

function spawnCelebrationParticles() {
  const o = document.getElementById('resultOverlay');
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'particle'; p.style.position = 'fixed';
    p.style.left = Math.random()*100+'vw'; p.style.top = Math.random()*100+'vh';
    p.style.setProperty('--dx', (Math.random()-0.5)*300+'px');
    p.style.setProperty('--dy', (Math.random()-0.5)*300+'px');
    p.style.animationDelay = Math.random()+'s';
    p.style.width = '8px'; p.style.height = '8px';
    p.style.background = ['#f59e0b','#fbbf24','#22c55e','#a855f7'][Math.floor(Math.random()*4)];
    o.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}

// ─── Cooldown ───────────────────────────────────────────────────
let cooldownInterval = null;
function startCooldownTimer() {
  const display = document.getElementById('cooldownDisplay');
  const timeEl = document.getElementById('cooldownTime');
  const circle = document.getElementById('cooldownCircle');
  if (cooldownInterval) clearInterval(cooldownInterval);
  if (!state.cooldownRemaining || state.cooldownRemaining <= 0) { display.classList.add('hidden'); return; }
  display.classList.remove('hidden');
  let remaining = state.cooldownRemaining;
  const total = 3*60*60*1000, circ = 2*Math.PI*54;
  function tick() {
    if (remaining <= 0) { clearInterval(cooldownInterval); display.classList.add('hidden'); state.cooldownRemaining = 0; updatePullButton(); return; }
    const h = Math.floor(remaining/3600000), m = Math.floor((remaining%3600000)/60000), s = Math.floor((remaining%60000)/1000);
    timeEl.textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    circle.style.strokeDashoffset = circ*(1-remaining/total);
    remaining -= 1000;
  }
  tick(); cooldownInterval = setInterval(tick, 1000);
}

// ─── Nations ────────────────────────────────────────────────────
async function loadNations() {
  if (!state.allNations) {
    try {
      const res = await fetch(`${API}/api/nations`);
      const data = await res.json();
      state.allNations = data.nations;
    } catch { return; }
  }

  const grid = document.getElementById('nationsGrid');
  const ownedIds = new Set(state.nations.map(n => n.nation_id || n.countryballId));
  const filter = document.querySelector('.confed-tab.active')?.dataset.confed || 'all';

  let html = '';
  for (const nation of state.allNations) {
    if (filter !== 'all' && nation.confederation !== filter) continue;
    const owned = ownedIds.has(nation.id);
    const flagHtml = nation.flag === 'WC'
      ? '<span class="flag-trophy-lg">🏆</span>'
      : `<img src="https://flagcdn.com/w80/${nation.flag.toLowerCase()}.png" width="64" height="43" class="nation-flag-img ${owned ? '' : 'locked-img'}" loading="lazy" onerror="this.style.display='none'">`;
    html += `
      <div class="nation-card ${owned ? 'owned' : 'locked'}">
        <div class="nation-flag">${flagHtml}</div>
        <div class="nation-name">${owned ? nation.name : '???'}</div>
        <div class="nation-confed">${owned ? nation.confederation : '???'}</div>
      </div>`;
  }

  grid.innerHTML = html || `<div class="grid-empty"><img class="empty-icon empty-logo" src="/assets/logo.png" alt="Country Balls logo"><p>No nations yet!</p></div>`;
}

document.querySelectorAll('.confed-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.confed-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    loadNations();
  });
});

// ─── Leaderboard ────────────────────────────────────────────────
async function loadLeaderboard() {
  try {
    const res = await fetch(`${API}/api/leaderboard`);
    const data = await res.json();
    const list = document.getElementById('leaderboardList');
    if (!data.leaders.length) {
      list.innerHTML = `<div class="lb-loading"><span style="font-size:48px;display:block;margin-bottom:12px">🏆</span>No collectors yet!</div>`;
      return;
    }
    const medals = ['🥇','🥈','🥉'];
    list.innerHTML = data.leaders.map((lb,i) => `
      <div class="lb-item">
        <div class="lb-rank">${medals[i]||`#${i+1}`}</div>
        <div class="lb-info">
          <div class="lb-wallet">${lb.wallet.slice(0,6)}...${lb.wallet.slice(-4)}</div>
          <div class="lb-stats">${lb.unique_count} nations • ${lb.total_pulls} pulls</div>
        </div>
        <div class="lb-balance">◎ ${(lb.balance||0).toFixed(2)}</div>
      </div>`).join('');
  } catch (err) { console.error('Leaderboard failed:', err); }
}

// ─── Recent Pulls ───────────────────────────────────────────────
async function loadRecentPulls() {
  try {
    const res = await fetch(`${API}/api/recent-pulls`);
    const data = await res.json();
    const feed = document.getElementById('recentFeed');
    if (!data.pulls.length) {
      feed.innerHTML = `<div class="feed-loading">No pulls yet. Be the first! ⚽</div>`;
      return;
    }
    feed.innerHTML = data.pulls.slice(0,15).map(p => {
      const n = p.nation || { name: 'Unknown', flag: 'XX', confederation: '???' };
      const flag = getFlagEmoji(n.flag);
      const flagHtml = n.flag === 'WC'
        ? '<span class="flag-trophy">🏆</span>'
        : `<img src="https://flagcdn.com/w20/${n.flag.toLowerCase()}.png" width="28" height="19" class="feed-flag-img" loading="lazy">`;
      return `<div class="feed-item">
        <span class="feed-flag">${flagHtml}</span>
        <span class="feed-name">${n.name}</span>
        <span class="feed-confed">${n.confederation}</span>
        <span class="feed-wallet">${p.wallet.slice(0,4)}...${p.wallet.slice(-4)}</span>
      </div>`;
    }).join('');
  } catch (err) { console.error('Recent pulls failed:', err); }
}

// ─── Rewards UI ─────────────────────────────────────────────────
function updateRewardsUI() {
  const m = state.multiplier;
  document.getElementById('rewardMultiplier').textContent = m.current.toFixed(1) + 'x';
  document.getElementById('multBar').style.width = ((m.current / 5) * 100) + '%';
  document.getElementById('rewardDaysHeld').textContent = m.daysHeld || 0;
  document.getElementById('rewardHighMark').textContent = (m.highMark || 0).toFixed(3) + ' SOL';
  document.getElementById('rewardDiscount').textContent = (m.discount || 0) + '%';
  document.getElementById('claimAmount').textContent = (m.claimable || 0).toFixed(4) + ' SOL';
  document.getElementById('poolValue').textContent = (m.rewardPool || 0).toFixed(4) + ' SOL';
  document.getElementById('claimBtn').disabled = (m.claimable || 0) <= 0;
}

async function claimRewards() {
  if (!state.wallet) return;
  try {
    const res = await fetch(`${API}/api/rewards/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: state.wallet })
    });
    const data = await res.json();
    if (data.success) {
      await refreshState();
      await walletManager.refreshBalance();
    }
  } catch (err) { console.error('Claim failed:', err); }
}
window.claimRewards = claimRewards;

// ─── Init ───────────────────────────────────────────────────────
function initBgParticles() {
  const c = document.getElementById('particlesBg'); if (!c) return;
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('div'); p.className = 'particle';
    p.style.left = Math.random()*100+'%'; p.style.top = Math.random()*100+'%';
    p.style.animationDelay = Math.random()*8+'s'; p.style.animationDuration = (6+Math.random()*6)+'s';
    c.appendChild(p);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function initContractCopy() {
  const btn = document.getElementById('contractCopyBtn');
  if (!btn) return;

  const label = btn.querySelector('.contract-copy-label');
  const short = btn.querySelector('.contract-copy-short');
  const defaultLabel = label?.textContent || 'Contract Address';
  const defaultShort = short?.textContent || '';

  btn.addEventListener('click', async () => {
    const address = btn.dataset.address;
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      btn.classList.add('copied');
      if (label) label.textContent = 'Copied!';
      if (short) short.textContent = address.slice(0, 4) + '...' + address.slice(-4);
    } catch {
      if (label) label.textContent = 'Copy failed';
    }

    setTimeout(() => {
      btn.classList.remove('copied');
      if (label) label.textContent = defaultLabel;
      if (short) short.textContent = defaultShort;
    }, 1600);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initBgParticles();
  initContractCopy();
  loadRecentPulls();
  setInterval(loadRecentPulls, 30000);
  if (walletManager.isConnected) walletManager.onConnect(walletManager.address, walletManager.solBalance);
});
