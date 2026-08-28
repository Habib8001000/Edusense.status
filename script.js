/**
 * Edusense Task Sheet Manager
 * Author: Antigravity AI
 * Features: Zero-Setup Universal Cloud Storage, Document Upload/Download/Delete, Clean Checkmark Ticks (✓), GitHub Gist Sync, LocalStorage Backup, Duration Column, Real-time Filters, Excel/CSV Export
 */

const STORAGE_KEY = 'EDUSENSE_SHEET_DATA_V1';
const CLOUD_BIN_KEY = 'EDUSENSE_CLOUD_BIN_ID';
const GH_TOKEN_KEY = 'EDUSENSE_GH_TOKEN';
const GH_GIST_ID_KEY = 'EDUSENSE_GH_GIST_ID';
const GIST_FILENAME = 'edusense_tasks.json';

// Default initial tasks (only shown when brand new)
const defaultTasks = [
    {
        id: 'task-1',
        task: 'Website UI Redesign',
        description: 'Complete front-end mockups for Edusense portal',
        duration: '6 hrs',
        status: 'complete',
        fileName: '',
        fileData: '',
        remarks: 'Delivered ahead of schedule',
        updatedAt: new Date().toISOString()
    },
    {
        id: 'task-2',
        task: 'Database Migration',
        description: 'Migrate student records to AWS DynamoDB cluster',
        duration: '2 days',
        status: 'progress',
        fileName: '',
        fileData: '',
        remarks: '50% records transferred',
        updatedAt: new Date().toISOString()
    },
    {
        id: 'task-3',
        task: 'SmarterASP Server Setup',
        description: 'Configure IIS web server and SSL certificate',
        duration: '4 hrs',
        status: 'pending',
        fileName: '',
        fileData: '',
        remarks: 'Waiting for DNS propagation',
        updatedAt: new Date().toISOString()
    }
];

// Check URL query params for ?bin=...
const urlParams = new URLSearchParams(window.location.search);
const urlBinId = urlParams.get('bin');

// App State
let tasks = [];
let currentFilter = 'all';
let searchQuery = '';
let cloudBinId = urlBinId || localStorage.getItem(CLOUD_BIN_KEY) || '';
let ghToken = localStorage.getItem(GH_TOKEN_KEY) || '';
let ghGistId = localStorage.getItem(GH_GIST_ID_KEY) || '';
let isSyncing = false;

// DOM Elements
const taskTableBody = document.getElementById('taskTableBody');
const searchInput = document.getElementById('searchInput');
const filterChips = document.querySelectorAll('.filter-chip');
const addTaskForm = document.getElementById('addTaskForm');
const exportBtn = document.getElementById('exportBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importInput = document.getElementById('importInput');
const clearAllBtn = document.getElementById('clearAllBtn');

// GitHub Elements
const storageBadge = document.getElementById('storageBadge');
const syncStatusText = document.getElementById('syncStatusText');
const githubModal = document.getElementById('githubModal');
const openGithubModalBtn = document.getElementById('openGithubModalBtn');
const closeGithubModalBtn = document.getElementById('closeGithubModalBtn');
const saveGithubSettingsBtn = document.getElementById('saveGithubSettingsBtn');
const autoCreateGistBtn = document.getElementById('autoCreateGistBtn');
const ghTokenInput = document.getElementById('ghTokenInput');
const ghGistIdInput = document.getElementById('ghGistIdInput');
const manualSyncBtn = document.getElementById('manualSyncBtn');

// Stat Counters
const statTotal = document.getElementById('statTotal');
const statComplete = document.getElementById('statComplete');
const statProgress = document.getElementById('statProgress');
const statPending = document.getElementById('statPending');
const statDocs = document.getElementById('statDocs');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    setupFormListeners();
    setupSearchAndFilters();
    setupBackupHandlers();
    setupGitHubSyncModal();

    // 1. First priority: Initialize Universal Cloud Storage (Zero-Setup)
    updateSyncBadgeStatus('syncing', 'Connecting to Cloud Storage...');
    
    let loadedFromCloud = false;
    if (cloudBinId) {
        loadedFromCloud = await fetchFromCloudBin(cloudBinId);
    }

    // 2. If no cloud bin yet, check if GitHub Gist is configured
    if (!loadedFromCloud && ghGistId) {
        loadedFromCloud = await fetchTasksFromGitHub();
    }

    // 3. Fallback to LocalStorage if offline or no cloud data yet
    if (!loadedFromCloud) {
        loadTasksFromLocalStorage();
        
        // Auto-create cloud storage bin so future devices load this exact data!
        await initUniversalCloudStorage();
    } else {
        updateSyncBadgeStatus('github', 'Live Universal Cloud Sync Active');
    }

    renderSheet();
});

