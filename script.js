// === KEYS ===
const STORAGE_KEY_STUDENTS = 'eduCore_students';
const STORAGE_KEY_TEACHERS = 'eduCore_teachers';
const STORAGE_KEY_CLASSES = 'eduCore_classes';
const STORAGE_KEY_SETTINGS = 'eduCore_settings';
const STORAGE_KEY_NOTIFICATIONS = 'eduCore_notifications';
const STORAGE_KEY_AUTH = 'eduCore_auth';
const STORAGE_KEY_TEACHER_ATTENDANCE = 'eduCore_teacher_attendance';
const STORAGE_KEY_STAFF = 'eduCore_staff';
const STORAGE_KEY_TEACHER_SALARIES = 'eduCore_teacher_salaries';
const STORAGE_KEY_NOTICES = 'eduCore_notices';
const STORAGE_KEY_USERS = 'eduCore_users'; // New Key for student/teacher credentials

// === REAL-TIME SQL CONFIGURATION ===
// Auto-detect environment: Use localhost for development, or environment variable for production
const isLocalhost = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.') ||
    window.location.hostname.startsWith('172.') ||
    window.location.protocol === 'file:';

const BACKEND_URL = isLocalhost
    ? (window.location.protocol === 'file:' ? 'http://localhost:3000' : `${window.location.protocol}//${window.location.hostname}:3000`)
    : (window.ENV_BACKEND_URL || 'https://school-management-backend.onrender.com');

const API_BASE_URL = `${BACKEND_URL}/api`;
let socket;

if (typeof io !== 'undefined') {
    socket = io(BACKEND_URL);

    // Listen for Real-Time SQL Updates
    socket.on('students_update', (data) => {
        localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(data));
        if (window.location.pathname.includes('students.html')) renderStudents();
    });

    socket.on('teachers_update', (data) => {
        localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(data));
        if (window.location.pathname.includes('teachers.html')) renderTeachers();
    });

    socket.on('notices_update', (data) => {
        localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(data));
        if (window.location.pathname.includes('notices.html')) renderNotices();
        updateDashboardStats();
    });
}

// Helper to sync local data to SQL
async function syncToSQL(endpoint, data) {
    try {
        await fetch(`${API_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.warn("SQL Server Offline. Saving locally only.");
    }
}

async function upsertNoticeToSQL(notice) {
    try {
        await fetch(`${API_BASE_URL}/notices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(notice)
        });
    } catch (e) {
        console.warn("Notice sync skipped (server offline).");
    }
}

