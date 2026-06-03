// State & Elements
let notes = JSON.parse(localStorage.getItem('pwa_notes')) || [];
let deferredPrompt = null;

const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const notesList = document.getElementById('notes-list');
const connectionStatus = document.getElementById('connection-status');
const syncStatus = document.getElementById('sync-status');
const consoleBox = document.getElementById('console-box');
const installBanner = document.getElementById('install-banner');
const installDesc = document.getElementById('install-desc');
const btnInstall = document.getElementById('btn-install');
const displayModeBadge = document.getElementById('display-mode-badge');

// 1. Live Terminal Logger
function logToConsole(type, message) {
  const line = document.createElement('div');
  line.className = `console-line log-${type}`;
  
  // Format current timestamp
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  
  line.textContent = `[${timeStr}] ${message}`;
  consoleBox.appendChild(line);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

// 2. Display Mode Detection
function checkDisplayMode() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
                       || window.navigator.standalone 
                       || document.referrer.includes('android-app://');
  
  if (isStandalone) {
    displayModeBadge.className = 'status-badge mode-badge';
    displayModeBadge.querySelector('.status-text').textContent = '📱 獨立視窗模式 (App Mode)';
    displayModeBadge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
    displayModeBadge.style.color = '#34d399';
    logToConsole('success', '[系統檢測] 應用正在獨立視窗 (Standalone) 中運行！隱藏了瀏覽器網址列。');
  } else {
    displayModeBadge.className = 'status-badge mode-badge';
    displayModeBadge.querySelector('.status-text').textContent = '🌐 瀏覽器分頁';
    displayModeBadge.style.backgroundColor = 'rgba(139, 92, 246, 0.15)';
    displayModeBadge.style.color = '#a78bfa';
    logToConsole('info', '[系統檢測] 應用正在普通瀏覽器分頁中運行。');
  }
}

// 3. Network Status Handler
function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  if (isOnline) {
    connectionStatus.className = 'status-badge status-online';
    connectionStatus.querySelector('.status-text').textContent = 'Online';
    logToConsole('success', '[網路狀態] 已連接上網。');
    triggerSync();
  } else {
    connectionStatus.className = 'status-badge status-offline';
    connectionStatus.querySelector('.status-text').textContent = 'Offline';
    logToConsole('warning', '[網路狀態] 偵測到斷網！應用程式已進入完全離線模式。');
    setSyncStatus('failed', '同步失敗 (無網路連線)');
  }
}

// 4. Simulated Cloud Database Sync
function setSyncStatus(type, message) {
  syncStatus.className = 'sync-status';
  if (type === 'success') {
    syncStatus.classList.add('sync-success');
    syncStatus.textContent = message || '已同步';
  } else if (type === 'failed') {
    syncStatus.classList.add('sync-failed');
    syncStatus.textContent = message || '同步失敗';
  } else if (type === 'pending') {
    syncStatus.classList.add('sync-pending');
    syncStatus.textContent = message || '正在同步...';
  }
}

function triggerSync() {
  if (!navigator.onLine) {
    setSyncStatus('failed', '同步失敗 (已斷線)');
    return;
  }

  setSyncStatus('pending', '正在同步至雲端資料庫...');
  logToConsole('info', '[雲端同步] 正在與伺服器同步資料...');

  setTimeout(() => {
    if (navigator.onLine) {
      setSyncStatus('success', '已同步');
      logToConsole('success', '[雲端同步] 資料已成功上傳雲端保存！');
    } else {
      setSyncStatus('failed', '同步中斷 (已斷線)');
      logToConsole('warning', '[雲端同步] 同步中斷：連線已丟失。');
    }
  }, 1200);
}