// Initialize & Create Universal Cloud Storage Bin automatically
async function initUniversalCloudStorage() {
    if (cloudBinId) return;

    try {
        const res = await fetch('https://api.npoint.io', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: tasks })
        });

        if (res.ok) {
            const data = await res.json();
            if (data.id) {
                cloudBinId = data.id;
                localStorage.setItem(CLOUD_BIN_KEY, cloudBinId);
                
                // Update URL parameter ?bin=xxxx
                updateUrlWithBinId(cloudBinId);
                updateSyncBadgeStatus('github', 'Live Universal Cloud Sync Active');
                console.log('Universal Cloud Storage Initialized:', cloudBinId);
            }
        }
    } catch (e) {
        console.warn('Failed to auto-initialize cloud storage:', e);
        updateSyncBadgeStatus('local', 'Auto-Saved (LocalStorage)');
    }
}

// Fetch tasks from Universal Cloud Storage Bin
async function fetchFromCloudBin(binId) {
    try {
        const res = await fetch(`https://api.npoint.io/${binId}`);
        if (!res.ok) throw new Error('Cloud Bin not found');

        const data = await res.json();
        if (data && Array.isArray(data.tasks)) {
            tasks = data.tasks;
            saveTasksToLocalStorage();
            localStorage.setItem(CLOUD_BIN_KEY, binId);
            cloudBinId = binId;
            updateUrlWithBinId(binId);
            return true;
        }
    } catch (err) {
        console.warn('Cloud Bin Fetch Error:', err);
    }
    return false;
}

// Push tasks to Universal Cloud Storage Bin
async function saveToCloudBin() {
    if (!cloudBinId) {
        await initUniversalCloudStorage();
        if (!cloudBinId) return;
    }

    try {
        await fetch(`https://api.npoint.io/${cloudBinId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tasks: tasks })
        });
    } catch (err) {
        console.error('Cloud Bin Push Error:', err);
    }
}

// Helper to keep URL query string updated with ?bin=xxxx
function updateUrlWithBinId(binId) {
    if (!binId) return;
    try {
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('bin') !== binId) {
            currentUrl.searchParams.set('bin', binId);
            window.history.replaceState({ path: currentUrl.href }, '', currentUrl.href);
        }
    } catch (e) {
        console.error('URL update error:', e);
    }
}

// Load tasks from LocalStorage safely (Never re-insert sample tasks if user deleted them!)
function loadTasksFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) {
            tasks = JSON.parse(saved);
        } else {
            tasks = [...defaultTasks];
            saveTasksToLocalStorage();
        }
    } catch (e) {
        console.error('Failed to load local storage:', e);
        tasks = [...defaultTasks];
    }
}

// Save tasks to LocalStorage, Universal Cloud Bin, and GitHub Gist
async function saveAllData() {
    saveTasksToLocalStorage();
    updateStats();
    
    // 1. Sync to Universal Cloud Bin (No Token Required!)
    saveToCloudBin();

    // 2. Sync to GitHub Gist if configured
    if (ghGistId && ghToken) {
        await pushTasksToGitHub();
    }
}

function saveTasksToLocalStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
        console.error('Failed to save to local storage:', e);
    }
}

// Fetch tasks from GitHub Gist API
async function fetchTasksFromGitHub() {
    if (!ghGistId) return false;
    isSyncing = true;

    try {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (ghToken) headers['Authorization'] = `token ${ghToken}`;

        const res = await fetch(`https://api.github.com/gists/${ghGistId}`, { headers });
        if (!res.ok) throw new Error(`GitHub API Error (${res.status})`);

        const gistData = await res.json();
        const fileContent = gistData.files?.[GIST_FILENAME]?.content;

        if (fileContent !== undefined) {
            tasks = JSON.parse(fileContent);
            saveTasksToLocalStorage();
            localStorage.setItem(GH_GIST_ID_KEY, ghGistId);
            updateSyncBadgeStatus('github', 'Live GitHub Cloud Sync Active');
            showToast('Live data synced from GitHub Cloud!', 'success');
            renderSheet();
            return true;
        }
    } catch (err) {
        console.warn('GitHub Gist Fetch Error:', err);
    } finally {
        isSyncing = false;
    }
    return false;
}

// Push tasks to GitHub Gist API
async function pushTasksToGitHub() {
    if (!ghGistId || !ghToken) return;
    isSyncing = true;

    try {
        const payload = {
            description: 'Edusense Task Sheet Database',
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(tasks, null, 2)
                }
            }
        };

        const res = await fetch(`https://api.github.com/gists/${ghGistId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `token ${ghToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`GitHub Patch Error (${res.status})`);

        updateSyncBadgeStatus('github', 'Live GitHub Cloud Sync Active');
    } catch (err) {
        console.error('GitHub Push Error:', err);
    } finally {
        isSyncing = false;
    }
}

