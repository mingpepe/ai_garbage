// State & Elements
let notes = JSON.parse(localStorage.getItem('standard_notes')) || [];
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const notesList = document.getElementById('notes-list');
const connectionStatus = document.getElementById('connection-status');
const syncStatus = document.getElementById('sync-status');

// Update connection status UI
function updateConnectionStatus() {
  const isOnline = navigator.onLine;
  if (isOnline) {
    connectionStatus.className = 'status-badge status-online';
    connectionStatus.querySelector('.status-text').textContent = 'Online';
    triggerSync();
  } else {
    connectionStatus.className = 'status-badge status-offline';
    connectionStatus.querySelector('.status-text').textContent = 'Offline';
    setSyncStatus('failed', '同步失敗 (無網路連線)');
  }
}

// Set database sync status message
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

// Simulate API Cloud Sync
function triggerSync() {
  if (!navigator.onLine) {
    setSyncStatus('failed', '同步失敗 (已斷線)');
    return;
  }

  setSyncStatus('pending', '正在同步至雲端資料庫...');

  // Simulate networking delay
  setTimeout(() => {
    if (navigator.onLine) {
      setSyncStatus('success', '已同步');
    } else {
      setSyncStatus('failed', '同步中斷 (已斷線)');
    }
  }, 1000);
}

// Render list of notes
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

// Escape helper to prevent simple XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Add a note
noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = noteInput.value.trim();
  if (!text) return;

  notes.push(text);
  localStorage.setItem('standard_notes', JSON.stringify(notes));
  noteInput.value = '';
  
  renderNotes();
  triggerSync();
});

// Delete a note
window.deleteNote = function(index) {
  notes.splice(index, 1);
  localStorage.setItem('standard_notes', JSON.stringify(notes));
  renderNotes();
  triggerSync();
};

// Event Listeners for network status
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Initial initialization
updateConnectionStatus();
renderNotes();
console.log('[Standard App] Initialized. Note: This app does not have a Service Worker and will fail to reload offline.');
