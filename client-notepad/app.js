// --- Supabase Configuration ---
// Paste your Supabase project URL and Anon Key here (from settings -> API)
const SUPABASE_URL = 'https://caplmkwpriwwxdyghybp.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhcGxta3dwcml3d3hkeWdoeWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjMyOTYsImV4cCI6MjA5NjQ5OTI5Nn0.2J9W6apoYBVzvhpMqmR6PFhGQzWUuM46p46TIUaBCQY';

// Initialize Supabase Client
let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- State Management ---
let state = {
    notes: [],
    activeNoteId: null,
    searchQuery: '',
    selectedCategoryFilter: 'all',
    theme: 'dark',
    isPreviewMode: false,
    user: null,
    authMode: 'login', // 'login' or 'register'
    isApproved: true,
    isGuest: false
};

// Debounce timer for auto-saving
let saveTimeout = null;

// --- DOM Elements ---
const sidebar = document.querySelector('.sidebar');
const notesList = document.getElementById('notes-list');
const emptyState = document.getElementById('empty-state');
const newNoteBtn = document.getElementById('new-note-btn');
const searchInput = document.getElementById('search-input');
const categoryFilters = document.querySelectorAll('.filter-pill');
const themeToggle = document.getElementById('theme-toggle');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importFileInput = document.getElementById('import-file-input');

const editorView = document.getElementById('editor-view');
const welcomeView = document.getElementById('welcome-view');
const welcomeNewBtn = document.getElementById('welcome-new-btn');

const noteCategorySelect = document.getElementById('note-category-select');
const saveIndicator = document.getElementById('save-indicator');
const togglePreviewBtn = document.getElementById('toggle-preview-btn');
const downloadTxtBtn = document.getElementById('download-txt-btn');
const deleteNoteBtn = document.getElementById('delete-note-btn');

const editPane = document.getElementById('edit-pane');
const previewPane = document.getElementById('preview-pane');
const noteTitleInput = document.getElementById('note-title-input');
const noteContentInput = document.getElementById('note-content-input');
const previewTitle = document.getElementById('preview-title');
const previewBody = document.getElementById('preview-body');

const charCountEl = document.getElementById('char-count');
const wordCountEl = document.getElementById('word-count');
const readTimeEl = document.getElementById('read-time');
const modifiedTimeEl = document.getElementById('modified-time');

// Auth DOM Elements
const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authGuestBtn = document.getElementById('auth-guest-btn');
const authSwitchLink = document.getElementById('auth-switch-link');
const authSwitchText = document.getElementById('auth-switch-text');
const authErrorMsg = document.getElementById('auth-error-msg');
const authErrorText = document.getElementById('auth-error-text');
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const pendingView = document.getElementById('pending-view');
const checkApprovalBtn = document.getElementById('check-approval-btn');

// --- Helper Functions ---

// Safe Icon Changer for Lucide (since Lucide replaces <i> with <svg>)
function setIcon(container, iconName, extraClass = '') {
    const existingIcon = container.querySelector('i, svg');
    if (existingIcon) {
        const iEl = document.createElement('i');
        iEl.setAttribute('data-lucide', iconName);
        if (extraClass) {
            iEl.className = extraClass;
        }
        existingIcon.replaceWith(iEl);
    }
}

