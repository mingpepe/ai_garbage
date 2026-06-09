// --- Supabase Configuration ---
const SUPABASE_URL = 'https://caplmkwpriwwxdyghybp.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhcGxta3dwcml3d3hkeWdoeWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjMyOTYsImV4cCI6MjA5NjQ5OTI5Nn0.2J9W6apoYBVzvhpMqmR6PFhGQzWUuM46p46TIUaBCQY';

// Initialize Supabase Client
let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// --- State Management ---
let state = {
    user: null,
    isGuest: false,
    isApproved: true,
    authMode: 'login', // 'login' or 'register'
    theme: 'dark',
    activeTab: 'timer', // 'timer', 'tasks', 'analytics'
    
    // Timer States
    timer: {
        timeLeft: 1500, // 25 mins in seconds
        totalDuration: 1500,
        timerId: null,
        isRunning: false,
        activeMode: 'focus', // 'focus', 'short', 'long'
        modes: {
            focus: 1500, // 25 min
            short: 300,  // 5 min
            long: 900    // 15 min
        }
    },
    
    // Core Data
    tasks: [],
    activeTaskId: null,
    sessions: [],
    taskFilter: 'all'
};

// --- DOM Elements ---
// Auth Elements
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
const pendingView = document.getElementById('pending-view');
const checkApprovalBtn = document.getElementById('check-approval-btn');

// App Elements
const userEmail = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const themeToggle = document.getElementById('theme-toggle');
const sidebarNavItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// Timer Elements
const timerTime = document.getElementById('timer-time');
const timerStatus = document.getElementById('timer-status');
const timerToggleBtn = document.getElementById('timer-toggle-btn');
const timerResetBtn = document.getElementById('timer-reset-btn');
const activeTaskTitle = document.getElementById('active-task-title');
const modeButtons = document.querySelectorAll('.mode-btn');
const progressCircle = document.querySelector('.progress-ring-circle');

// Tasks Elements
const taskForm = document.getElementById('task-form');
const taskTitleInput = document.getElementById('task-title-input');
const taskCategorySelect = document.getElementById('task-category-select');
const tasksList = document.getElementById('tasks-list');
const tasksEmptyState = document.getElementById('tasks-empty-state');
const taskFilterBtns = document.querySelectorAll('.task-filter-btn');

// Analytics Elements
const statTotalTime = document.getElementById('stat-total-time');
const statSessionsCount = document.getElementById('stat-sessions-count');
const statTodayTime = document.getElementById('stat-today-time');
const historyTbody = document.getElementById('history-tbody');
const historyEmptyState = document.getElementById('history-empty-state');

// Circular Progress Perimeter Calculation (2 * Math.PI * r)
const circleRadius = 130;
const circumference = 2 * Math.PI * circleRadius; // ~816.81

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
    return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Format Seconds to MM:SS
function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// Synth bell alert sound (No external file dependencies, completely local oscillator)
function playBellSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
        osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.15); // A4 note
        
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6); // Fade out
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.6);
    } catch (err) {
        console.error('Audio synthesis failed:', err);
    }
}

// --- Auth Handling ---

function toggleAuthMode(e) {
    if (e) e.preventDefault();
    authErrorMsg.classList.add('hidden');
    
    if (state.authMode === 'login') {
        state.authMode = 'register';
        authTitle.textContent = 'Create an Account';
        authSubtitle.textContent = 'Track your focus intervals and habits';
        authSubmitBtn.querySelector('span').textContent = 'Sign Up';
        authSwitchText.innerHTML = 'Already have an account? <a href="#" id="auth-switch-link">Sign in</a>';
    } else {
        state.authMode = 'login';
        authTitle.textContent = 'Sign in to Zenfocus';
        authSubtitle.textContent = 'Track your focus intervals and habits';
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
            localStorage.setItem('zenfocus_mock_user', JSON.stringify(state.user));
            
            authSubmitBtn.disabled = false;
            authSubmitBtn.querySelector('span').textContent = 'Sign In';
            
            authOverlay.classList.add('hidden');
            document.querySelector('.app-container').classList.remove('hidden');
            
            userEmail.textContent = email;
            
            loadLocalCache();
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
        authErrorText.textContent = err.message || 'Authentication failed. Please check your credentials.';
        authErrorMsg.classList.remove('hidden');
        lucide.createIcons();
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.querySelector('span').textContent = state.authMode === 'login' ? 'Sign In' : 'Sign Up';
    }
}

