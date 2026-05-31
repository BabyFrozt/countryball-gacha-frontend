/**
 * Solana Wallet Manager — Vanilla JS
 * Supports Phantom, Solflare, Backpack via Wallet Standard
 */
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=bccb13c1-81d3-4627-ac27-24adb2af2d2e';
const BACKUP_RPC = 'https://api.mainnet-beta.solana.com';

// SPL Token to hold for gacha eligibility
const GACHA_TOKEN_MINT = 'CBgXb5i9pNi1YJmY1bFkhaHa448fafAm747PnNCcpump';
const GACHA_TOKEN_DECIMALS = 6; // Most pump.fun tokens use 6 decimals

class WalletManager {
  constructor() {
    this.connection = new Connection(HELIUS_RPC, 'confirmed');
    this.wallet = null;
    this.publicKey = null;
    this.solBalance = 0;
    this.tokenBalance = 0;
    this.walletName = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onBalanceUpdate = null;

    this._detectWallets();
  }

  _detectWallets() {
    this.wallets = {};
    if (window.solana?.isPhantom) {
      this.wallets.phantom = { name: 'Phantom', icon: '👻', adapter: window.solana, detected: true };
    }
    if (window.solflare?.isSolflare) {
      this.wallets.solflare = { name: 'Solflare', icon: '☀️', adapter: window.solflare, detected: true };
    }
    if (window.backpack?.isBackpack) {
      this.wallets.backpack = { name: 'Backpack', icon: '🎒', adapter: window.backpack, detected: true };
    }
    this._updateModalStatus();
  }

  _updateModalStatus() {
    ['phantom', 'solflare', 'backpack'].forEach(id => {
      const el = document.getElementById(`${id}Status`);
      if (!el) return;
      if (this.wallets[id]) {
        el.textContent = 'Detected ✓';
        el.className = 'wallet-option-status detected';
      } else {
        el.textContent = 'Not installed';
        el.className = 'wallet-option-status not-detected';
      }
    });
    document.querySelectorAll('.wallet-option').forEach(opt => {
      opt.addEventListener('click', () => this.connectWallet(opt.dataset.wallet));
    });
  }

  showModal() {
    document.getElementById('walletModal')?.classList.remove('hidden');
    this._detectWallets();
  }

  hideModal() {
    document.getElementById('walletModal')?.classList.add('hidden');
  }

  async connectWallet(walletId) {
    const info = this.wallets[walletId];
    if (!info) {
      const urls = { phantom: 'https://phantom.app/', solflare: 'https://solflare.com/', backpack: 'https://backpack.app/' };
      window.open(urls[walletId] || 'https://phantom.app/', '_blank');
      return;
    }

    try {
      const adapter = info.adapter;
      if (adapter.connect) await adapter.connect();

      let pubkey = null;
      if (adapter.publicKey) pubkey = adapter.publicKey;
      else if (adapter.accounts?.[0]) pubkey = new PublicKey(adapter.accounts[0].publicKey);

      if (!pubkey) throw new Error('Could not get public key');

      this.wallet = adapter;
      this.publicKey = pubkey;
      this.walletName = info.name;

      await this.refreshBalance();
      this.hideModal();
      this._updateConnectUI();

      if (adapter.on) {
        adapter.on('disconnect', () => this._handleDisconnect());
        adapter.on('accountChanged', (pk) => this._handleAccountChanged(pk));
      }

      if (this.onConnect) this.onConnect(this.publicKey.toString(), this.tokenBalance);
      return { publicKey: this.publicKey.toString(), tokenBalance: this.tokenBalance };
    } catch (err) {
      console.error('Wallet connection failed:', err);
      throw err;
    }
  }

  async disconnect() {
    try { if (this.wallet?.disconnect) await this.wallet.disconnect(); } catch {}
    this._handleDisconnect();
  }

  _handleDisconnect() {
    this.wallet = null;
    this.publicKey = null;
    this.solBalance = 0;
    this.tokenBalance = 0;
    this.walletName = null;
    this._updateConnectUI();
    this._removeDisconnectMenu();
    if (this.onDisconnect) this.onDisconnect();
  }