// 5. Note Crud Logic
function renderNotes() {
  notesList.innerHTML = '';
  
  if (notes.length === 0) {
    notesList.innerHTML = `<li class="empty-state">尚無筆記。請在上方新增！</li>`;
    return;
  }

  notes.forEach((note, index) => {
    const li = document.createElement('li');
    li.className = 'note-item';
    li.innerHTML = `
      <span class="note-text">${escapeHtml(note)}</span>
      <button class="btn-delete" onclick="deleteNote(${index})">✕</button>
    `;
    notesList.appendChild(li);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = noteInput.value.trim();
  if (!text) return;

  notes.push(text);
  localStorage.setItem('pwa_notes', JSON.stringify(notes));
  noteInput.value = '';
  
  renderNotes();
  logToConsole('info', `[離線儲存] 已在 LocalStorage 寫入新筆記。`);
  triggerSync();
});

window.deleteNote = function(index) {
  notes.splice(index, 1);
  localStorage.setItem('pwa_notes', JSON.stringify(notes));
  renderNotes();
  logToConsole('info', `[離線儲存] 已在 LocalStorage 刪除該筆記。`);
  triggerSync();
};

// 6. Service Worker Registration & Messages
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    logToConsole('info', '[SW 註冊] 正在背景註冊 Service Worker (sw.js)...');
    
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        logToConsole('success', `[SW 註冊] 成功！Scope: ${registration.scope}`);
        
        // Handle service worker state changes
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          logToConsole('info', '[SW 生命週期] 偵測到新的 Service Worker 正在安裝...');
          newWorker.addEventListener('statechange', () => {
            logToConsole('info', `[SW 生命週期] 狀態變更為: ${newWorker.state}`);
          });
        });
      })
      .catch((error) => {
        logToConsole('warning', `[SW 註冊] 失敗：${error}`);
      });
  });

  // Listen for logs sent from the Service Worker (Interceptions)
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SW_LOG') {
      logToConsole(event.data.logType, event.data.message);
    }
  });
} else {
  logToConsole('warning', '[瀏覽器不支援] 此瀏覽器不支援 Service Workers，無法使用離線載入功能。');
}

// 7. Handle PWA Installation Installation prompt
window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent the mini-infobar from appearing on mobile
  e.preventDefault();
  // Stash the event so it can be triggered later.
  deferredPrompt = e;
  
  // Show install controls
  installDesc.textContent = '檢測到此瀏覽器支援安裝！點擊下方按鈕將其安裝至你的桌面。';
  installBanner.classList.add('visible');
  logToConsole('success', '[PWA 安裝] 觸發 beforeinstallprompt 事件：此程式已符合 PWA 安裝標準。');
});

btnInstall.addEventListener('click', async () => {
  if (!deferredPrompt) {
    logToConsole('warning', '[PWA 安裝] 安裝觸發器不可用。');
    return;
  }
  
  // Show the install prompt
  deferredPrompt.prompt();
  logToConsole('info', '[PWA 安裝] 正在彈出系統原生安裝確認框...');
  
  // Wait for the user to respond to the prompt
  const { outcome } = await deferredPrompt.userChoice;
  logToConsole('info', `[PWA 安裝] 使用者安裝決定: ${outcome}`);
  
  if (outcome === 'accepted') {
    logToConsole('success', '[PWA 安裝] 使用者已同意安裝！應用程式正在安裝中...');
    installBanner.classList.remove('visible');
    installDesc.textContent = '應用程式安裝已啟動！請檢查你的桌面或應用程式清單。';
  } else {
    logToConsole('warning', '[PWA 安裝] 使用者拒絕了安裝。');
  }
  
  // We've used the prompt, and can't use it again
  deferredPrompt = null;
});

window.addEventListener('appinstalled', (event) => {
  logToConsole('success', '🎉 [PWA 安裝] 應用程式已成功安裝並啟動！');
  installBanner.classList.remove('visible');
  installDesc.textContent = '此 App 已成功安裝，現在可透過桌面圖示直接啟動。';
  checkDisplayMode();
});

// Network listeners
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Media Query Listener to watch for display-mode changes
window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
  checkDisplayMode();
});

// Run Initial Checkups
updateConnectionStatus();
renderNotes();
checkDisplayMode();
logToConsole('info', '[系統啟動] PWA 範例應用程式載入完畢。');