function handleGuestLogin() {
    state.user = { email: 'guest@zenfocus.local', id: 'guest_user' };
    state.isGuest = true;
    state.isApproved = true;
    
    localStorage.setItem('zenfocus_guest_mode', 'true');
    
    authOverlay.classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    userEmail.textContent = 'Guest Mode';
    
    loadLocalCache();
    renderApp();
    lucide.createIcons();
}

async function handleLogout(e) {
    if (e) e.preventDefault();
    
    // Stop active timers
    resetTimer();

    localStorage.removeItem('zenfocus_guest_mode');
    localStorage.removeItem('zenfocus_mock_user');
    state.isGuest = false;
    state.user = null;
    state.isApproved = false;
    state.tasks = [];
    state.sessions = [];
    state.activeTaskId = null;
    
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    } else {
        authOverlay.classList.remove('hidden');
        document.querySelector('.app-container').classList.add('hidden');
        renderApp();
    }
}

async function checkApprovalStatus(userId) {
    if (!supabaseClient) return true;
    try {
        // Query the profile database row (shares approval status with client-notepad!)
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
    const isGuestModeSaved = localStorage.getItem('zenfocus_guest_mode') === 'true';
    if (isGuestModeSaved) {
        state.user = { email: 'guest@zenfocus.local', id: 'guest_user' };
        state.isGuest = true;
        state.isApproved = true;
        userEmail.textContent = 'Guest Mode';
        authOverlay.classList.add('hidden');
        document.querySelector('.app-container').classList.remove('hidden');
        loadLocalCache();
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
            
            state.isApproved = await checkApprovalStatus(session.user.id);
            if (state.isApproved) {
                await fetchCloudData();
            } else {
                renderApp();
            }
        } else {
            state.user = null;
            authOverlay.classList.remove('hidden');
            document.querySelector('.app-container').classList.add('hidden');
        }
        
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session) {
                state.user = session.user;
                state.isGuest = false;
                userEmail.textContent = session.user.email;
                authOverlay.classList.add('hidden');
                document.querySelector('.app-container').classList.remove('hidden');
                
                state.isApproved = await checkApprovalStatus(session.user.id);
                if (state.isApproved) {
                    await fetchCloudData();
                } else {
                    renderApp();
                }
            } else {
                if (localStorage.getItem('zenfocus_guest_mode') === 'true') return;
                
                state.user = null;
                authOverlay.classList.remove('hidden');
                document.querySelector('.app-container').classList.add('hidden');
                state.tasks = [];
                state.sessions = [];
                state.activeTaskId = null;
                state.isApproved = false;
                renderApp();
            }
        });
    } else {
        const savedMockUser = localStorage.getItem('zenfocus_mock_user');
        if (savedMockUser) {
            state.user = JSON.parse(savedMockUser);
            state.isApproved = true;
            state.isGuest = false;
            userEmail.textContent = state.user.email;
            authOverlay.classList.add('hidden');
            document.querySelector('.app-container').classList.remove('hidden');
            loadLocalCache();
            renderApp();
        } else {
            state.user = null;
            state.isApproved = false;
            authOverlay.classList.remove('hidden');
            document.querySelector('.app-container').classList.add('hidden');
            
            const authHeader = document.querySelector('.auth-header');
            if (!authHeader.querySelector('.offline-badge')) {
                const warning = document.createElement('div');
                warning.className = 'auth-error-msg offline-badge';
                warning.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
                warning.style.color = '#f59e0b';
                warning.style.borderColor = 'rgba(245, 158, 11, 0.2)';
                warning.style.margin = '10px 0 0 0';
                warning.innerHTML = '<i data-lucide="help-circle" class="error-icon"></i><span>No Supabase keys configured. Running in **local offline demo mode**. Enter any credentials or click guest to enter.</span>';
                authHeader.appendChild(warning);
                lucide.createIcons();
            }
        }
    }
}

// --- Database Operations ---

// Fetch tasks and focus history logs from Supabase
async function fetchCloudData() {
    if (!supabaseClient || !state.user || state.isGuest) return;
    
    try {
        // Fetch Tasks list
        const { data: tasks, error: taskErr } = await supabaseClient
            .from('focus_tasks')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (taskErr) throw taskErr;
        
        // Fetch Focus Sessions list
        const { data: sessions, error: sessionErr } = await supabaseClient
            .from('focus_sessions')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (sessionErr) throw sessionErr;

        state.tasks = tasks.map(t => ({
            id: t.id,
            title: t.title,
            category: t.category,
            completed: t.completed
        }));

        state.sessions = sessions.map(s => ({
            id: s.id,
            taskTitle: s.task_title,
            category: s.category,
            duration: s.duration,
            createdAt: s.created_at
        }));

        // Cache loaded cloud details locally
        saveLocalCache();
        renderApp();
    } catch (err) {
        console.error('Fetch cloud data error:', err);
    }
}