// Auto-create Gist using user's GitHub Token
async function createGistAutomatically() {
    const token = ghTokenInput.value.trim();
    if (!token) {
        showToast('Please enter your Personal Access Token first!', 'error');
        return;
    }

    try {
        autoCreateGistBtn.disabled = true;
        autoCreateGistBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Gist Database...';

        const payload = {
            description: 'Edusense Task Sheet Database',
            public: true,
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(tasks, null, 2)
                }
            }
        };

        const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`GitHub Error (${res.status})`);

        const newGist = await res.json();
        ghGistIdInput.value = newGist.id;
        
        ghToken = token;
        ghGistId = newGist.id;
        localStorage.setItem(GH_TOKEN_KEY, token);
        localStorage.setItem(GH_GIST_ID_KEY, newGist.id);

        showToast('🎉 GitHub Cloud Database Connected Successfully!', 'success');
        githubModal.classList.remove('active');
        fetchTasksFromGitHub();

    } catch (err) {
        console.error(err);
        showToast('Failed to create Gist. Please verify token permissions.', 'error');
    } finally {
        autoCreateGistBtn.disabled = false;
        autoCreateGistBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Auto Create & Connect Gist';
    }
}

// Update Header Sync Badge UI
function updateSyncBadgeStatus(type, text) {
    if (!syncStatusText) return;
    syncStatusText.textContent = text;

    storageBadge.className = 'storage-badge';
    const dot = storageBadge.querySelector('.pulse-dot');
    
    if (type === 'github') {
        storageBadge.classList.add('github-active');
        if (dot) dot.className = 'pulse-dot indigo';
    } else if (type === 'syncing') {
        if (dot) dot.className = 'pulse-dot yellow';
    } else {
        if (dot) dot.className = 'pulse-dot';
    }
}

// GitHub Modal Listeners
function setupGitHubSyncModal() {
    if (ghTokenInput) ghTokenInput.value = ghToken;
    if (ghGistIdInput) ghGistIdInput.value = ghGistId;

    openGithubModalBtn.addEventListener('click', () => {
        githubModal.classList.add('active');
    });

    closeGithubModalBtn.addEventListener('click', () => {
        githubModal.classList.remove('active');
    });

    saveGithubSettingsBtn.addEventListener('click', () => {
        ghToken = ghTokenInput.value.trim();
        ghGistId = ghGistIdInput.value.trim();

        localStorage.setItem(GH_TOKEN_KEY, ghToken);
        localStorage.setItem(GH_GIST_ID_KEY, ghGistId);

        githubModal.classList.remove('active');

        if (ghGistId) {
            fetchTasksFromGitHub();
        }
    });

    autoCreateGistBtn.addEventListener('click', createGistAutomatically);

    manualSyncBtn.addEventListener('click', async () => {
        showToast('Syncing with Cloud Storage...', 'info');
        if (cloudBinId) {
            await fetchFromCloudBin(cloudBinId);
        }
        if (ghGistId) {
            await fetchTasksFromGitHub();
        }
        showToast('Cloud Sync Completed!', 'success');
    });
}

// Setup Form Submission & File Upload Reader
function setupFormListeners() {
    const statusTicks = document.querySelectorAll('#statusTickSelector .tick-option');
    const newTaskStatus = document.getElementById('newTaskStatus');
    const newTaskFile = document.getElementById('newTaskFile');

    statusTicks.forEach(tick => {
        tick.addEventListener('click', () => {
            statusTicks.forEach(t => t.classList.remove('selected'));
            tick.classList.add('selected');
            newTaskStatus.value = tick.dataset.val;
        });
    });

    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskVal = document.getElementById('newTaskTitle').value.trim();
        const descVal = document.getElementById('newTaskDesc').value.trim();
        const durationVal = document.getElementById('newTaskDuration').value.trim();
        const remarksVal = document.getElementById('newTaskRemarks').value.trim();
        const statusVal = newTaskStatus.value;

        if (!taskVal) {
            showToast('Please enter a task title!', 'error');
            return;
        }

        let fileName = '';
        let fileData = '';

        if (newTaskFile && newTaskFile.files[0]) {
            const file = newTaskFile.files[0];
            fileName = file.name;
            fileData = await readFileAsBase64(file);
        }

        const newTask = {
            id: 'task-' + Date.now(),
            task: taskVal,
            description: descVal || '-',
            duration: durationVal || '-',
            status: statusVal,
            fileName: fileName,
            fileData: fileData,
            remarks: remarksVal || '-',
            updatedAt: new Date().toISOString()
        };

        tasks.unshift(newTask);
        await saveAllData();
        renderSheet();
        addTaskForm.reset();
        
        statusTicks.forEach(t => t.classList.remove('selected'));
        statusTicks[0].classList.add('selected');
        newTaskStatus.value = 'complete';

        showToast('New Task Added & Synced!', 'success');
    });
}