// Generate Unique ID
function generateId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Format Time Relative
function formatRelativeTime(dateString) {
    if (!dateString) return 'Never';
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

// Calculate Stats (English & CJK support)
function calculateStats(text) {
    const chars = text.length;
    const wordsClean = text.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    const wordMatches = wordsClean.match(/[\u4e00-\u9fa5]|\b\w+\b/g);
    const words = wordMatches ? wordMatches.length : 0;
    
    const minutes = Math.max(1, Math.ceil(words / 250));
    
    return { chars, words, readTime: `${minutes} min` };
}

// Simple Markdown Parser (Client Only)
function parseMarkdown(text) {
    if (!text) return '<p class="empty-markdown">No content yet...</p>';
    
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    html = html.replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    html = html.replace(/^\d+\. (.*$)/gim, '<ol><li>$1</li></ol>');
    html = html.replace(/<\/ol>\s*<ol>/g, '');

    const lines = html.split('\n');
    let output = '';
    let inParagraph = false;

    for (let line of lines) {
        let trimmed = line.trim();
        if (trimmed === '') {
            if (inParagraph) {
                output += '</p>';
                inParagraph = false;
            }
            continue;
        }

        const isBlock = /^(<h[1-6]|<pre|<code|<blockquote|<ul|<ol|<li|<\/?hr)/i.test(trimmed);

        if (isBlock) {
            if (inParagraph) {
                output += '</p>';
                inParagraph = false;
            }
            output += line + '\n';
        } else {
            if (!inParagraph) {
                output += '<p>';
                inParagraph = true;
            } else {
                output += '<br>';
            }
            output += line + '\n';
        }
    }
    if (inParagraph) {
        output += '</p>';
    }

    return output;
}

// --- Auth Handling ---

function toggleAuthMode(e) {
    if (e) e.preventDefault();
    authErrorMsg.classList.add('hidden');
    
    if (state.authMode === 'login') {
        state.authMode = 'register';
        authTitle.textContent = 'Create an Account';
        authSubtitle.textContent = 'Setup your secure cloud notebook';
        authSubmitBtn.querySelector('span').textContent = 'Sign Up';
        authSwitchText.innerHTML = 'Already have an account? <a href="#" id="auth-switch-link">Sign in</a>';
    } else {
        state.authMode = 'login';
        authTitle.textContent = 'Sign in to Zenote';
        authSubtitle.textContent = 'Capture your thoughts and sync across devices';
        authSubmitBtn.querySelector('span').textContent = 'Sign In';
        authSwitchText.innerHTML = 'Don\'t have an account? <a href="#" id="auth-switch-link">Sign up</a>';
    }
    
    document.getElementById('auth-switch-link').addEventListener('click', toggleAuthMode);
    lucide.createIcons();
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    authErrorMsg.classList.add('hidden');
    
    const email = authEmail.value.trim();
    const password = authPassword.value;
    
    authSubmitBtn.disabled = true;
    authSubmitBtn.querySelector('span').textContent = state.authMode === 'login' ? 'Signing In...' : 'Signing Up...';
    
    if (!supabaseClient) {
        // Local Offline Demo Mode
        setTimeout(() => {
            state.user = { email: email, id: 'mock_user_123' };
            state.isGuest = false;
            state.isApproved = true;
            localStorage.setItem('zenote_mock_user', JSON.stringify(state.user));
            
            authSubmitBtn.disabled = false;
            authSubmitBtn.querySelector('span').textContent = 'Sign In';
            
            authOverlay.classList.add('hidden');
            document.querySelector('.app-container').classList.remove('hidden');
            
            userEmail.textContent = email;
            
            loadLocalStorage();
            renderApp();
            lucide.createIcons();
        }, 800);
        return;
    }
    
    try {
        if (state.authMode === 'login') {
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient.auth.signUp({
                email: email,
                password: password
            });
            if (error) throw error;
            
            if (data.user && !data.session) {
                alert('Registration successful! Please check your email inbox to confirm your account before logging in.');
                toggleAuthMode();
            }
        }
    } catch (err) {
        authErrorText.textContent = err.message || 'Authentication failed. Please verify your credentials.';
        authErrorMsg.classList.remove('hidden');
        lucide.createIcons();
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.querySelector('span').textContent = state.authMode === 'login' ? 'Sign In' : 'Sign Up';
    }
}

// Handle guest mode login
function handleGuestLogin() {
    state.user = { email: 'guest@zenote.local', id: 'guest_user' };
    state.isGuest = true;
    state.isApproved = true;
    
    // Save Guest Mode state to LocalStorage
    localStorage.setItem('zenote_guest_mode', 'true');
    
    // UI Transitions
    authOverlay.classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    userEmail.textContent = 'Guest Mode';
    
    loadLocalStorage();
    renderApp();
    lucide.createIcons();
}

async function handleLogout(e) {
    if (e) e.preventDefault();
    
    // Clean all authentication local storage keys
    localStorage.removeItem('zenote_guest_mode');
    localStorage.removeItem('zenote_mock_user');
    state.isGuest = false;
    state.user = null;
    state.activeNoteId = null;
    state.isApproved = false;
    
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    } else {
        authOverlay.classList.remove('hidden');
        document.querySelector('.app-container').classList.add('hidden');
        state.notes = [];
        renderApp();
    }
}

