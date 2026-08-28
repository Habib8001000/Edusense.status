/**
 * Edusense Task & Payment Status Sheet Manager
 * Author: Antigravity AI
 * Features: GitHub Gist Cloud Sync, LocalStorage Backup, Interactive Status Dots, Real-time Filters, Excel/CSV Export
 */

const STORAGE_KEY = 'EDUSENSE_SHEET_DATA_V1';
const GH_TOKEN_KEY = 'EDUSENSE_GH_TOKEN';
const GH_GIST_ID_KEY = 'EDUSENSE_GH_GIST_ID';
const GIST_FILENAME = 'edusense_tasks.json';

// Initial sample data if local storage & GitHub are empty
const defaultTasks = [
    {
        id: 'task-1',
        task: 'Website UI Redesign',
        description: 'Complete front-end mockups for Edusense portal',
        status: 'complete',
        remarks: 'Delivered ahead of schedule',
        payment: 'paid',
        updatedAt: new Date().toISOString()
    },
    {
        id: 'task-2',
        task: 'Database Migration',
        description: 'Migrate student records to AWS DynamoDB cluster',
        status: 'progress',
        remarks: '50% records transferred',
        payment: 'unpaid',
        updatedAt: new Date().toISOString()
    },
    {
        id: 'task-3',
        task: 'SmarterASP Server Setup',
        description: 'Configure IIS web server and SSL certificate',
        status: 'pending',
        remarks: 'Waiting for DNS propagation',
        payment: 'unpaid',
        updatedAt: new Date().toISOString()
    }
];

// App State
let tasks = [];
let currentFilter = 'all';
let searchQuery = '';
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
const statPaid = document.getElementById('statPaid');
const statUnpaid = document.getElementById('statUnpaid');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    setupFormListeners();
    setupSearchAndFilters();
    setupBackupHandlers();
    setupGitHubSyncModal();

    // Check if GitHub Sync is configured
    if (ghGistId) {
        updateSyncBadgeStatus('syncing', 'Syncing with GitHub...');
        const success = await fetchTasksFromGitHub();
        if (!success) {
            loadTasksFromLocalStorage();
        }
    } else {
        loadTasksFromLocalStorage();
        updateSyncBadgeStatus('local', 'Auto-Saved (LocalStorage)');
    }

    renderSheet();
});

// Load tasks from LocalStorage
function loadTasksFromLocalStorage() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
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

// Save tasks to LocalStorage & GitHub
async function saveAllData() {
    saveTasksToLocalStorage();
    updateStats();
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

        if (fileContent) {
            tasks = JSON.parse(fileContent);
            saveTasksToLocalStorage();
            updateSyncBadgeStatus('github', 'Live GitHub Sync Active');
            showToast('Latest data loaded from GitHub Gist!', 'success');
            renderSheet();
            return true;
        }
    } catch (err) {
        console.warn('GitHub Gist Fetch Error:', err);
        showToast('Using cached LocalStorage data (GitHub offline/unreachable)', 'warn');
        updateSyncBadgeStatus('local', 'Offline (LocalStorage)');
    } finally {
        isSyncing = false;
    }
    return false;
}

// Push tasks to GitHub Gist API
async function pushTasksToGitHub() {
    if (!ghGistId || !ghToken) return;
    isSyncing = true;
    updateSyncBadgeStatus('syncing', 'Saving to GitHub...');

    try {
        const payload = {
            description: 'Edusense Task & Payment Status Sheet',
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

        updateSyncBadgeStatus('github', 'Live GitHub Sync Active');
        showToast('Saved & Synced to GitHub Gist Cloud!', 'success');
    } catch (err) {
        console.error('GitHub Push Error:', err);
        updateSyncBadgeStatus('local', 'Save Error (Local Backup Saved)');
        showToast('Failed to push to GitHub Gist. Check your token.', 'error');
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
        autoCreateGistBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Gist...';

        const payload = {
            description: 'Edusense Task & Payment Sheet Database',
            public: false,
            files: {
                [GIST_FILENAME]: {
                    content: JSON.stringify(tasks.length ? tasks : defaultTasks, null, 2)
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

        showToast('🎉 GitHub Gist Database Created & Connected Successfully!', 'success');
        githubModal.classList.remove('active');
        fetchTasksFromGitHub();

    } catch (err) {
        console.error(err);
        showToast('Failed to create Gist. Please verify token permissions (gist scope).', 'error');
    } finally {
        autoCreateGistBtn.disabled = false;
        autoCreateGistBtn.innerHTML = '<i class="fa-solid fa-magic"></i> Auto Create & Connect Gist';
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
        } else {
            updateSyncBadgeStatus('local', 'Auto-Saved (LocalStorage)');
        }
    });

    autoCreateGistBtn.addEventListener('click', createGistAutomatically);

    manualSyncBtn.addEventListener('click', () => {
        if (ghGistId) {
            fetchTasksFromGitHub();
        } else {
            githubModal.classList.add('active');
        }
    });
}

// Setup Form Submission & Dot Selectors
function setupFormListeners() {
    const statusDots = document.querySelectorAll('#statusDotSelector .dot-option');
    const paymentDots = document.querySelectorAll('#paymentDotSelector .dot-option');
    
    const newTaskStatus = document.getElementById('newTaskStatus');
    const newTaskPayment = document.getElementById('newTaskPayment');

    statusDots.forEach(dot => {
        dot.addEventListener('click', () => {
            statusDots.forEach(d => d.classList.remove('selected'));
            dot.classList.add('selected');
            newTaskStatus.value = dot.dataset.val;
        });
    });

    paymentDots.forEach(dot => {
        dot.addEventListener('click', () => {
            paymentDots.forEach(d => d.classList.remove('selected'));
            dot.classList.add('selected');
            newTaskPayment.value = dot.dataset.val;
        });
    });

    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskVal = document.getElementById('newTaskTitle').value.trim();
        const descVal = document.getElementById('newTaskDesc').value.trim();
        const remarksVal = document.getElementById('newTaskRemarks').value.trim();
        const statusVal = newTaskStatus.value;
        const paymentVal = newTaskPayment.value;

        if (!taskVal) {
            showToast('Please enter a task title!', 'error');
            return;
        }

        const newTask = {
            id: 'task-' + Date.now(),
            task: taskVal,
            description: descVal || '-',
            status: statusVal,
            remarks: remarksVal || '-',
            payment: paymentVal,
            updatedAt: new Date().toISOString()
        };

        tasks.unshift(newTask);
        await saveAllData();
        renderSheet();
        addTaskForm.reset();
        
        statusDots.forEach(d => d.classList.remove('selected'));
        statusDots[0].classList.add('selected');
        newTaskStatus.value = 'complete';

        paymentDots.forEach(d => d.classList.remove('selected'));
        paymentDots[0].classList.add('selected');
        newTaskPayment.value = 'paid';

        showToast('New Task Added & Synced!', 'success');
    });
}

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
    const paid = tasks.filter(t => t.payment === 'paid').length;
    const unpaid = tasks.filter(t => t.payment === 'unpaid').length;

    statTotal.textContent = total;
    statComplete.textContent = complete;
    statProgress.textContent = progress;
    statPending.textContent = pending;
    statPaid.textContent = paid;
    statUnpaid.textContent = unpaid;
}