async function deleteNoticeFromSQL(id) {
    try {
        await fetch(`${API_BASE_URL}/notices/${id}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.warn("Notice delete sync skipped (server offline).");
    }
}

async function initialSQLSync() {
    try {
        const sRes = await fetch(`${API_BASE_URL}/students`);
        if (sRes.ok) {
            const data = await sRes.json();
            localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(data));
            if (typeof renderStudents === 'function') renderStudents();
        }

        const tRes = await fetch(`${API_BASE_URL}/teachers`);
        if (tRes.ok) {
            const data = await tRes.json();
            localStorage.setItem(STORAGE_KEY_TEACHERS, JSON.stringify(data));
            if (typeof renderTeachers === 'function') renderTeachers();
        }

        const nRes = await fetch(`${API_BASE_URL}/notices`);
        if (nRes.ok) {
            const data = await nRes.json();
            localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(data));
            if (typeof renderNotices === 'function') renderNotices();
            updateDashboardStats();
        }
    } catch (e) {
        console.warn("SQL Server Connection Failed: Ensure 'node server.js' is running and MySQL is active.");
        console.log("SQL Initial Sync skipped (server offline). Using LocalStorage fallback.");
    }
}

// === FORCE RESET AUTH TO REQUESTED CREDENTIALS ===
(function forceResetAuth() {
    const creds = { email: 'Apexiums@school.com', password: 'Apexiums1717' };
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(creds));
    // Clear any previous login failure states in session if they exist
    sessionStorage.removeItem('login_attempts');
})();

document.addEventListener('DOMContentLoaded', () => {

    // Perform initial sync from SQL Server
    initialSQLSync();

    // === INIT ICONS ===
    if (typeof lucide !== 'undefined' && window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    // === NOTIFICATION SYSTEM ===
    const bell = document.getElementById('notificationBell');
    const panel = document.getElementById('notificationPanel');

    if (bell && panel) {
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = panel.classList.contains('active');

            if (isActive) {
                // If the user clicks the bell to close, we clear the seen alerts and hide it
                clearAllNotifications();
                panel.classList.remove('active');
            } else {
                // Only open if there are notifications to see
                const notifications = getData(STORAGE_KEY_NOTIFICATIONS);
                if (notifications.length > 0) {
                    panel.classList.add('active');
                } else {
                    // Optional: You could show a small "No Notifications" toast here if desired
                    console.log('Notification tray is empty.');
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (panel.classList.contains('active') && !panel.contains(e.target)) {
                clearAllNotifications();
                panel.classList.remove('active');
            }
        });

        panel.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    renderNotifications();

    // === LOGIN PAGE ===
    const loginForm = document.getElementById('loginForm');

    // === PASSWORD TOGGLE ===
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value.trim();
            const btn = loginForm.querySelector('button');
            const originalBtnText = btn.innerText;

            btn.innerText = 'Verifying...';
            btn.disabled = true;

            try {
                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    console.log("Login Success:", result.user.role);

                    // Store JWT and User Info
                    sessionStorage.setItem('eduCore_token', result.token);
                    sessionStorage.setItem('loggedInUser', JSON.stringify(result.user));

                    // Track login for statistics
                    const loginTracking = JSON.parse(localStorage.getItem('EDUCORE_LOGIN_TRACKING')) || { count: 0, lastLogin: null };
                    loginTracking.count += 1;
                    loginTracking.lastLogin = new Date().toISOString();
                    localStorage.setItem('EDUCORE_LOGIN_TRACKING', JSON.stringify(loginTracking));

                    pushNotification('System Access', `${result.user.role} logged in: ${result.user.fullName}`, 'login');

                    btn.innerText = 'Redirecting...';

                    // Redirect based on role
                    setTimeout(() => {
                        if (result.user.role === 'Admin') {
                            window.location.href = 'dashboard.html';
                        } else if (result.user.role === 'Student') {
                            window.location.href = 'student_portal.html';
                        } else if (result.user.role === 'Teacher') {
                            window.location.href = 'teacher_portal.html';
                        }
                    }, 800);
                } else {
                    throw new Error(result.message || 'Invalid Username or Password');
                }
            } catch (error) {
                console.error("Login Error:", error);

                let errorMsg = error.message;
                if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
                    errorMsg = "🔴 Connection Failed! Please ensure the Backend Server is running.\n\nRun 'node server.js' in your terminal.";
                }

                alert(errorMsg);
                btn.innerText = originalBtnText;
                btn.disabled = false;
                pushNotification('Security Alert', `Failed login attempt for ${username}`, 'alert');
            }
        });
    }

    // === STUDENT PAGE ===
    const studentForm = document.getElementById('studentForm');
    if (studentForm) {
        renderStudents(); // Initial Load
        studentForm.addEventListener('submit', handleStudentFormSubmit);
    }

    // === TEACHER PAGE ===
    const teacherForm = document.getElementById('teacherForm');
    if (teacherForm) {
        renderTeachers(); // Initial Load
        teacherForm.addEventListener('submit', handleTeacherFormSubmit);
        const tSearch = document.getElementById('teacherSearchInput');
        if (tSearch) {
            tSearch.addEventListener('input', (e) => renderTeachers(e.target.value.toLowerCase()));
        }
    }

    // === STAFF PAGE ===
    const staffForm = document.getElementById('staffForm');
    if (staffForm) {
        renderStaff(); // Initial Load
        staffForm.addEventListener('submit', handleStaffFormSubmit);
        const sSearch = document.getElementById('staffSearchInput');
        if (sSearch) {
            sSearch.addEventListener('input', (e) => renderStaff(e.target.value.toLowerCase()));
        }
    }

    // === CLASSES PAGE ===
    const classForm = document.getElementById('classForm');
    if (classForm) {
        renderClasses(); // Initial Load
        classForm.addEventListener('submit', handleClassFormSubmit);
        const cSearch = document.getElementById('classSearchInput');
        if (cSearch) {
            cSearch.addEventListener('input', (e) => renderClasses(e.target.value.toLowerCase()));
        }
    }

    // === NOTICES PAGE ===
    const noticeForm = document.getElementById('noticeForm');
    if (noticeForm) {
        renderNotices(); // Initial Load
        noticeForm.addEventListener('submit', handleNoticeFormSubmit);
        const nSearch = document.getElementById('noticeSearchInput');
        if (nSearch) {
            nSearch.addEventListener('input', (e) => renderNotices(e.target.value.toLowerCase()));
        }
    }

    // === SETTINGS PAGE ===
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        loadSettings();
        settingsForm.addEventListener('submit', handleSettingsSubmit);
    }

    // === DASHBOARD HOME LOGIC ===
    const dashStudentCount = document.getElementById('dashStudentCount');
    if (dashStudentCount) {
        // We are on the dashboard
        updateDashboardStats();
        // renderDashboardTable(); // Table removed by user request

        const dSearch = document.getElementById('dashSearch');
        if (dSearch) {
            dSearch.addEventListener('input', (e) => { }); // renderDashboardTable(e.target.value.toLowerCase())
        }
    }

    // === FINANCE PAGE ===
    const financeTable = document.getElementById('financeTable');
    if (financeTable) {
        renderFinance();
        const fSearch = document.getElementById('financeSearchInput');
        if (fSearch) {
            fSearch.addEventListener('input', (e) => renderFinance(e.target.value.toLowerCase()));
        }
    }


});

// =======================================================
// ==================== GENERIC HELPERS ==================
// =======================================================

function getData(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
}

function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));

    // Auto-Sync to Real-Time SQL
    if (key === STORAGE_KEY_STUDENTS) syncToSQL('students', data);
    if (key === STORAGE_KEY_TEACHERS) syncToSQL('teachers', data);
}

function toggleStepPanel(panelId) {
    const panel = document.getElementById(panelId);
    const btnId = panelId === 'feePanel' ? 'btnSetFee' : (panelId === 'salaryPanel' ? 'btnSetSalary' : 'btnCreateCreds');
    const btn = document.getElementById(btnId);

    if (panel.classList.contains('active')) {
        panel.classList.remove('active');
        if (btn) btn.classList.remove('active');
    } else {
        // Close others
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.action-step-btn').forEach(b => b.classList.remove('active'));

        panel.classList.add('active');
        if (btn) btn.classList.add('active');
    }
}

function showSuccessModal(title, message) {
    const modal = document.getElementById('successModal');
    const titleEl = document.getElementById('successTitle');
    const msgEl = document.getElementById('successMessage');
    if (modal && titleEl && msgEl) {
        titleEl.innerText = title;
        msgEl.innerText = message;
        modal.style.display = 'flex';
        // Re-init icons to show check-circle in modal
        if (window.lucide) window.lucide.createIcons();
    } else {
        alert(message);
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) modal.style.display = 'none';
}

// =======================================================
// ==================== DASHBOARD LOGIC ==================
// =======================================================

function renderDashboardTable(term = '') {
    const tbody = document.getElementById('dashTableBody');
    if (!tbody) return;

    // Use students data for the "Activity" table
    const students = getData(STORAGE_KEY_STUDENTS);
    const filtered = students.filter(s =>
        s.fullName.toLowerCase().includes(term) ||
        s.rollNo.toLowerCase().includes(term)
    );

    // If searching, show all matches. Otherwise show last 5.
    const displayList = term ? filtered : students.slice(-5).reverse();

    tbody.innerHTML = '';

    if (displayList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color: var(--text-secondary);">No records found.</td></tr>';
    } else {
        displayList.forEach(s => {
            let statusClass = s.feesStatus === 'Paid' ? 'status-paid' : (s.feesStatus === 'Late' ? 'status-failed' : 'status-pending');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div style="font-weight:500">${s.fullName}</div></td>
                <td><span style="color:var(--text-secondary); font-size:0.85rem">${s.rollNo}</span></td>
                <td>${s.classGrade}</td>
                <td><span class="status-badge ${statusClass}">${s.feesStatus}</span></td>
                <td>
                    <button class="btn btn-primary" style="padding:0.3rem 0.8rem; font-size:0.75rem;" onclick="toggleFeeStatus('${s.id}')">
                        ${s.feesStatus === 'Paid' ? 'Mark Pending' : 'Mark Paid'}
                    </button>
                    <button class="btn btn-secondary" style="padding:0.3rem 0.8rem; font-size:0.75rem;" onclick="editBill('${s.id}')">
                        Edit
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// =======================================================
// ==================== FINANCE LOGIC ====================
// =======================================================

// =======================================================
// ==================== FINANCE LOGIC (BILLS) ============
// =======================================================
const STORAGE_KEY_BILLS = 'eduCore_bills';
let currentCategory = null;

function getBills() {
    const data = localStorage.getItem(STORAGE_KEY_BILLS);
    return data ? JSON.parse(data) : [];
}

function saveBills(bills) {
    localStorage.setItem(STORAGE_KEY_BILLS, JSON.stringify(bills));
}

let isHistoryView = false;

// Function called when a card is clicked
function selectBillCategory(category) {
    isHistoryView = false;
    currentCategory = category;

    // UI Update
    const prompt = document.getElementById('selectPrompt');
    if (prompt) prompt.style.display = 'none';

    const details = document.getElementById('billDetailsSection');
    if (details) details.style.display = 'block';

    const title = document.getElementById('selectedCategoryTitle');
    if (title) title.innerText = category + ' Records';

    const formContainer = document.getElementById('billFormContainer');
    if (formContainer) formContainer.style.display = 'none'; // Hide form if open

    // Highlight Card
    document.querySelectorAll('.bill-card').forEach(c => c.style.border = '2px solid transparent');
    const idMap = {
        'Electricity': 'card-Electricity',
        'Gas': 'card-Gas',
        'Internet': 'card-Internet',
        'Building Rent': 'card-Rent'
    };
    if (document.getElementById(idMap[category])) {
        document.getElementById(idMap[category]).style.border = '2px solid var(--primary-color)';
    }

    const addBtn = document.querySelector('#billDetailsSection .btn-primary');
    if (addBtn) addBtn.style.display = 'inline-flex';

    renderFinance();
}

function showPaidHistory() {
    isHistoryView = true;
    currentCategory = 'All'; // Placeholder to satisfy checks

    document.querySelectorAll('.bill-card').forEach(c => {
        c.style.border = '2px solid transparent';
        c.style.transform = 'scale(1)';
    });

    if (document.getElementById('card-History')) {
        document.getElementById('card-History').style.border = '2px solid var(--primary-color)';
        document.getElementById('card-History').style.transform = 'scale(1.02)';
    }

    const prompt = document.getElementById('selectPrompt');
    if (prompt) prompt.style.display = 'none';

    const details = document.getElementById('billDetailsSection');
    if (details) details.style.display = 'block';

    const title = document.getElementById('selectedCategoryTitle');
    if (title) title.innerText = 'Paid Bills Verification';

    // Hide Add Button in History View
    const addBtn = document.querySelector('#billDetailsSection .btn-primary');
    if (addBtn) addBtn.style.display = 'none';

    renderFinance();
}

function renderFinance(term = '') {
    const tbody = document.getElementById('financeTableBody');
    if (!tbody) return;

    // If no category selected yet, do nothing or clear
    if (!currentCategory) {
        tbody.innerHTML = '';
        return;
    }

    const bills = getBills();
    let filtered = [];

    if (isHistoryView) {
        filtered = bills.filter(b => b.status === 'Paid');
    } else {
        // Filter by Current Category and Search Term
        filtered = bills.filter(b => b.category === currentCategory);
    }

    if (term) {
        filtered = filtered.filter(b => b.note && b.note.toLowerCase().includes(term));
    }

    tbody.innerHTML = '';
    const noData = document.getElementById('noFinanceData');

    if (filtered.length === 0) {
        if (noData) noData.style.display = 'block';
    } else {
        if (noData) noData.style.display = 'none';

        // Update Table Headers
        const tableHead = document.querySelector('#financeTable thead tr');
        if (isHistoryView) {
            tableHead.innerHTML = `
                <th>Category</th>
                <th>Payment Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Receipt</th>
                <th>Action</th>
            `;
        } else {
            tableHead.innerHTML = `
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
            `;
        }

        // Sort by date desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        filtered.forEach(b => {
            const statusClass = b.status === 'Paid' ? 'status-paid' : 'status-failed';
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.onclick = (e) => {
                if (e.target.closest('button')) return;
                openPaymentModal(b.id);
            };

            if (isHistoryView) {
                const pDate = b.paymentConfirmedDate ? new Date(b.paymentConfirmedDate).toLocaleDateString() : b.date;
                tr.innerHTML = `
                    <td style="font-weight:600; color:var(--primary-color)">${b.category}</td>
                    <td>${pDate}</td>
                    <td>${b.note || '-'}</td>
                    <td style="font-weight:600">PKR ${parseInt(b.amount).toLocaleString()}</td>
                    <td>
                        ${b.invoice ? '<i data-lucide="file-text" size="14" style="margin-right:5px; color:#6366f1;" title="Bill Invoice"></i>' : ''}
                        <i data-lucide="image" size="16" style="color:var(--primary-color)"></i> View
                    </td>
                    <td>
                        <button class="action-btn btn-edit" onclick='event.stopPropagation(); editBill("${b.id}")' title="Edit">
                            <i data-lucide="edit-2" width="14"></i>
                        </button>
                    </td>
                `;
            } else {
                tr.innerHTML = `
                    <td>${b.date}</td>
                    <td>${b.note || '-'}</td>
                    <td>PKR ${parseInt(b.amount).toLocaleString()}</td>
                    <td>
                        <span class="status-badge ${statusClass}">${b.status}</span>
                        ${b.invoice ? '<i data-lucide="file-text" size="12" style="margin-left:5px; color:#6366f1;" title="Invoice Attached"></i>' : ''}
                        ${b.receipt ? '<i data-lucide="image" size="12" style="margin-left:5px; color:var(--primary-color);" title="Receipt Attached"></i>' : ''}
                    </td>
                    <td>
                        <button class="action-btn btn-edit" onclick='event.stopPropagation(); editBill("${b.id}")' title="Edit">
                            <i data-lucide="edit-2" width="14"></i>
                        </button>
                        <button class="action-btn btn-delete" onclick="event.stopPropagation(); deleteBill('${b.id}')" title="Delete">
                            <i data-lucide="trash-2" width="14"></i>
                        </button>
                        ${b.status !== 'Paid' ? `
                        <button class="action-btn" style="background:#dcfce7; color:#166534;" onclick='event.stopPropagation(); openPaymentModal("${b.id}")' title="Confirm Payment">
                            <i data-lucide="check-circle" width="14"></i>
                        </button>` : ''}
                    </td>
                `;
            }
            tbody.appendChild(tr);
        });
        if (window.lucide) window.lucide.createIcons();
    }
}

function toggleBillForm(editMode = false) {
    if (!currentCategory) return;

    const container = document.getElementById('billFormContainer');
    const form = document.getElementById('billForm');
    const title = document.getElementById('billFormTitle');

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('billId').value = '';
    } else {
        container.style.display = 'block';
        if (!editMode) {
            form.reset();
            document.getElementById('billDate').valueAsDate = new Date();
            document.getElementById('billId').value = '';
            // Auto-set category
            document.getElementById('billCategory').value = currentCategory;
            title.innerText = 'Add ' + currentCategory + ' Bill';
        } else {
            title.innerText = 'Edit Bill Details';
        }
    }
    // Reset Invoice Preview
    const invPreview = document.getElementById('invoicePreview');
    if (invPreview && !editMode) {
        invPreview.style.display = 'none';
        document.getElementById('invoiceImgPreview').src = '';
    }
}

// Global listener for the Bill Form
document.addEventListener('submit', function (e) {
    if (e.target && e.target.id === 'billForm') {
        e.preventDefault();
        const idField = document.getElementById('billId');
        const isEdit = idField.value !== '';

        const newBill = {
            id: isEdit ? idField.value : Date.now().toString(),
            category: currentCategory,
            amount: document.getElementById('billAmount').value,
            date: document.getElementById('billDate').value,
            status: document.getElementById('billStatus').value,
            note: document.getElementById('billNote').value,
            invoice: document.getElementById('invoiceImgPreview').src || null
        };

        let bills = getBills();
        if (isEdit) {
            const index = bills.findIndex(b => b.id === newBill.id);
            if (index !== -1) {
                // Keep the receipt if it exists and we're just editing bill details
                if (bills[index].receipt) newBill.receipt = bills[index].receipt;
                if (bills[index].paymentConfirmedDate) newBill.paymentConfirmedDate = bills[index].paymentConfirmedDate;
                bills[index] = newBill;
            }
        } else {
            bills.push(newBill);
        }
        saveBills(bills);
        toggleBillForm();
        renderFinance();
        pushNotification('Expense Updated', `Bill for ${newBill.category} recorded.`, 'trending-up');
    }
});

// Preview for Invoice Image in Add/Edit Bill Form
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'billInvoice') {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('invoiceImgPreview').src = event.target.result;
                document.getElementById('invoicePreview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }
});

function editBill(id) {
    const bills = getBills();
    const b = bills.find(x => x.id === id);
    if (!b) return;

    toggleBillForm(true);
    document.getElementById('billId').value = b.id;
    // document.getElementById('billCategory').value = b.category; // set in toggle or here
    document.getElementById('billAmount').value = b.amount;
    document.getElementById('billDate').value = b.date;
    document.getElementById('billStatus').value = b.status;
    document.getElementById('billNote').value = b.note || '';

    // Show Invoice Preview if exists
    if (b.invoice) {
        document.getElementById('invoiceImgPreview').src = b.invoice;
        document.getElementById('invoicePreview').style.display = 'block';
    } else {
        document.getElementById('invoicePreview').style.display = 'none';
        document.getElementById('invoiceImgPreview').src = '';
    }
}

function deleteBill(id) {
    if (confirm('Delete this expense record?')) {
        let bills = getBills();
        bills = bills.filter(b => b.id !== id);
        saveBills(bills);
        renderFinance();
    }
}

// === BILL PAYMENT CONFIRMATION LOGIC ===
function openPaymentModal(id) {
    const bills = getBills();
    const b = bills.find(x => x.id === id);
    if (!b) return;

    const modal = document.getElementById('paymentModal');
    if (!modal) return;

    modal.style.display = 'flex';
    document.getElementById('pBillId').value = b.id;
    document.getElementById('pModalBillId').innerText = b.id;
    document.getElementById('pModalCategory').innerText = b.category;
    document.getElementById('pModalDate').innerText = b.date;
    document.getElementById('pModalAmount').innerText = 'PKR ' + parseInt(b.amount).toLocaleString();

    // Reset Form
    document.getElementById('paymentConfirmForm').reset();
    document.getElementById('receiptPreview').style.display = 'none';

    // If already has receipt, show it
    const confirmForm = document.getElementById('paymentConfirmForm');
    if (b.status === 'Paid') {
        document.getElementById('paymentModalTitle').innerText = 'Payment Record';
        confirmForm.style.display = 'none';
        if (b.receipt) {
            document.getElementById('receiptImgPreview').src = b.receipt;
            document.getElementById('receiptPreview').style.display = 'block';
        }
    } else {
        document.getElementById('paymentModalTitle').innerText = 'Confirm Bill Payment';
        confirmForm.style.display = 'block';
    }
}

function closePaymentModal() {
    const modal = document.getElementById('paymentModal');
    if (modal) modal.style.display = 'none';
}

// Preview Image
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'paymentReceipt') {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('receiptImgPreview').src = event.target.result;
                document.getElementById('receiptPreview').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    }
});

// Submit Payment Confirmation
document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'paymentConfirmForm') {
        e.preventDefault();
        const bId = document.getElementById('pBillId').value;
        const bills = getBills();
        const index = bills.findIndex(b => b.id === bId);

        if (index !== -1) {
            const receiptSrc = document.getElementById('receiptImgPreview').src;

            bills[index].status = 'Paid';
            bills[index].paymentConfirmedDate = new Date().toISOString();
            bills[index].receipt = receiptSrc;

            saveBills(bills);
            closePaymentModal();
            renderFinance();
            pushNotification('Payment Confirmed', `Bill payment for ${bills[index].category} has been recorded.`, 'trending-up');
        }
    }
});

function updateDashboardStats() {
    const s = getData(STORAGE_KEY_STUDENTS);
    const t = getData(STORAGE_KEY_TEACHERS);
    const staff = getData(STORAGE_KEY_STAFF);
    const notices = getData(STORAGE_KEY_NOTICES);

    if (document.getElementById('dashStudentCount')) document.getElementById('dashStudentCount').innerText = s.length || '0';
    if (document.getElementById('dashTeacherCount')) document.getElementById('dashTeacherCount').innerText = t.length || '0';
    if (document.getElementById('dashStaffCount')) document.getElementById('dashStaffCount').innerText = staff.length || '0';
    if (document.getElementById('dashNoticeCount')) document.getElementById('dashNoticeCount').innerText = notices.length || '0';

    // Calculate Total Revenue (Sum of monthlyFee for students with feesStatus === 'Paid')
    if (document.getElementById('dashRevenue')) {
        const totalRevenue = s.reduce((sum, student) => {
            if (student.feesStatus === 'Paid') {
                return sum + (parseInt(student.monthlyFee) || 0);
            }
            return sum;
        }, 0);
        document.getElementById('dashRevenue').innerText = 'PKR ' + totalRevenue.toLocaleString();
    }
}

// =======================================================
// ==================== NOTICE LOGIC =====================
// =======================================================

function toggleNoticeForm(editMode = false) {
    const container = document.getElementById('noticeFormContainer');
    const form = document.getElementById('noticeForm');
    const title = document.getElementById('noticeFormTitle');

    if (!container || !form || !title) return;

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('noticeId').value = '';
        return;
    }

    container.style.display = 'block';
    if (!editMode) {
        form.reset();
        document.getElementById('noticeId').value = '';
        document.getElementById('noticeDate').valueAsDate = new Date();
        document.getElementById('noticeStatus').value = 'Active';
        title.innerText = 'Add New Notice';
    } else {
        title.innerText = 'Edit Notice';
    }
}

function getNoticeStatusClass(status) {
    if (status === 'Active') return 'status-paid';
    if (status === 'Draft') return 'status-pending';
    return 'status-failed';
}

function handleNoticeFormSubmit(e) {
    e.preventDefault();

    const idField = document.getElementById('noticeId');
    const isEdit = idField.value !== '';

    const notice = {
        id: isEdit ? idField.value : Date.now().toString(),
        title: document.getElementById('noticeTitle').value.trim(),
        description: document.getElementById('noticeDescription').value.trim(),
        date: document.getElementById('noticeDate').value,
        status: document.getElementById('noticeStatus').value
    };

    let notices = getData(STORAGE_KEY_NOTICES);
    if (isEdit) {
        const index = notices.findIndex(n => n.id === notice.id);
        if (index !== -1) notices[index] = notice;
    } else {
        notices.push(notice);
    }

    localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
    upsertNoticeToSQL(notice);

    toggleNoticeForm();
    renderNotices();
    updateDashboardStats();
    pushNotification('Notice Updated', `"${notice.title}" has been saved.`, 'info');
}

function renderNotices(term = '') {
    const tbody = document.getElementById('noticeTableBody');
    if (!tbody) return;

    if (typeof term !== 'string') term = '';

    const notices = getData(STORAGE_KEY_NOTICES);
    const filtered = notices
        .filter(n =>
            (n.title && n.title.toLowerCase().includes(term)) ||
            (n.description && n.description.toLowerCase().includes(term))
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    const totalCountEl = document.getElementById('totalNoticeCount');
    if (totalCountEl) totalCountEl.innerText = filtered.length;

    tbody.innerHTML = '';
    const noData = document.getElementById('noNoticeDataMessage');

    if (filtered.length === 0) {
        if (noData) noData.style.display = 'block';
        return;
    }

    if (noData) noData.style.display = 'none';

    filtered.forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600;">${n.title}</td>
            <td>${n.description || '-'}</td>
            <td>${n.date || '-'}</td>
            <td><span class="status-badge ${getNoticeStatusClass(n.status)}">${n.status}</span></td>
            <td>
                <button class="action-btn btn-edit" onclick="editNotice('${n.id}')"><i data-lucide="edit-2" width="14"></i> Edit</button>
                <button class="action-btn btn-delete" onclick="deleteNotice('${n.id}')"><i data-lucide="trash-2" width="14"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (window.lucide) window.lucide.createIcons();
}

function editNotice(id) {
    const notices = getData(STORAGE_KEY_NOTICES);
    const notice = notices.find(n => n.id === id);
    if (!notice) return;

    toggleNoticeForm(true);
    document.getElementById('noticeId').value = notice.id;
    document.getElementById('noticeTitle').value = notice.title || '';
    document.getElementById('noticeDescription').value = notice.description || '';
    document.getElementById('noticeDate').value = notice.date || '';
    document.getElementById('noticeStatus').value = notice.status || 'Active';
}

function deleteNotice(id) {
    if (!confirm('Delete this notice?')) return;

    let notices = getData(STORAGE_KEY_NOTICES);
    notices = notices.filter(n => n.id !== id);
    localStorage.setItem(STORAGE_KEY_NOTICES, JSON.stringify(notices));
    deleteNoticeFromSQL(id);

    renderNotices();
    updateDashboardStats();
    pushNotification('Notice Deleted', 'A notice has been removed.', 'alert');
}

// =======================================================
// ==================== STUDENT LOGIC ====================
// =======================================================

function toggleStudentForm(editMode = false) {
    const container = document.getElementById('studentFormContainer');
    const form = document.getElementById('studentForm');
    const title = document.getElementById('formTitle');

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('studentId').value = '';
    } else {
        const classSelect = document.getElementById('classGrade');
        if (classSelect && classSelect.tagName === 'SELECT') {
            const storedClasses = getData(STORAGE_KEY_CLASSES);
            const defaultClasses = [
                'Play Group', 'Nursery', 'Prep',
                'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
                'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10'
            ];

            classSelect.innerHTML = '<option value="">Select Class</option>';

            // Add Default Classes
            defaultClasses.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls;
                opt.textContent = cls;
                classSelect.appendChild(opt);
            });

            // Add Custom Classes from Storage
            storedClasses.forEach(c => {
                const val = c.section ? `${c.name} (${c.section})` : c.name;
                if (!defaultClasses.includes(val)) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    classSelect.appendChild(opt);
                }
            });
        }
        container.style.display = 'block';
        // Reset Panels
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.action-step-btn').forEach(b => b.classList.remove('active'));

        if (!editMode) {
            form.reset();
            document.getElementById('studentId').value = '';
            title.innerText = 'Add New Student';
        } else {
            title.innerText = 'Edit Student Details';
        }
    }
}

function handleStudentFormSubmit(e) {
    e.preventDefault();
    const idField = document.getElementById('studentId');
    const isEdit = idField.value !== '';

    const existingStudents = getData(STORAGE_KEY_STUDENTS);
    const existingStudent = isEdit ? existingStudents.find(s => s.id === idField.value) : null;
    const currentStatus = isEdit && existingStudent ? existingStudent.feesStatus : 'Pending';

    const usernameInput = document.getElementById('username').value;
    const studentPasswordInput = document.getElementById('studentPassword').value;
    const monthlyFeeInput = document.getElementById('monthlyFee') ? document.getElementById('monthlyFee').value : '0';

    // Validation
    if (!usernameInput || !studentPasswordInput) {
        alert('Please create login credentials for the student.');
        if (!document.getElementById('credPanel').classList.contains('active')) toggleStepPanel('credPanel');
        return;
    }
    if (!monthlyFeeInput || monthlyFeeInput === '0') {
        alert('Please set the student fee structure.');
        if (!document.getElementById('feePanel').classList.contains('active')) toggleStepPanel('feePanel');
        return;
    }

    const newStudent = {
        id: isEdit ? idField.value : Date.now().toString(),
        fullName: document.getElementById('fullName').value,
        fatherName: document.getElementById('fatherName').value,
        classGrade: document.getElementById('classGrade').value,
        parentPhone: document.getElementById('parentPhone').value,
        rollNo: document.getElementById('rollNo').value,
        formB: document.getElementById('formB').value,
        feesStatus: currentStatus,
        monthlyFee: monthlyFeeInput,
        feeFrequency: document.getElementById('feeFrequency') ? document.getElementById('feeFrequency').value : 'Monthly',
        username: usernameInput,
        password: studentPasswordInput,
        role: 'Student'
    };

    // Auto-set payment date if status is Paid
    if (currentStatus === 'Paid') {
        if (existingStudent && existingStudent.feesStatus === 'Paid' && existingStudent.paymentDate) {
            newStudent.paymentDate = existingStudent.paymentDate;
        } else {
            newStudent.paymentDate = new Date().toLocaleDateString();
        }
    } else {
        newStudent.paymentDate = '';
    }

    let students = getData(STORAGE_KEY_STUDENTS);
    if (isEdit) {
        const index = students.findIndex(s => s.id === newStudent.id);
        if (index !== -1) students[index] = newStudent;
    } else {
        students.push(newStudent);
    }
    saveData(STORAGE_KEY_STUDENTS, students);

    pushNotification('Student Updated', `Account for "${newStudent.fullName}" saved and activated.`, 'user');
    toggleStudentForm();
    renderStudents();
    showSuccessModal('Student Registered!', `The account for ${newStudent.fullName} is now active. They can log in using username: ${usernameInput}`);
}

function renderStudents(term = '') {
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;

    // Ensure term is a string (handle case where it might be an event object from DOMContentLoaded)
    if (typeof term !== 'string') term = '';

    const students = getData(STORAGE_KEY_STUDENTS);
    const filtered = students.filter(s =>
        (s.fullName && s.fullName.toLowerCase().includes(term)) ||
        (s.rollNo && s.rollNo.toString().toLowerCase().includes(term))
    );

    // Update total count display - Use filtered results length as requested
    const totalCountEl = document.getElementById('totalStudentCount');
    if (totalCountEl) totalCountEl.innerText = filtered.length;

    tbody.innerHTML = '';
    const noData = document.getElementById('noDataMessage');

    if (filtered.length === 0) {
        noData.style.display = 'block';
    } else {
        noData.style.display = 'none';
        filtered.forEach(s => {
            let statusClass = s.feesStatus === 'Paid' ? 'status-paid' : (s.feesStatus === 'Late' ? 'status-failed' : 'status-pending');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${s.rollNo}</b></td>
                <td><div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:30px;height:30px;background:rgba(32, 176, 164, 0.1);color:var(--primary-color);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold">${s.fullName.charAt(0).toUpperCase()}</div>
                    ${s.fullName}
                </div></td>
                <td>${s.fatherName || '-'}</td>
                <td>${s.classGrade}</td>
                <td>${s.parentPhone}</td>
                <td>${s.formB || '-'}</td>
                <td><span class="status-badge ${statusClass}">${s.feesStatus}</span></td>
                <td>
                    <button class="action-btn btn-edit" onclick='editStudent(${JSON.stringify(s)})'><i data-lucide="edit-2" width="14"></i> Edit</button>
                    <button class="action-btn btn-delete" onclick="deleteStudent('${s.id}')"><i data-lucide="trash-2" width="14"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        window.lucide.createIcons();
    }
}

function editStudent(s) {
    toggleStudentForm(true);
    document.getElementById('studentId').value = s.id;
    document.getElementById('fullName').value = s.fullName;
    document.getElementById('fatherName').value = s.fatherName || '';
    document.getElementById('classGrade').value = s.classGrade;
    document.getElementById('parentPhone').value = s.parentPhone;
    document.getElementById('rollNo').value = s.rollNo;
    document.getElementById('formB').value = s.formB || '';
    if (document.getElementById('monthlyFee')) document.getElementById('monthlyFee').value = s.monthlyFee || '0';
    if (document.getElementById('feeFrequency')) document.getElementById('feeFrequency').value = s.feeFrequency || 'Monthly';
    if (document.getElementById('username')) document.getElementById('username').value = s.username || '';
    if (document.getElementById('studentPassword')) document.getElementById('studentPassword').value = s.password || '';
}

function deleteStudent(id) {
    if (confirm('Delete this student?')) {
        let students = getData(STORAGE_KEY_STUDENTS);
        students = students.filter(s => s.id !== id);
        saveData(STORAGE_KEY_STUDENTS, students);
        renderStudents();
    }
}


// =======================================================
// ==================== TEACHER LOGIC ====================
// =======================================================

function toggleTeacherForm(editMode = false) {
    const container = document.getElementById('teacherFormContainer');
    const form = document.getElementById('teacherForm');
    const title = document.getElementById('teacherFormTitle');

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('teacherId').value = '';
    } else {
        container.style.display = 'block';
        // Reset Panels
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.action-step-btn').forEach(b => b.classList.remove('active'));

        if (!editMode) {
            form.reset();
            document.getElementById('teacherId').value = '';
            title.innerText = 'Add New Teacher';
        } else {
            title.innerText = 'Edit Teacher Details';
        }
    }
}

function handleTeacherFormSubmit(e) {
    e.preventDefault();
    const idField = document.getElementById('teacherId');
    const isEdit = idField.value !== '';

    const usernameInput = document.getElementById('tUsername').value;
    const tPasswordInput = document.getElementById('tPassword').value;
    const salaryValInput = document.getElementById('tSalary').value || '0';

    // Validation
    if (!usernameInput || !tPasswordInput) {
        alert('Please create login credentials for the teacher.');
        if (!document.getElementById('credPanel').classList.contains('active')) toggleStepPanel('credPanel');
        return;
    }
    if (!salaryValInput || salaryValInput === '0') {
        alert('Please set the teacher salary.');
        if (!document.getElementById('salaryPanel').classList.contains('active')) toggleStepPanel('salaryPanel');
        return;
    }

    const newTeacher = {
        id: isEdit ? idField.value : Date.now().toString(),
        fullName: document.getElementById('tFullName').value,
        fatherName: document.getElementById('tFatherName').value,
        cnic: document.getElementById('tCnic').value,
        phone: document.getElementById('tPhone').value,
        address: document.getElementById('tAddress').value,
        qualification: document.getElementById('tQualification').value,
        gender: document.getElementById('tGender').value,
        subject: document.getElementById('tSubject').value,
        salary: salaryValInput,
        username: usernameInput,
        password: tPasswordInput,
        role: 'Teacher'
    };

    let teachers = getData(STORAGE_KEY_TEACHERS);
    if (isEdit) {
        const index = teachers.findIndex(t => t.id === newTeacher.id);
        if (index !== -1) teachers[index] = newTeacher;
    } else {
        teachers.push(newTeacher);
    }
    saveData(STORAGE_KEY_TEACHERS, teachers);

    pushNotification('Staff Updated', `Teacher account for "${newTeacher.fullName}" saved and activated.`, 'book');
    toggleTeacherForm();
    renderTeachers();
    showSuccessModal('Teacher Registered!', `Professor ${newTeacher.fullName}'s account is active. They can now access their portal.`);
}

function renderTeachers(term = '') {
    const tbody = document.getElementById('teacherTableBody');
    if (!tbody) return;

    if (typeof term !== 'string') term = '';

    const teachers = getData(STORAGE_KEY_TEACHERS);
    const filtered = teachers.filter(t =>
        (t.fullName && t.fullName.toLowerCase().includes(term)) ||
        (t.subject && t.subject.toString().toLowerCase().includes(term))
    );

    // Update total count display
    const totalCountEl = document.getElementById('totalTeacherCount');
    if (totalCountEl) totalCountEl.innerText = filtered.length;

    tbody.innerHTML = '';
    const noData = document.getElementById('noTeacherDataMessage');

    if (filtered.length === 0) {
        noData.style.display = 'block';
    } else {
        noData.style.display = 'none';
        filtered.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:30px;height:30px;background:#f0bdd1;color:#be185d;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold">${t.fullName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:500">${t.fullName}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary)">${t.qualification || ''}</div>
                    </div>
                </div></td>
                <td>${t.fatherName || '-'}</td>
                <td>${t.subject}</td>
                <td style="font-weight:600;">PKR ${parseInt(t.salary || 0).toLocaleString()}</td>
                <td>${t.phone || '-'}</td>
                <td>
                    <button class="action-btn btn-view" onclick='viewTeacherAttendance(${JSON.stringify(t)})' title="View Attendance">
                        <i data-lucide="eye" width="14"></i>
                    </button>
                    <button class="action-btn btn-edit" onclick='editTeacher(${JSON.stringify(t)})'><i data-lucide="edit-2" width="14"></i> Edit</button>
                    <button class="action-btn btn-delete" onclick="deleteTeacher('${t.id}')"><i data-lucide="trash-2" width="14"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        window.lucide.createIcons();
    }
}

function editTeacher(t) {
    toggleTeacherForm(true);
    document.getElementById('teacherId').value = t.id;
    document.getElementById('tFullName').value = t.fullName;
    document.getElementById('tFatherName').value = t.fatherName || '';
    document.getElementById('tCnic').value = t.cnic || '';
    document.getElementById('tPhone').value = t.phone;
    document.getElementById('tAddress').value = t.address || '';
    document.getElementById('tQualification').value = t.qualification || '';
    document.getElementById('tGender').value = t.gender || '';
    document.getElementById('tSubject').value = t.subject;
    document.getElementById('tSalary').value = t.salary || '0';
    if (document.getElementById('tUsername')) document.getElementById('tUsername').value = t.username || '';
    if (document.getElementById('tPassword')) document.getElementById('tPassword').value = t.password || '';
}

function deleteTeacher(id) {
    if (confirm('Delete this teacher?')) {
        let teachers = getData(STORAGE_KEY_TEACHERS);
        teachers = teachers.filter(t => t.id !== id);
        saveData(STORAGE_KEY_TEACHERS, teachers);
        renderTeachers();
    }
}


function viewTeacherAttendance(teacher, monthKey = null) {
    const modal = document.getElementById('attendanceModal');
    const title = document.getElementById('attModalTitle');
    const grid = document.getElementById('attendanceGrid');

    if (!modal || !grid) return;

    // Default to current month if not specified (Format: YYYY-MM)
    const date = new Date();
    if (!monthKey) {
        monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    title.innerText = `Attendance: ${teacher.fullName} (${monthKey})`;
    modal.style.display = 'flex';
    grid.innerHTML = '';

    // Get Attendance Data
    const allAttendance = getData(STORAGE_KEY_TEACHER_ATTENDANCE) || {};
    // Structure: { "teacherID_YYYY-MM": [P, P, A, ...] }
    const recordKey = `${teacher.id}_${monthKey}`;

    let monthRecord = allAttendance[recordKey];

    // If no record, init with defaults (Absent)
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    if (!monthRecord) {
        monthRecord = Array(daysInMonth).fill('A');
        // We don't save yet unless modified, or we can save init state. Let's save on modify.
    }

    // Calculate Today's Date Components for Validation
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // Check if the viewed month is strictly the current month
    const [viewYear, viewMonth] = monthKey.split('-').map(Number);
    const isCurrentMonth = (viewYear === currentYear && viewMonth === currentMonth);

    // Render Grid
    monthRecord.forEach((status, index) => {
        const day = index + 1;
        const isPresent = status === 'P';
        const statusClass = isPresent ? 'status-present' : 'status-absent';

        // "One day valid": Is this cell for Today?
        const isToday = isCurrentMonth && (day === currentDay);

        const cell = document.createElement('div');
        cell.className = `attendance-day ${statusClass}`;

        // Only Today is clickable
        if (isToday) {
            cell.style.cursor = 'pointer';
            cell.style.border = '2px solid var(--primary-color)'; // Highlight today
            cell.title = "Mark Attendance";
            cell.onclick = () => toggleTeacherAttendanceDay(teacher.id, monthKey, index);
        } else {
            cell.style.cursor = 'default';
            cell.style.opacity = '0.7'; // Visual cue that others are locked
        }

        cell.innerHTML = `
            <div style="font-weight:bold; font-size:1.1rem;">${day}</div>
            <div>${status}</div>
        `;

        grid.appendChild(cell);
    });

    // Close modal on outside click
    modal.onclick = (e) => {
        if (e.target === modal) closeAttendanceModal();
    };
}

function toggleTeacherAttendanceDay(teacherId, monthKey, dayIndex) {
    const recordKey = `${teacherId}_${monthKey}`;
    let allAttendance = getData(STORAGE_KEY_TEACHER_ATTENDANCE) || {};
    let monthRecord = allAttendance[recordKey];

    // If starting fresh
    if (!monthRecord) {
        const date = new Date(); // Simplified for current month context
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        monthRecord = Array(daysInMonth).fill('A');
    }

    // Toggle
    monthRecord[dayIndex] = monthRecord[dayIndex] === 'P' ? 'A' : 'P';

    // Save
    allAttendance[recordKey] = monthRecord;
    saveData(STORAGE_KEY_TEACHER_ATTENDANCE, allAttendance);

    // Refresh View
    const teachers = getData(STORAGE_KEY_TEACHERS);
    const teacher = teachers.find(t => t.id === teacherId);
    if (teacher) viewTeacherAttendance(teacher, monthKey);
}

function closeAttendanceModal() {
    const modal = document.getElementById('attendanceModal');
    if (modal) modal.style.display = 'none';
}

// =======================================================
// ==================== STAFF LOGIC ======================
// =======================================================

function toggleStaffForm(editMode = false) {
    const container = document.getElementById('staffFormContainer');
    const form = document.getElementById('staffForm');
    const title = document.getElementById('staffFormTitle');

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('staffId').value = '';
    } else {
        container.style.display = 'block';
        if (!editMode) {
            form.reset();
            document.getElementById('staffId').value = '';
            title.innerText = 'Add New Staff Member';
        } else {
            title.innerText = 'Edit Staff Member';
        }
    }
}

function handleStaffFormSubmit(e) {
    e.preventDefault();
    const idField = document.getElementById('staffId');
    const isEdit = idField.value !== '';

    const newStaff = {
        id: isEdit ? idField.value : Date.now().toString(),
        fullName: document.getElementById('sFullName').value,
        fatherName: document.getElementById('sFatherName').value,
        designation: document.getElementById('sDesignation').value,
        cnic: document.getElementById('sCnic').value,
        phone: document.getElementById('sPhone').value,
        address: document.getElementById('sAddress').value,
        gender: document.getElementById('sGender').value,
        salary: document.getElementById('sSalary').value || '0',
    };

    let staff = getData(STORAGE_KEY_STAFF);
    if (isEdit) {
        const index = staff.findIndex(s => s.id === newStaff.id);
        if (index !== -1) staff[index] = newStaff;
    } else {
        staff.push(newStaff);
    }
    saveData(STORAGE_KEY_STAFF, staff);
    pushNotification('Staff Updated', `Staff record for "${newStaff.fullName}" was added/updated.`, 'user');
    toggleStaffForm();
    renderStaff();
}

function renderStaff(term = '') {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    if (typeof term !== 'string') term = '';

    const staff = getData(STORAGE_KEY_STAFF);
    const filtered = staff.filter(s =>
        (s.fullName && s.fullName.toLowerCase().includes(term)) ||
        (s.designation && s.designation.toString().toLowerCase().includes(term))
    );

    // Update total count display
    const totalCountEl = document.getElementById('totalStaffCount');
    if (totalCountEl) totalCountEl.innerText = filtered.length;

    tbody.innerHTML = '';
    const noData = document.getElementById('noStaffDataMessage');

    if (filtered.length === 0) {
        noData.style.display = 'block';
    } else {
        noData.style.display = 'none';
        filtered.forEach(s => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div style="display:flex;align-items:center;gap:0.5rem">
                    <div style="width:30px;height:30px;background:#dcfce7;color:#166534;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold">${s.fullName.charAt(0).toUpperCase()}</div>
                    <div>
                        <div style="font-weight:500">${s.fullName}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary)">${s.designation || ''}</div>
                    </div>
                </div></td>
                <td>${s.fatherName || '-'}</td>
                <td>${s.designation}</td>
                <td>${s.cnic || '-'}</td>
                <td>${s.phone || '-'}</td>
                <td>PKR ${s.salary}</td>
                <td>
                    <button class="action-btn btn-edit" onclick='editStaff(${JSON.stringify(s)})'><i data-lucide="edit-2" width="14"></i> Edit</button>
                    <button class="action-btn btn-delete" onclick="deleteStaff('${s.id}')"><i data-lucide="trash-2" width="14"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        window.lucide.createIcons();
    }
}

function editStaff(s) {
    toggleStaffForm(true);
    document.getElementById('staffId').value = s.id;
    document.getElementById('sFullName').value = s.fullName;
    document.getElementById('sFatherName').value = s.fatherName || '';
    document.getElementById('sDesignation').value = s.designation || '';
    document.getElementById('sCnic').value = s.cnic || '';
    document.getElementById('sPhone').value = s.phone;
    document.getElementById('sAddress').value = s.address || '';
    document.getElementById('sGender').value = s.gender || '';
    document.getElementById('sSalary').value = s.salary || '0';
}

function deleteStaff(id) {
    if (confirm('Delete this staff member?')) {
        let staff = getData(STORAGE_KEY_STAFF);
        staff = staff.filter(s => s.id !== id);
        saveData(STORAGE_KEY_STAFF, staff);
        renderStaff();
    }
}


// =======================================================
// ==================== CLASS LOGIC ======================
// =======================================================

function toggleClassForm(editMode = false) {
    const container = document.getElementById('classFormContainer');
    const form = document.getElementById('classForm');
    const title = document.getElementById('classFormTitle');

    if (container.style.display === 'block' && !editMode) {
        container.style.display = 'none';
        form.reset();
        document.getElementById('classId').value = '';
    } else {
        container.style.display = 'block';
        if (!editMode) {
            form.reset();
            document.getElementById('classId').value = '';
            title.innerText = 'Add New Class';
        } else {
            title.innerText = 'Edit Class Details';
        }
    }
}

function handleClassFormSubmit(e) {
    e.preventDefault();
    const idField = document.getElementById('classId');
    const isEdit = idField.value !== '';

    const newClass = {
        id: isEdit ? idField.value : Date.now().toString(),
        name: document.getElementById('cName').value,
        section: document.getElementById('cSection').value,
        room: document.getElementById('cRoom').value,
        capacity: document.getElementById('cCapacity').value,
    };

    let classes = getData(STORAGE_KEY_CLASSES);
    if (isEdit) {
        const index = classes.findIndex(c => c.id === newClass.id);
        if (index !== -1) classes[index] = newClass;
    } else {
        classes.push(newClass);
    }
    saveData(STORAGE_KEY_CLASSES, classes);

    toggleClassForm();
    renderClasses();
}

function renderClasses(term = '') {
    const tbody = document.getElementById('classTableBody');
    if (!tbody) return;

    if (typeof term !== 'string') term = '';

    const classes = getData(STORAGE_KEY_CLASSES);
    const filtered = classes.filter(c => c.name && c.name.toLowerCase().includes(term));

    tbody.innerHTML = '';
    const noData = document.getElementById('noClassDataMessage');

    if (filtered.length === 0) {
        noData.style.display = 'block';
    } else {
        noData.style.display = 'none';
        filtered.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${c.name}</b></td>
                <td>${c.section}</td>
                <td>${c.room}</td>
                <td>${c.capacity}</td>
                <td>
                    <button class="action-btn btn-edit" onclick='editClass(${JSON.stringify(c)})'><i data-lucide="edit-2" width="14"></i> Edit</button>
                    <button class="action-btn btn-delete" onclick="deleteClass('${c.id}')"><i data-lucide="trash-2" width="14"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        window.lucide.createIcons();
    }
}

function editClass(c) {
    toggleClassForm(true);
    document.getElementById('classId').value = c.id;
    document.getElementById('cName').value = c.name;
    document.getElementById('cSection').value = c.section;
    document.getElementById('cRoom').value = c.room;
    document.getElementById('cCapacity').value = c.capacity;
}

function deleteClass(id) {
    if (confirm('Delete this class?')) {
        let classes = getData(STORAGE_KEY_CLASSES);
        classes = classes.filter(c => c.id !== id);
        saveData(STORAGE_KEY_CLASSES, classes);
        renderClasses();
    }
}

// =======================================================
// ==================== SETTINGS LOGIC ===================
// =======================================================

function renderLoginHistory() {
    // Get Current User Info
    const authData = localStorage.getItem(STORAGE_KEY_AUTH);
    const auth = authData ? JSON.parse(authData) : { email: 'Admin User' };
    const userDisplay = document.getElementById('currentUserDisplay');
    if (userDisplay) {
        userDisplay.innerText = auth.email;
    }

    // Get History
    const history = JSON.parse(localStorage.getItem('EDUCORE_LOGIN_HISTORY')) || [];
    const tbody = document.getElementById('loginHistoryBody');
    const noData = document.getElementById('noLoginData');

    if (!tbody) return;
    tbody.innerHTML = '';

    if (history.length === 0) {
        if (noData) noData.style.display = 'block';
    } else {
        if (noData) noData.style.display = 'none';
        history.forEach(log => {
            const date = new Date(log.timestamp);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding: 0.75rem 1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color);">${log.email}</td>
                <td style="padding: 0.75rem 1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color);">${dateStr}</td>
                <td style="padding: 0.75rem 1rem; border-bottom: 1px solid var(--border-color);">
                    <span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 99px; font-size: 0.75rem;">${log.status}</span>
                </td>
                <td style="padding: 0.75rem 1rem; color: var(--text-secondary); border-bottom: 1px solid var(--border-color);">${log.ip}</td>
            `;
            tbody.appendChild(row);
        });
    }
}



function loadSettings() {
    const settings = localStorage.getItem(STORAGE_KEY_SETTINGS);
    const auth = localStorage.getItem(STORAGE_KEY_AUTH);

    if (settings) {
        const data = JSON.parse(settings);
        if (document.getElementById('sSchoolName')) document.getElementById('sSchoolName').value = data.schoolName || '';
        if (document.getElementById('sSession')) document.getElementById('sSession').value = data.session || '';
        if (document.getElementById('sPhone')) document.getElementById('sPhone').value = data.phone || '';
    }

    if (auth) {
        const authData = JSON.parse(auth);
        if (document.getElementById('sContactEmail')) document.getElementById('sContactEmail').value = authData.email || 'Apexiums@school.com';
    }
}

function handleSettingsSubmit(e) {
    e.preventDefault();

    // 1. Get current values from storage for verification
    const storedAuth = localStorage.getItem(STORAGE_KEY_AUTH);
    const currentAuth = storedAuth ? JSON.parse(storedAuth) : { email: 'Apexiums@school.com', password: 'Apexiums1717' };

    // 2. Get verification inputs
    const vEmail = document.getElementById('vOldEmail').value;
    const vPass = document.getElementById('vOldPassword').value;

    // 3. Verify
    if (vEmail.toLowerCase() !== currentAuth.email.toLowerCase() || vPass !== currentAuth.password) {
        alert('Verification Failed: Current Email or Password is incorrect. Changes not saved.');
        return;
    }

    // 4. If verified, proceed with update
    const settings = {};
    if (document.getElementById('sSchoolName')) settings.schoolName = document.getElementById('sSchoolName').value;
    if (document.getElementById('sSession')) settings.session = document.getElementById('sSession').value;
    if (document.getElementById('sPhone')) settings.phone = document.getElementById('sPhone').value;

    const emailEl = document.getElementById('sContactEmail');
    const passEl = document.getElementById('sPassword');

    const newEmail = emailEl ? emailEl.value : currentAuth.email;
    const newPassword = passEl ? passEl.value : '';

    const updatedAuth = { ...currentAuth };
    if (newEmail) updatedAuth.email = newEmail;
    if (newPassword) updatedAuth.password = newPassword;

    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(updatedAuth));

    alert('Account Credentials Updated Successfully!');
    pushNotification('Security Update', 'Admin credentials have been updated.', 'login');

    // Reset security/verification fields
    if (passEl) passEl.value = '';
    if (document.getElementById('vOldEmail')) document.getElementById('vOldEmail').value = '';
    if (document.getElementById('vOldPassword')) document.getElementById('vOldPassword').value = '';

    // Refresh display
    renderLoginHistory();
}

// =======================================================
// ==================== NOTIFICATIONS LOGIC ==============
// =======================================================

function pushNotification(title, message, type = 'info') {
    const notifications = getData(STORAGE_KEY_NOTIFICATIONS);
    const newNotif = {
        id: Date.now(),
        title,
        message,
        type,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString()
    };
    notifications.unshift(newNotif);
    saveData(STORAGE_KEY_NOTIFICATIONS, notifications.slice(0, 20)); // Keep last 20
    renderNotifications();
}

function renderNotifications() {
    const list = document.getElementById('notificationList');
    const badge = document.getElementById('notifBadge');
    const panel = document.getElementById('notificationPanel');
    if (!list) return;

    const notifications = getData(STORAGE_KEY_NOTIFICATIONS);

    // Update Badge
    if (badge) {
        badge.innerText = notifications.length;
        badge.style.display = notifications.length > 0 ? 'flex' : 'none';
    }

    if (notifications.length === 0) {
        // If empty, remove the active class so the entire panel (header included) disappears
        if (panel) panel.classList.remove('active');
        list.innerHTML = '';
        return;
    }

    list.innerHTML = '';
    notifications.forEach(n => {
        let icon = 'bell';
        let bg = 'rgba(32, 176, 164, 0.1)';
        let color = 'var(--primary-color)';

        if (n.type === 'login') { icon = 'log-in'; }
        if (n.type === 'user') { icon = 'user'; }
        if (n.type === 'book') { icon = 'book-open'; }
        if (n.type === 'alert') { icon = 'alert-triangle'; bg = '#fef2f2'; color = '#ef4444'; }

        const div = document.createElement('div');
        div.className = 'notif-item';
        div.style.cursor = 'pointer';
        div.title = 'Click to dismiss';
        div.onclick = (e) => {
            e.stopPropagation();
            removeNotification(n.id);
        };

        div.innerHTML = `
            <div class="notif-icon" style="background: ${bg}; color: ${color};">
                <i data-lucide="${icon}" size="18"></i>
            </div>
            <div class="notif-content">
                <span class="notif-title">${n.title}</span>
                <p class="notif-desc">${n.message}</p>
                <span class="notif-time">${n.time} • ${n.date}</span>
            </div>
        `;
        list.appendChild(div);
    });

    if (window.lucide) window.lucide.createIcons();
}

function removeNotification(id) {
    let notifications = getData(STORAGE_KEY_NOTIFICATIONS);
    notifications = notifications.filter(n => n.id !== id);
    saveData(STORAGE_KEY_NOTIFICATIONS, notifications);
    renderNotifications();
}

function clearAllNotifications(e) {
    if (e) e.stopPropagation();
    saveData(STORAGE_KEY_NOTIFICATIONS, []);
    renderNotifications();
}

// === TEACHER SALARY LOGIC ===
function getTeacherSalaries() {
    const data = localStorage.getItem(STORAGE_KEY_TEACHER_SALARIES);
    return data ? JSON.parse(data) : {};
}

function saveTeacherSalaries(salaries) {
    localStorage.setItem(STORAGE_KEY_TEACHER_SALARIES, JSON.stringify(salaries));
}

function toggleSalaryPayment(teacherId, monthKey) {
    const salaries = getTeacherSalaries();
    // Key format: teacherId_YYYY-MM
    const key = `${teacherId}_${monthKey}`;

    if (salaries[key]) {
        // Toggle off
        delete salaries[key];
        pushNotification('Salary Update', 'Salary payment record removed.', 'info');
    } else {
        // Record payment
        const now = new Date();
        salaries[key] = {
            paid: true,
            date: now.toLocaleDateString(),
            time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        pushNotification('Salary Update', 'Salary payment recorded successfully.', 'success');
    }

    saveTeacherSalaries(salaries);
    if (typeof renderTeacherSalaries === 'function') {
        renderTeacherSalaries();
    }
}