// Query the user's admin approval status in the profiles database table
async function checkApprovalStatus(userId) {
    if (!supabaseClient) return true;
    try {
        const { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('approved')
            .eq('id', userId)
            .single();
            
        if (error) {
            console.error('Check approval error:', error);
            return false;
        }
        return profile ? profile.approved : false;
    } catch (err) {
        console.error(err);
        return false;
    }
}

async function checkAuthSession() {
    // 1. Check if Guest Mode was active
    const isGuestModeSaved = localStorage.getItem('zenote_guest_mode') === 'true';
    if (isGuestModeSaved) {
        state.user = { email: 'guest@zenote.local', id: 'guest_user' };
        state.isGuest = true;
        state.isApproved = true;
        userEmail.textContent = 'Guest Mode';
        authOverlay.classList.add('hidden');
        document.querySelector('.app-container').classList.remove('hidden');
        loadLocalStorage();
        renderApp();
        return;
    }

    if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            state.user = session.user;
            state.isGuest = false;
            userEmail.textContent = session.user.email;
            authOverlay.classList.add('hidden');
            document.querySelector('.app-container').classList.remove('hidden');
            
            // Check authorization approval
            state.isApproved = await checkApprovalStatus(session.user.id);
            if (state.isApproved) {
                await fetchNotesFromSupabase();
            } else {
                renderApp();
            }
        } else {
            state.user = null;
            authOverlay.classList.remove('hidden');
            document.querySelector('.app-container').classList.add('hidden');
        }
        
        // Listen for Authentication State Shifts
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                state.user = session.user;
                state.isGuest = false;
                userEmail.textContent = session.user.email;
                authOverlay.classList.add('hidden');
                document.querySelector('.app-container').classList.remove('hidden');
                
                state.isApproved = await checkApprovalStatus(session.user.id);
                if (state.isApproved) {
                    await fetchNotesFromSupabase();
                } else {
                    renderApp();
                }
            } else {
                // Ignore if logged in as guest
                if (localStorage.getItem('zenote_guest_mode') === 'true') return;
                
                state.user = null;
                authOverlay.classList.remove('hidden');
                document.querySelector('.app-container').classList.add('hidden');
                state.notes = [];
                state.activeNoteId = null;
                state.isApproved = false;
                renderApp();
            }
        });
    } else {
        // Local Mock Mode: Verify credentials in browser cache
        const savedMockUser = localStorage.getItem('zenote_mock_user');
        if (savedMockUser) {
            state.user = JSON.parse(savedMockUser);
            state.isApproved = true;
            state.isGuest = false;
            userEmail.textContent = state.user.email;
            authOverlay.classList.add('hidden');
            document.querySelector('.app-container').classList.remove('hidden');
            loadLocalStorage();
            renderApp();
        } else {
            state.user = null;
            state.isApproved = false;
            authOverlay.classList.remove('hidden');
            document.querySelector('.app-container').classList.add('hidden');
            
            // Inject Offline Mode warning banner
            const authHeader = document.querySelector('.auth-header');
            if (!authHeader.querySelector('.offline-badge')) {
                const warning = document.createElement('div');
                warning.className = 'auth-error-msg offline-badge';
                warning.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                warning.style.color = '#f59e0b';
                warning.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                warning.style.margin = '10px 0 0 0';
                warning.innerHTML = '<i data-lucide="help-circle" class="error-icon"></i><span>No Supabase keys configured. Running in **local offline demo mode**. Enter any email/password or click guest mode to start.</span>';
                authHeader.appendChild(warning);
                lucide.createIcons();
            }
        }
    }
}

// --- App Operations ---

// Fetch notes list from cloud
async function fetchNotesFromSupabase() {
    if (!supabaseClient || !state.user || state.isGuest) return;
    
    saveIndicator.classList.remove('hidden');
    saveIndicator.classList.add('saving');
    saveIndicator.querySelector('span').textContent = 'Syncing cloud data...';
    setIcon(saveIndicator, 'rotate-cw', 'status-icon success');
    lucide.createIcons();
    
    try {
        const { data, error } = await supabaseClient
            .from('notes')
            .select('*')
            .order('updated_at', { ascending: false });
            
        if (error) throw error;
        
        state.notes = data.map(dbNote => ({
            id: dbNote.id,
            title: dbNote.title || '',
            content: dbNote.content || '',
            category: dbNote.category || 'personal',
            createdAt: dbNote.created_at,
            updatedAt: dbNote.updated_at
        }));
        
        // Cache to LocalStorage
        localStorage.setItem('zenote_notes', JSON.stringify(state.notes));
        
        // Set Active Note
        if (state.notes.length > 0) {
            if (!state.activeNoteId || !state.notes.find(n => n.id === state.activeNoteId)) {
                state.activeNoteId = state.notes[0].id;
            }
        } else {
            state.activeNoteId = null;
        }
        
        renderApp();
    } catch (err) {
        console.error('Fetch notes error:', err);
    } finally {
        saveIndicator.classList.remove('saving');
        saveIndicator.querySelector('span').textContent = 'Cloud synced';
        setIcon(saveIndicator, 'cloud-lightning', 'status-icon success');
        lucide.createIcons();
    }
}