// Render Sheet Table
function renderSheet() {
    updateStats();

    const filteredTasks = tasks.filter(task => {
        const matchesFilter = 
            currentFilter === 'all' || 
            task.status === currentFilter || 
            task.payment === currentFilter;

        const matchesSearch = 
            task.task.toLowerCase().includes(searchQuery) ||
            task.description.toLowerCase().includes(searchQuery) ||
            task.remarks.toLowerCase().includes(searchQuery);

        return matchesFilter && matchesSearch;
    });

    if (filteredTasks.length === 0) {
        taskTableBody.innerHTML = `
            <tr>
                <td colspan="6">
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
            <td>
                <div class="interactive-dots" title="Click dot to change status: Green (Complete), Yellow (Working), Red (Pending)">
                    <span class="dot dot-green ${task.status === 'complete' ? 'active' : ''}" 
                          onclick="updateTaskStatus('${task.id}', 'complete')" title="Green: Complete"></span>
                    <span class="dot dot-yellow ${task.status === 'progress' ? 'active' : ''}" 
                          onclick="updateTaskStatus('${task.id}', 'progress')" title="Yellow: Working on it"></span>
                    <span class="dot dot-red ${task.status === 'pending' ? 'active' : ''}" 
                          onclick="updateTaskStatus('${task.id}', 'pending')" title="Red: Not Complete"></span>
                </div>
            </td>
            <td class="task-remarks-cell">
                <span class="editable-cell" contenteditable="true" data-field="remarks">${escapeHtml(task.remarks)}</span>
            </td>
            <td>
                <div class="interactive-dots" title="Click dot to change payment status: Green (Paid), Red (Unpaid)">
                    <span class="dot dot-green ${task.payment === 'paid' ? 'active' : ''}" 
                          onclick="updateTaskPayment('${task.id}', 'paid')" title="Green: Paid"></span>
                    <span class="dot dot-red ${task.payment === 'unpaid' ? 'active' : ''}" 
                          onclick="updateTaskPayment('${task.id}', 'unpaid')" title="Red: Unpaid"></span>
                </div>
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

// Update Status Via Dot Click
window.updateTaskStatus = async function(id, newStatus) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.status = newStatus;
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        renderSheet();
        showToast(`Status updated to ${getStatusLabel(newStatus)}`, 'info');
    }
};

// Update Payment Status Via Dot Click
window.updateTaskPayment = async function(id, newPayment) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.payment = newPayment;
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        renderSheet();
        showToast(`Payment updated to ${newPayment.toUpperCase()}`, 'info');
    }
};

// Editable Cell Update
async function updateTaskField(id, field, value) {
    const task = tasks.find(t => t.id === id);
    if (task && task[field] !== value) {
        task[field] = value || '-';
        task.updatedAt = new Date().toISOString();
        await saveAllData();
        showToast(`Updated ${field} successfully`, 'info');
    }
}

// Delete Task
window.deleteTask = async function(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        tasks = tasks.filter(t => t.id !== id);
        await saveAllData();
        renderSheet();
        showToast('Task removed from sheet.', 'warn');
    }
};

// Helpers & Formatters
function getStatusLabel(status) {
    switch (status) {
        case 'complete': return 'Complete (Green)';
        case 'progress': return 'Working on it (Yellow)';
        case 'pending': return 'Not Complete (Red)';
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
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
        let csvContent = "data:text/csv;charset=utf-8,Task,Description,Status,Remarks,Payment Status,Last Updated\n";
        tasks.forEach(t => {
            const row = [
                `"${t.task.replace(/"/g, '""')}"`,
                `"${t.description.replace(/"/g, '""')}"`,
                `"${t.status}"`,
                `"${t.remarks.replace(/"/g, '""')}"`,
                `"${t.payment}"`,
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
}