  _handleAccountChanged(newPubkey) {
    if (!newPubkey || newPubkey.length === 0) { this._handleDisconnect(); return; }
    try {
      this.publicKey = new PublicKey(newPubkey);
      this.refreshBalance();
      this._updateConnectUI();
    } catch {}
  }

  // ─── Fetch SOL + SPL Token Balance ───────────────────────────
  async refreshBalance() {
    if (!this.publicKey) return 0;
    try {
      // SOL balance
      const lamports = await this.connection.getBalance(this.publicKey);
      this.solBalance = lamports / LAMPORTS_PER_SOL;

      // SPL Token balance
      this.tokenBalance = await this._fetchTokenBalance();

      if (this.onBalanceUpdate) this.onBalanceUpdate(this.solBalance, this.tokenBalance);
      return this.tokenBalance;
    } catch (err) {
      console.error('Balance fetch failed:', err);
      try {
        const backup = new Connection(BACKUP_RPC, 'confirmed');
        const lamports = await backup.getBalance(this.publicKey);
        this.solBalance = lamports / LAMPORTS_PER_SOL;
        this.tokenBalance = await this._fetchTokenBalance(backup);
        if (this.onBalanceUpdate) this.onBalanceUpdate(this.solBalance, this.tokenBalance);
      } catch {}
      return this.tokenBalance;
    }
  }

  async _fetchTokenBalance(conn) {
    const connection = conn || this.connection;
    try {
      const mintPubkey = new PublicKey(GACHA_TOKEN_MINT);
      const accounts = await connection.getParsedTokenAccountsByOwner(
        this.publicKey,
        { mint: mintPubkey }
      );

      if (accounts.value.length === 0) return 0;

      const balance = accounts.value[0].account.data.parsed.info.tokenAmount;
      return parseFloat(balance.uiAmountString || '0');
    } catch (err) {
      console.error('Token balance fetch failed:', err);
      return 0;
    }
  }

  // ─── UI ──────────────────────────────────────────────────────
  _updateConnectUI() {
    const btn = document.getElementById('connectBtn');
    if (!btn) return;

    if (this.publicKey) {
      const addr = this.publicKey.toString();
      const short = addr.slice(0, 4) + '...' + addr.slice(-4);
      btn.classList.add('connected');
      btn.querySelector('.wallet-text').textContent = short;
      btn.onclick = (e) => { e.stopPropagation(); this._toggleDisconnectMenu(); };
    } else {
      btn.classList.remove('connected');
      btn.querySelector('.wallet-text').textContent = 'Connect Wallet';
      btn.onclick = () => this.showModal();
      this._removeDisconnectMenu();
    }
  }

  _toggleDisconnectMenu() {
    this._removeDisconnectMenu();
    const btn = document.getElementById('connectBtn');
    const menu = document.createElement('div');
    menu.className = 'disconnect-menu';
    menu.innerHTML = `
      <div class="disconnect-addr">${this.address}</div>
      <button class="disconnect-btn" id="disconnectBtn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Disconnect
      </button>
    `;
    btn.parentElement.appendChild(menu);

    menu.querySelector('.disconnect-addr').onclick = () => {
      navigator.clipboard.writeText(this.address);
      menu.querySelector('.disconnect-addr').textContent = 'Copied!';
      setTimeout(() => {
        if (menu.querySelector('.disconnect-addr'))
          menu.querySelector('.disconnect-addr').textContent = this.address;
      }, 1500);
    };

    document.getElementById('disconnectBtn').onclick = () => {
      this._removeDisconnectMenu();
      this.disconnect();
    };

    setTimeout(() => {
      document.addEventListener('click', this._closeMenuHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== btn) this._removeDisconnectMenu();
      });
    }, 10);
  }

  _removeDisconnectMenu() {
    document.querySelectorAll('.disconnect-menu').forEach(m => m.remove());
    if (this._closeMenuHandler) {
      document.removeEventListener('click', this._closeMenuHandler);
      this._closeMenuHandler = null;
    }
  }

  get isConnected() { return !!this.publicKey; }
  get address() { return this.publicKey?.toString() || null; }
  get shortAddress() {
    if (!this.publicKey) return null;
    const a = this.publicKey.toString();
    return a.slice(0, 4) + '...' + a.slice(-4);
  }
}

const walletManager = new WalletManager();
window.walletManager = walletManager;
export default walletManager;