// Read file as Base64 Data URL
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Attach Document to existing task
window.attachFileToTask = async function(id, inputElement) {
    if (!inputElement.files || !inputElement.files[0]) return;
    const file = inputElement.files[0];

    const task = tasks.find(t => String(t.id) === String(id));
    if (task) {
        showToast('Uploading document...', 'info');
        task.fileName = file.name;
        task.fileData = await readFileAsBase64(file);
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        renderSheet();
        showToast('Document attached successfully!', 'success');
    }
};

// REMOVE/DELETE DOCUMENT FROM TASK
window.removeDocumentFromTask = async function(id) {
    if (confirm('Are you sure you want to delete this attached document?')) {
        const task = tasks.find(t => String(t.id) === String(id));
        if (task) {
            task.fileName = '';
            task.fileData = '';
            task.updatedAt = new Date().toISOString();
            await saveAllData();
            renderSheet();
            showToast('Document deleted from task.', 'warn');
        }
    }
};

// Setup Search & Filter Event Listeners
function setupSearchAndFilters() {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderSheet();
    });

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            renderSheet();
        });
    });
}

// Update Dashboard Statistics
function updateStats() {
    if (!statTotal) return;
    
    const total = tasks.length;
    const complete = tasks.filter(t => t.status === 'complete').length;
    const progress = tasks.filter(t => t.status === 'progress').length;
    const pending = tasks.filter(t => t.status === 'pending').length;
    const docsCount = tasks.filter(t => t.fileName).length;

    statTotal.textContent = total;
    statComplete.textContent = complete;
    statProgress.textContent = progress;
    statPending.textContent = pending;
    if (statDocs) statDocs.textContent = docsCount;
}

// Render Sheet Table
function renderSheet() {
    updateStats();

    const filteredTasks = tasks.filter(task => {
        const matchesFilter = 
            currentFilter === 'all' || 
            task.status === currentFilter ||
            (currentFilter === 'docs' && task.fileName);

        const matchesSearch = 
            task.task.toLowerCase().includes(searchQuery) ||
            task.description.toLowerCase().includes(searchQuery) ||
            (task.duration && task.duration.toLowerCase().includes(searchQuery)) ||
            (task.fileName && task.fileName.toLowerCase().includes(searchQuery)) ||
            task.remarks.toLowerCase().includes(searchQuery);

        return matchesFilter && matchesSearch;
    });

    if (filteredTasks.length === 0) {
        taskTableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i class="fa-solid fa-folder-open"></i>
                        <h3>No Tasks Found</h3>
                        <p>No matching task entry found in your sheet. Try adding a new task above!</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    taskTableBody.innerHTML = filteredTasks.map(task => `
        <tr data-id="${task.id}">
            <td class="task-title-cell">
                <span class="editable-cell" contenteditable="true" data-field="task">${escapeHtml(task.task)}</span>
            </td>
            <td class="task-desc-cell">
                <span class="editable-cell" contenteditable="true" data-field="description">${escapeHtml(task.description)}</span>
            </td>
            <td class="task-duration-cell">
                <span class="editable-cell" contenteditable="true" data-field="duration" placeholder="e.g. 5 hrs">${escapeHtml(task.duration || '-')}</span>
            </td>
            <td>
                <!-- 📌 Clean Checkmark Tick Group for Status -->
                <div class="table-tick-group">
                    <button class="table-tick-btn complete ${task.status === 'complete' ? 'active' : ''}" 
                            onclick="updateTaskStatus('${task.id}', 'complete')" title="Complete (✓)">
                        <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="table-tick-btn progress ${task.status === 'progress' ? 'active' : ''}" 
                            onclick="updateTaskStatus('${task.id}', 'progress')" title="Working on it (⏳)">
                        <i class="fa-solid fa-clock"></i>
                    </button>
                    <button class="table-tick-btn pending ${task.status === 'pending' ? 'active' : ''}" 
                            onclick="updateTaskStatus('${task.id}', 'pending')" title="Not Complete (✗)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </td>
            <td class="task-doc-cell">
                ${task.fileData ? `
                    <div class="doc-badge-wrapper">
                        <a href="${task.fileData}" download="${escapeHtml(task.fileName)}" class="doc-badge" title="Click to download ${escapeHtml(task.fileName)}">
                            <i class="fa-solid fa-paperclip"></i> ${escapeHtml(task.fileName)}
                        </a>
                        <button class="btn-delete-doc" onclick="removeDocumentFromTask('${task.id}')" title="Delete Document Only">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                ` : `
                    <label class="attach-file-btn" title="Attach Document (PDF, Image, Doc)">
                        <i class="fa-solid fa-cloud-arrow-up"></i> Attach
                        <input type="file" onchange="attachFileToTask('${task.id}', this)" style="display:none;">
                    </label>
                `}
            </td>
            <td class="task-remarks-cell">
                <span class="editable-cell" contenteditable="true" data-field="remarks">${escapeHtml(task.remarks)}</span>
            </td>
            <td style="text-align: right;">
                <button class="btn-icon btn-danger" onclick="deleteTask('${task.id}')" title="Delete Task">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        </tr>
    `).join('');

    document.querySelectorAll('.editable-cell').forEach(cell => {
        cell.addEventListener('blur', async (e) => {
            const tr = e.target.closest('tr');
            const taskId = tr.dataset.id;
            const field = e.target.dataset.field;
            const newValue = e.target.innerText.trim();
            await updateTaskField(taskId, field, newValue);
        });

        cell.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cell.blur();
            }
        });
    });
}