function loadLocalCache() {
    const cachedTasks = localStorage.getItem('zenfocus_tasks');
    const cachedSessions = localStorage.getItem('zenfocus_sessions');
    
    state.tasks = cachedTasks ? JSON.parse(cachedTasks) : [];
    state.sessions = cachedSessions ? JSON.parse(cachedSessions) : [];
}

function saveLocalCache() {
    localStorage.setItem('zenfocus_tasks', JSON.stringify(state.tasks));
    localStorage.setItem('zenfocus_sessions', JSON.stringify(state.sessions));
}

// --- Focus Timer Operations ---

// Set progress ring circle offsets
function setProgress(percent) {
    const offset = circumference - (percent / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
}

function updateTimerDisplay() {
    timerTime.textContent = formatTime(state.timer.timeLeft);
    const progressPercent = (state.timer.timeLeft / state.timer.totalDuration) * 100;
    setProgress(progressPercent);
}

function switchTimerMode(mode) {
    resetTimer();
    state.timer.activeMode = mode;
    state.timer.totalDuration = state.timer.modes[mode];
    state.timer.timeLeft = state.timer.modes[mode];
    
    // Update active tab styles
    modeButtons.forEach(btn => {
        if (btn.getAttribute('data-mode') === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update status text
    const statusLabels = {
        focus: 'Get to work!',
        short: 'Take a quick break!',
        long: 'Take a long break!'
    };
    timerStatus.textContent = statusLabels[mode] || '';
    
    updateTimerDisplay();
}

function toggleTimer() {
    if (state.timer.isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (state.timer.isRunning) return;
    
    state.timer.isRunning = true;
    setIcon(timerToggleBtn, 'pause');
    timerToggleBtn.querySelector('span').textContent = 'Pause';
    
    state.timer.timerId = setInterval(() => {
        state.timer.timeLeft--;
        updateTimerDisplay();
        
        if (state.timer.timeLeft <= 0) {
            handleSessionComplete();
        }
    }, 1000);
}

function pauseTimer() {
    if (!state.timer.isRunning) return;
    
    state.timer.isRunning = false;
    clearInterval(state.timer.timerId);
    state.timer.timerId = null;
    setIcon(timerToggleBtn, 'play');
    timerToggleBtn.querySelector('span').textContent = 'Start';
}

function resetTimer() {
    pauseTimer();
    state.timer.timeLeft = state.timer.totalDuration;
    updateTimerDisplay();
}

// Session Complete Trigger
async function handleSessionComplete() {
    pauseTimer();
    playBellSound();

    const modeCompleted = state.timer.activeMode;
    
    if (modeCompleted === 'focus') {
        const activeTask = state.tasks.find(t => t.id === state.activeTaskId);
        const taskName = activeTask ? activeTask.title : 'General Focus';
        const category = activeTask ? activeTask.category : 'work';
        const minutesFocus = Math.round(state.timer.totalDuration / 60);

        const newSession = {
            id: generateId(),
            taskTitle: taskName,
            category: category,
            duration: minutesFocus,
            createdAt: new Date().toISOString()
        };

        state.sessions.unshift(newSession);
        saveLocalCache();
        renderAnalytics();

        // Sync Focus Session to Supabase
        if (supabaseClient && state.user && !state.isGuest) {
            try {
                await supabaseClient.from('focus_sessions').insert({
                    id: newSession.id,
                    user_id: state.user.id,
                    task_title: newSession.taskTitle,
                    category: newSession.category,
                    duration: newSession.duration,
                    created_at: newSession.createdAt
                });
            } catch (err) {
                console.error('Supabase save focus session error:', err);
            }
        }
        
        alert(`Great job! You completed a ${minutesFocus} minute focus interval.`);
        switchTimerMode('short');
    } else {
        alert('Break interval finished. Ready to focus again?');
        switchTimerMode('focus');
    }
}

// --- Tasks Tracker Operations ---

// Add new task
async function addTask(title, category) {
    const newTask = {
        id: generateId(),
        title: title,
        category: category,
        completed: false
    };

    state.tasks.push(newTask);
    saveLocalCache();
    renderTasksList();

    // If no active task is selected, default to this new task
    if (!state.activeTaskId) {
        selectActiveTask(newTask.id);
    }

    // Sync task to Supabase
    if (supabaseClient && state.user && !state.isGuest) {
        try {
            await supabaseClient.from('focus_tasks').insert({
                id: newTask.id,
                user_id: state.user.id,
                title: newTask.title,
                category: newTask.category,
                completed: newTask.completed
            });
        } catch (err) {
            console.error('Supabase save task error:', err);
        }
    }
}

// Toggle task completion
async function toggleTaskCompleted(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    saveLocalCache();
    renderTasksList();

    // Sync completion status to Supabase
    if (supabaseClient && state.user && !state.isGuest) {
        try {
            await supabaseClient
                .from('focus_tasks')
                .update({ completed: task.completed, updated_at: new Date().toISOString() })
                .eq('id', taskId);
        } catch (err) {
            console.error('Supabase update task error:', err);
        }
    }
}

// Select active task for timer focus
function selectActiveTask(taskId) {
    state.activeTaskId = taskId;
    const task = state.tasks.find(t => t.id === taskId);
    
    if (task) {
        activeTaskTitle.textContent = task.title;
        activeTaskTitle.style.color = 'var(--text-primary)';
    } else {
        activeTaskTitle.textContent = 'No task selected';
        activeTaskTitle.style.color = 'var(--text-muted)';
    }
    
    renderTasksList();
}

// Delete task
async function deleteTask(taskId) {
    const index = state.tasks.findIndex(t => t.id === taskId);
    if (index === -1) return;

    state.tasks.splice(index, 1);
    
    if (state.activeTaskId === taskId) {
        state.activeTaskId = state.tasks.length > 0 ? state.tasks[0].id : null;
        selectActiveTask(state.activeTaskId);
    }

    saveLocalCache();
    renderTasksList();

    // Sync deletion to Supabase
    if (supabaseClient && state.user && !state.isGuest) {
        try {
            await supabaseClient
                .from('focus_tasks')
                .delete()
                .eq('id', taskId);
        } catch (err) {
            console.error('Supabase delete task error:', err);
        }
    }
}

// --- Render Operations ---

// Render active tab view pane
function renderActiveTab() {
    sidebarNavItems.forEach(item => {
        if (item.getAttribute('data-tab') === state.activeTab) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    tabPanes.forEach(pane => {
        if (pane.id === `tab-view-${state.activeTab}`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });

    if (state.activeTab === 'analytics') {
        renderAnalytics();
    } else if (state.activeTab === 'tasks') {
        renderTasksList();
    }
}

// Render Tasks List UI
function renderTasksList() {
    tasksList.innerHTML = '';
    
    let filteredTasks = state.tasks.filter(t => {
        if (state.taskFilter === 'active') return !t.completed;
        if (state.taskFilter === 'completed') return t.completed;
        return true;
    });

    if (filteredTasks.length === 0) {
        tasksEmptyState.classList.remove('hidden');
    } else {
        tasksEmptyState.classList.add('hidden');
    }

    filteredTasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
        
        const categoryLabel = {
            work: 'Work',
            study: 'Study',
            health: 'Health',
            personal: 'Personal'
        }[task.category] || 'Work';

        taskItem.innerHTML = `
            <button class="task-checkbox-btn" aria-label="Toggle Complete">
                <i data-lucide="check"></i>
            </button>
            <span class="task-item-title">${task.title}</span>
            <span class="task-badge badge-${task.category}">${categoryLabel}</span>
            <div class="task-actions">
                <button class="btn-mini btn-focus ${state.activeTaskId === task.id ? 'active' : ''}" title="Focus on this task">
                    <i data-lucide="target"></i>
                </button>
                <button class="btn-mini text-danger btn-delete" title="Delete Task">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;

        // Checkbox complete trigger
        taskItem.querySelector('.task-checkbox-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleTaskCompleted(task.id);
        });

        // Set active focus task trigger
        taskItem.querySelector('.btn-focus').addEventListener('click', (e) => {
            e.stopPropagation();
            selectActiveTask(task.id);
        });

        // Delete trigger
        taskItem.querySelector('.btn-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTask(task.id);
        });

        tasksList.appendChild(taskItem);
    });

    lucide.createIcons();
}

// Render Analytics View Dashboard
function renderAnalytics() {
    // 1. Total Focus Time (sum durations)
    const totalMinutes = state.sessions.reduce((sum, s) => sum + s.duration, 0);
    statTotalTime.textContent = totalMinutes >= 60 
        ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m` 
        : `${totalMinutes}m`;

    // 2. Total Sessions
    statSessionsCount.textContent = state.sessions.length;

    // 3. Today's Focus time
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const todayMinutes = state.sessions
        .filter(s => new Date(s.createdAt) >= startOfToday)
        .reduce((sum, s) => sum + s.duration, 0);
        
    statTodayTime.textContent = `${todayMinutes}m`;

    // 4. Session Logs Table
    historyTbody.innerHTML = '';
    
    if (state.sessions.length === 0) {
        historyEmptyState.classList.remove('hidden');
    } else {
        historyEmptyState.classList.add('hidden');
        
        state.sessions.forEach(session => {
            const tr = document.createElement('tr');
            const formattedDate = new Date(session.createdAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            
            const categoryLabel = {
                work: 'Work',
                study: 'Study',
                health: 'Health',
                personal: 'Personal'
            }[session.category] || 'Work';

            tr.innerHTML = `
                <td>${formattedDate}</td>
                <td>${session.taskTitle}</td>
                <td><span class="task-badge badge-${session.category}">${categoryLabel}</span></td>
                <td>${session.duration} min</td>
            `;
            historyTbody.appendChild(tr);
        });
    }
    lucide.createIcons();
}

function renderApp() {
    // Check if account is not approved by administrator
    if (state.user && !state.isApproved) {
        pendingView.classList.remove('hidden');
        document.querySelector('.sidebar-nav').style.pointerEvents = 'none';
        document.querySelector('.sidebar-nav').style.opacity = '0.5';
        tabPanes.forEach(pane => pane.classList.remove('active'));
        return;
    }

    pendingView.classList.add('hidden');
    document.querySelector('.sidebar-nav').style.pointerEvents = 'auto';
    document.querySelector('.sidebar-nav').style.opacity = '1';

    renderActiveTab();
    
    // Set Active task widget under timer
    const activeTask = state.tasks.find(t => t.id === state.activeTaskId);
    selectActiveTask(activeTask ? activeTask.id : null);
}

// --- Event Listeners ---

function init() {
    // Parse circumference on load
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = circumference;
    
    // Verify sessions on start
    checkAuthSession();

    // Tab Navigation
    sidebarNavItems.forEach(item => {
        item.addEventListener('click', () => {
            state.activeTab = item.getAttribute('data-tab');
            renderActiveTab();
        });
    });

    // Theme Switcher Toggle
    themeToggle.addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.body.className = `theme-${state.theme}`;
        localStorage.setItem('zenfocus_theme', state.theme);
    });

    // Timer Mode buttons
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            switchTimerMode(mode);
        });
    });

    // Timer controls triggers
    timerToggleBtn.addEventListener('click', toggleTimer);
    timerResetBtn.addEventListener('click', resetTimer);

    // Task add form submission
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = taskTitleInput.value.trim();
        const category = taskCategorySelect.value;
        
        if (title) {
            addTask(title, category);
            taskTitleInput.value = '';
        }
    });

    // Task Filter Tabs
    taskFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            taskFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.taskFilter = btn.getAttribute('data-filter');
            renderTasksList();
        });
    });

    // Auth screen bindings
    authForm.addEventListener('submit', handleAuthSubmit);
    authSwitchLink.addEventListener('click', toggleAuthMode);
    authGuestBtn.addEventListener('click', handleGuestLogin);
    logoutBtn.addEventListener('click', handleLogout);

    // Refresh approval status action
    checkApprovalBtn.addEventListener('click', async () => {
        const span = checkApprovalBtn.querySelector('span');
        const originalText = span.textContent;
        span.textContent = 'Checking...';
        checkApprovalBtn.disabled = true;
        
        await checkAuthSession();
        
        span.textContent = originalText;
        checkApprovalBtn.disabled = false;
    });

    // Load theme configuration
    const savedTheme = localStorage.getItem('zenfocus_theme');
    if (savedTheme) {
        state.theme = savedTheme;
        document.body.className = `theme-${state.theme}`;
    }

    // Update timer visuals
    updateTimerDisplay();

    // Register Service Worker for PWA offline support
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg))
            .catch(err => console.error('Service Worker registration failed:', err));
    }

    lucide.createIcons();
}

window.addEventListener('DOMContentLoaded', init);