// Load cache notes from local storage
function loadLocalStorage() {
    const savedNotes = localStorage.getItem('zenote_notes');
    const savedTheme = localStorage.getItem('zenote_theme');
    const savedActiveId = localStorage.getItem('zenote_active_id');

    state.notes = savedNotes ? JSON.parse(savedNotes) : [];
    state.theme = savedTheme || 'dark';
    state.activeNoteId = savedActiveId || (state.notes.length > 0 ? state.notes[0].id : null);

    document.body.className = `theme-${state.theme}`;
}

// Save cache notes to local storage
function saveLocalStorage() {
    localStorage.setItem('zenote_notes', JSON.stringify(state.notes));
    localStorage.setItem('zenote_active_id', state.activeNoteId);
    localStorage.setItem('zenote_theme', state.theme);
}

// Create new note
async function createNewNote() {
    const newNote = {
        id: generateId(),
        title: '',
        content: '',
        category: 'personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    state.notes.unshift(newNote);
    state.activeNoteId = newNote.id;
    
    state.isPreviewMode = false;
    updatePreviewButtonUI();
    
    saveLocalStorage();
    renderApp();
    
    noteTitleInput.focus();
    
    // Sync creation to Supabase
    if (supabaseClient && state.user && !state.isGuest) {
        try {
            await supabaseClient.from('notes').insert({
                id: newNote.id,
                user_id: state.user.id,
                title: newNote.title,
                content: newNote.content,
                category: newNote.category,
                created_at: newNote.createdAt,
                updated_at: newNote.updatedAt
            });
        } catch (err) {
            console.error('Supabase insert note error:', err);
        }
    }
}

// Delete current note
async function deleteActiveNote() {
    if (!state.activeNoteId) return;
    
    const index = state.notes.findIndex(note => note.id === state.activeNoteId);
    if (index === -1) return;

    if (confirm('Are you sure you want to delete this note? This action cannot be undone.')) {
        const deletedId = state.activeNoteId;
        state.notes.splice(index, 1);
        
        if (state.notes.length > 0) {
            const newIndex = Math.min(index, state.notes.length - 1);
            state.activeNoteId = state.notes[newIndex].id;
        } else {
            state.activeNoteId = null;
        }

        saveLocalStorage();
        renderApp();
        
        // Sync deletion to Supabase
        if (supabaseClient && state.user && !state.isGuest) {
            try {
                await supabaseClient
                    .from('notes')
                    .delete()
                    .eq('id', deletedId);
            } catch (err) {
                console.error('Supabase delete note error:', err);
            }
        }
    }
}

// Trigger auto save routines
function triggerAutoSave() {
    saveIndicator.classList.remove('hidden');
    saveIndicator.classList.add('saving');
    saveIndicator.querySelector('span').textContent = 'Saving...';
    setIcon(saveIndicator, 'rotate-cw', 'status-icon success');
    lucide.createIcons();

    if (saveTimeout) clearTimeout(saveTimeout);

    saveTimeout = setTimeout(async () => {
        const activeNote = state.notes.find(note => note.id === state.activeNoteId);
        if (activeNote) {
            activeNote.title = noteTitleInput.value;
            activeNote.content = noteContentInput.value;
            activeNote.category = noteCategorySelect.value;
            activeNote.updatedAt = new Date().toISOString();

            saveLocalStorage();
            renderNotesList();
            
            updateStats(activeNote.content, activeNote.updatedAt);
            
            // Sync update to Supabase
            if (supabaseClient && state.user && !state.isGuest) {
                try {
                    await supabaseClient.from('notes').upsert({
                        id: activeNote.id,
                        user_id: state.user.id,
                        title: activeNote.title,
                        content: activeNote.content,
                        category: activeNote.category,
                        updated_at: activeNote.updatedAt
                    });
                } catch (err) {
                    console.error('Supabase upsert note error:', err);
                }
            }
            
            saveIndicator.classList.remove('saving');
            saveIndicator.querySelector('span').textContent = 'Auto-saved';
            setIcon(saveIndicator, 'cloud-lightning', 'status-icon success');
            lucide.createIcons();
        }
    }, 500);
}

// Update stats pane
function updateStats(content, updatedAt) {
    const stats = calculateStats(content || '');
    charCountEl.textContent = stats.chars;
    wordCountEl.textContent = stats.words;
    readTimeEl.textContent = stats.readTime;
    modifiedTimeEl.textContent = formatRelativeTime(updatedAt);
}

// Select active note
function selectNote(noteId) {
    state.activeNoteId = noteId;
    saveLocalStorage();
    renderApp();
}

// Toggle preview panels and format markdown
function updatePreviewButtonUI() {
    const label = togglePreviewBtn.querySelector('span');
    
    if (state.isPreviewMode) {
        setIcon(togglePreviewBtn, 'edit-2');
        label.textContent = 'Edit';
        editPane.classList.add('hidden');
        previewPane.classList.remove('hidden');
        
        const activeNote = state.notes.find(note => note.id === state.activeNoteId);
        if (activeNote) {
            previewTitle.textContent = activeNote.title || 'Untitled Note';
            previewBody.innerHTML = parseMarkdown(activeNote.content);
        }
    } else {
        setIcon(togglePreviewBtn, 'eye');
        label.textContent = 'Preview';
        editPane.classList.remove('hidden');
        previewPane.classList.add('hidden');
    }
    lucide.createIcons();
}

// Export notes array to JSON file
function exportNotes() {
    if (state.notes.length === 0) {
        alert('There are no notes to export!');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.notes, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `zenote_backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Import JSON note backups
function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) {
                throw new Error('Invalid backup format. Must be a JSON array.');
            }

            const isValid = imported.every(note => note.id && typeof note.title === 'string' && typeof note.content === 'string');
            if (!isValid) {
                throw new Error('Data fields missing. Backup file might be corrupted.');
            }

            const isMerge = confirm(`Successfully parsed ${imported.length} notes. Do you want to merge them into your existing notes? (Select Cancel to overwrite all existing notes.)`);
            
            if (isMerge) {
                const existingIds = new Set(state.notes.map(n => n.id));
                imported.forEach(n => {
                    if (!existingIds.has(n.id)) {
                        state.notes.push(n);
                    } else {
                        n.id = generateId();
                        state.notes.push(n);
                    }
                });
            } else {
                state.notes = imported;
            }

            if (state.notes.length > 0) {
                state.activeNoteId = state.notes[0].id;
            }
            
            saveLocalStorage();
            
            // Sync import list to Supabase database if logged in
            if (supabaseClient && state.user && !state.isGuest) {
                for (let note of state.notes) {
                    await supabaseClient.from('notes').upsert({
                        id: note.id,
                        user_id: state.user.id,
                        title: note.title,
                        content: note.content,
                        category: note.category,
                        updated_at: note.updatedAt
                    });
                }
            }
            
            renderApp();
            alert('Import and sync successful!');
        } catch (err) {
            alert('Import failed: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Download current note as plain text
function downloadActiveNoteText() {
    const activeNote = state.notes.find(note => note.id === state.activeNoteId);
    if (!activeNote) return;

    const title = activeNote.title || 'Untitled Note';
    const textContent = `${title}\nCreated: ${new Date(activeNote.createdAt).toLocaleString()}\nModified: ${new Date(activeNote.updatedAt).toLocaleString()}\nCategory: ${activeNote.category}\n-----------------------------------\n\n${activeNote.content}`;
    
    const element = document.createElement('a');
    const file = new Blob([textContent], {type: 'text/plain;charset=utf-8'});
    element.href = URL.createObjectURL(file);
    element.download = `${title.replace(/[\/\\?%*:|"<>\s]/g, '_')}.txt`;
    document.body.appendChild(element);
    element.click();
    element.remove();
}

// --- Render Operations ---

// Render sidebar list items
function renderNotesList() {
    notesList.innerHTML = '';
    
    let filteredNotes = state.notes.filter(note => {
        if (state.selectedCategoryFilter !== 'all' && note.category !== state.selectedCategoryFilter) {
            return false;
        }
        
        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            const titleMatch = (note.title || '').toLowerCase().includes(query);
            const contentMatch = (note.content || '').toLowerCase().includes(query);
            return titleMatch || contentMatch;
        }
        
        return true;
    });

    if (filteredNotes.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
    }

    filteredNotes.forEach(note => {
        const noteItem = document.createElement('div');
        noteItem.className = `note-item ${note.id === state.activeNoteId ? 'active' : ''}`;
        noteItem.setAttribute('data-id', note.id);
        
        const titleText = note.title.trim() || 'Untitled Note';
        const excerptText = note.content.trim() || 'No content yet...';
        const relativeTime = formatRelativeTime(note.updatedAt);
        const categoryLabel = {
            personal: 'Personal',
            work: 'Work',
            ideas: 'Ideas',
            todo: 'Todo'
        }[note.category] || 'None';

        noteItem.innerHTML = `
            <div class="note-item-header">
                <span class="note-item-title">${titleText}</span>
                <span class="note-badge badge-${note.category}">${categoryLabel}</span>
            </div>
            <p class="note-item-excerpt">${excerptText}</p>
            <div class="note-item-footer">
                <span>${relativeTime}</span>
            </div>
        `;

        noteItem.addEventListener('click', () => selectNote(note.id));
        notesList.appendChild(noteItem);
    });
}

// Render entire workspace pages
function renderApp() {
    // Check approval state block
    if (state.user && !state.isApproved) {
        pendingView.classList.remove('hidden');
        editorView.classList.add('hidden');
        welcomeView.classList.add('hidden');
        
        // Disable sidebar controls
        newNoteBtn.disabled = true;
        searchInput.disabled = true;
        notesList.innerHTML = '<div class="empty-state"><i data-lucide="shield-alert"></i><p>Awaiting account approval...</p></div>';
        lucide.createIcons();
        return;
    }

    // Re-enable sidebar controls
    newNoteBtn.disabled = false;
    searchInput.disabled = false;
    pendingView.classList.add('hidden');

    renderNotesList();

    const activeNote = state.notes.find(note => note.id === state.activeNoteId);

    if (activeNote) {
        welcomeView.classList.add('hidden');
        editorView.classList.remove('hidden');

        noteTitleInput.value = activeNote.title || '';
        noteContentInput.value = activeNote.content || '';
        noteCategorySelect.value = activeNote.category || 'personal';

        updateStats(activeNote.content || '', activeNote.updatedAt);
        updatePreviewButtonUI();
    } else {
        welcomeView.classList.remove('hidden');
        editorView.classList.add('hidden');
    }
}

// --- Event Listeners ---

function init() {
    // Audit authentication sessions
    checkAuthSession();

    // Notes triggers
    newNoteBtn.addEventListener('click', createNewNote);
    welcomeNewBtn.addEventListener('click', createNewNote);
    deleteNoteBtn.addEventListener('click', deleteActiveNote);

    noteTitleInput.addEventListener('input', triggerAutoSave);
    noteContentInput.addEventListener('input', triggerAutoSave);
    noteCategorySelect.addEventListener('change', triggerAutoSave);

    // Search query listener
    searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderNotesList();
    });

    // Sidebar tags filter pills
    categoryFilters.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryFilters.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.selectedCategoryFilter = pill.getAttribute('data-category');
            renderNotesList();
        });
    });

    // Theme toggle
    themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.body.className = `theme-${state.theme}`;
        saveLocalStorage();
    });

    // Preview button
    togglePreviewBtn.addEventListener('click', () => {
        state.isPreviewMode = !state.isPreviewMode;
        updatePreviewButtonUI();
    });

    // Download/Export triggers
    downloadTxtBtn.addEventListener('click', downloadActiveNoteText);
    exportBtn.addEventListener('click', exportNotes);
    
    // Import backups triggers
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', handleImportFile);

    // Signin/Signup controls
    authForm.addEventListener('submit', handleAuthSubmit);
    authSwitchLink.addEventListener('click', toggleAuthMode);
    authGuestBtn.addEventListener('click', handleGuestLogin);
    logoutBtn.addEventListener('click', handleLogout);

    // Refresh approval status
    checkApprovalBtn.addEventListener('click', async () => {
        const span = checkApprovalBtn.querySelector('span');
        const originalText = span.textContent;
        span.textContent = 'Checking...';
        checkApprovalBtn.disabled = true;
        
        await checkAuthSession();
        
        span.textContent = originalText;
        checkApprovalBtn.disabled = false;
    });

    // Register Service Worker for PWA offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg))
            .catch(err => console.error('Service Worker registration failed:', err));
    }

    // Parse Lucide SVG elements
    lucide.createIcons();
}

// Bootstrap app on DOM ready
window.addEventListener('DOMContentLoaded', init);