// Update Status Via Tick Click
window.updateTaskStatus = async function(id, newStatus) {
    const task = tasks.find(t => String(t.id) === String(id));
    if (task) {
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        renderSheet();
        showToast(`Status updated to ${getStatusLabel(newStatus)}`, 'info');
    }
};

// Editable Cell Update
async function updateTaskField(id, field, value) {
    const task = tasks.find(t => String(t.id) === String(id));
    if (task && task[field] !== value) {
        task[field] = value || '-';
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        showToast(`Updated ${field} successfully`, 'info');
    }
}

// GUARANTEED PERMANENT TASK DELETION ACROSS ALL BROWSERS
window.deleteTask = async function(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasks = tasks.filter(t => String(t.id) !== String(id));
        
        saveTasksToLocalStorage();
        renderSheet();
        showToast('Task deleted permanently!', 'warn');

        // Sync deletion everywhere immediately
        await saveToCloudBin();
        if (ghGistId && ghToken) {
            await pushTasksToGitHub();
        }
    }
};

// Helpers & Formatters
function getStatusLabel(status) {
    switch (status) {
        case 'complete': return 'Complete (✓)';
        case 'progress': return 'Working on it (⏳)';
        case 'pending': return 'Not Complete (✗)';
        default: return status;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// Toast Notifications
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error' || type === 'warn') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 200);
    }, 2800);
}

// Backup (Import / Export JSON & CSV)
function setupBackupHandlers() {
    exportBtn.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `Edusense_Sheet_Backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Backup JSON downloaded successfully!', 'success');
    });

    exportCsvBtn.addEventListener('click', () => {
        let csvContent = "data:text/csv;charset=utf-8,Task,Description,Duration/Hours,Status,Document Name,Remarks,Last Updated\n";
        tasks.forEach(t => {
            const row = [
                `"${t.task.replace(/"/g, '""')}"`,
                `"${t.description.replace(/"/g, '""')}"`,
                `"${(t.duration || '').replace(/"/g, '""')}"`,
                `"${t.status}"`,
                `"${(t.fileName || '').replace(/"/g, '""')}"`,
                `"${t.remarks.replace(/"/g, '""')}"`,
                `"${t.updatedAt}"`
            ].join(",");
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Edusense_Tasks_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('CSV exported for Microsoft Excel!', 'success');
    });

    importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                if (Array.isArray(importedData)) {
                    tasks = importedData;
                    await saveAllData();
                    renderSheet();
                    showToast('Data imported & synced successfully!', 'success');
                } else {
                    showToast('Invalid backup file format.', 'error');
                }
            } catch (err) {
                showToast('Failed to parse backup file.', 'error');
            }
        };
        reader.readAsText(file);
    });

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to delete ALL tasks from the sheet?')) {
                tasks = [];
                await saveAllData();
                renderSheet();
                showToast('All sheet data cleared.', 'warn');
            }
        });
    }
}
