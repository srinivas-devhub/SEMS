/* ==========================================================================
   SMART EQUIPMENT MAINTENANCE SYSTEM (SEMS) - ENTERPRISE ENGINE
   Full Stack Interactive Asset Reliability & Maintenance Platform
   ========================================================================== */

// Global State Management
const SEMS_STATE = {
  currentUser: { 
    name: 'Alex Mercer (Admin)', 
    role: 'Plant Manager (Admin)', 
    role_type: 'Admin',
    email: 'admin@smartfactory.com',
    permissions: {}
  },
  users: [],
  machines: [],
  technicians: [],
  maintenanceTasks: [],
  notifications: [],
  recentActivities: [],
  kpiData: { total_machines: 150, active_machines: 132, maintenance_due: 10, overdue_maintenance: 3, completed_services: 95 },
  charts: {},
  isSendingWA: false,
  currentNotifFilter: 'all',
  currentTechTab: 'roster'
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initUserSession();
  fetchInitialData();
  setupResponsiveHandlers();
});

/* --------------------------------------------------------
   THEME CONTROLLER (DARK & LIGHT THEMES)
   -------------------------------------------------------- */
function initTheme() {
  const savedTheme = localStorage.getItem('sems_theme') || 'dark';
  setTheme(savedTheme);
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.className = theme === 'dark' ? 'theme-dark' : 'theme-light';
  localStorage.setItem('sems_theme', theme);

  const btnIcon = document.getElementById('themeToggleIcon');
  const btnText = document.getElementById('themeToggleText');
  if (btnIcon && btnText) {
    if (theme === 'dark') {
      btnIcon.className = 'fa-solid fa-moon';
      btnText.innerText = 'Dark Theme';
    } else {
      btnIcon.className = 'fa-solid fa-sun';
      btnText.innerText = 'Light Theme';
    }
  }

  // Update chart visual styles
  updateChartsTheme(theme);
}

function updateChartsTheme(theme) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)';

  if (window.Chart) {
    Chart.defaults.color = textColor;
    Chart.defaults.borderColor = gridColor;
  }

  // Re-render active charts if present
  if (SEMS_STATE.charts) {
    Object.values(SEMS_STATE.charts).forEach(chart => {
      try {
        if (chart && chart.options) {
          if (chart.options.scales) {
            Object.values(chart.options.scales).forEach(scale => {
              if (scale.ticks) scale.ticks.color = textColor;
              if (scale.grid) scale.grid.color = gridColor;
            });
          }
          chart.update();
        }
      } catch (err) {
        // ignore chart update errors
      }
    });
  }
}

/* --------------------------------------------------------
   USER SESSION & ROLE-BASED ACCESS CONTROL (RBAC)
   -------------------------------------------------------- */
function initUserSession() {
  try {
    const stored = localStorage.getItem('sems_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user && user.email) {
        SEMS_STATE.currentUser = user;
        // If user is already stored, hide login page overlay
        const loginPage = document.getElementById('loginPage');
        if (loginPage) loginPage.style.display = 'none';
      }
    }
  } catch (e) {
    console.error("Error loading session:", e);
  }
  applyRoleAccessControl();
}

function hasPermission(permissionKey) {
  const user = SEMS_STATE.currentUser;
  if (!user) return true;
  if (user.role_type === 'Admin' || (user.role && user.role.toLowerCase().includes('admin'))) {
    return true;
  }
  if (user.permissions && typeof user.permissions === 'object') {
    return !!user.permissions[permissionKey];
  }
  return false;
}

function applyRoleAccessControl() {
  const user = SEMS_STATE.currentUser;
  if (!user) return;

  const isAdmin = user.role_type === 'Admin' || (user.role && user.role.toLowerCase().includes('admin'));

  // 1. Update Header Role Badge
  const headerBadge = document.getElementById('userHeaderBadge');
  const headerSpan = document.getElementById('userRoleHeaderSpan');
  const headerIcon = document.getElementById('userRoleHeaderIcon');
  if (headerBadge && headerSpan && headerIcon) {
    if (isAdmin) {
      headerBadge.className = 'role-badge role-admin';
      headerSpan.innerText = 'Admin (Full Access)';
      headerIcon.className = 'fa-solid fa-shield-halved';
    } else {
      headerBadge.className = 'role-badge role-technician';
      headerSpan.innerText = 'Technician (Governed)';
      headerIcon.className = 'fa-solid fa-screwdriver-wrench';
    }
  }

  // 2. Update Sidebar Profile
  const nameDisplay = document.getElementById('userNameDisplay');
  const roleDisplay = document.getElementById('userRoleDisplay');
  const avatarDisplay = document.getElementById('userAvatar');
  if (nameDisplay) nameDisplay.innerText = user.name;
  if (roleDisplay) roleDisplay.innerText = user.role;
  if (avatarDisplay) {
    avatarDisplay.innerText = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  // 3. Sidebar Navigation Permissions
  document.querySelectorAll('.sidebar-menu .nav-item').forEach(item => {
    const perm = item.getAttribute('data-perm');
    if (!perm) return;
    
    if (perm === 'technicians') {
      // Technicians module & User Access is Admin only
      item.style.display = isAdmin ? 'flex' : 'none';
    } else if (isAdmin || hasPermission(perm)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });

  // 4. Sub-tab in Technicians view: User Logins & Permissions
  const userAccessTabBtn = document.getElementById('tabUserAccessBtn');
  if (userAccessTabBtn) {
    userAccessTabBtn.style.display = isAdmin ? 'inline-block' : 'none';
  }

  // 5. In-page action buttons
  const addMacBtnInv = document.getElementById('addMachineBtnInventory');
  if (addMacBtnInv) {
    addMacBtnInv.style.display = (isAdmin || hasPermission('add_machine')) ? 'inline-flex' : 'none';
  }

  const notifWABtn = document.getElementById('notifSendWABtn');
  if (notifWABtn) {
    notifWABtn.style.display = (isAdmin || hasPermission('whatsapp')) ? 'inline-flex' : 'none';
  }
}

/* --------------------------------------------------------
   DATA FETCHING & REFRESH
   -------------------------------------------------------- */
async function fetchInitialData() {
  try {
    // 1. KPI Stats
    const kpiRes = await fetch('/api/kpi');
    if (kpiRes.ok) {
      SEMS_STATE.kpiData = await kpiRes.json();
      updateKPICards();
    }

    // 2. Machines
    const macRes = await fetch('/api/machines');
    if (macRes.ok) {
      SEMS_STATE.machines = await macRes.json();
      renderMachinesTable();
    }

    // 3. Technicians
    await loadTechnicians();

    // 4. Maintenance Schedules
    const mainRes = await fetch('/api/maintenance');
    if (mainRes.ok) {
      SEMS_STATE.maintenanceTasks = await mainRes.json();
      renderSchedulerTable();
    }

    // 5. Recent Activities
    const actRes = await fetch('/api/recent-activities');
    if (actRes.ok) {
      SEMS_STATE.recentActivities = await actRes.json();
      renderRecentActivityTable();
    }

    // 6. Notifications
    const notifRes = await fetch('/api/notifications');
    if (notifRes.ok) {
      SEMS_STATE.notifications = await notifRes.json();
      renderNotifications();
    }

    // 7. Users (if Admin)
    const isAdmin = SEMS_STATE.currentUser?.role_type === 'Admin' || (SEMS_STATE.currentUser?.role && SEMS_STATE.currentUser.role.toLowerCase().includes('admin'));
    if (isAdmin) {
      loadUsers();
    }

    // 8. Render Charts
    initCharts();

    // Re-apply access control after loading
    applyRoleAccessControl();

  } catch (err) {
    console.error("Data load error:", err);
    updateKPICards();
    renderRecentActivityTable();
    initCharts();
  }
}

/* --------------------------------------------------------
   NAVIGATION & TAB ROUTING
   -------------------------------------------------------- */
function switchTab(viewId, element) {
  const permMap = {
    'dashboardView': 'dashboard',
    'machinesView': 'machines',
    'addMachineView': 'add_machine',
    'schedulerView': 'scheduler',
    'techniciansView': 'technicians',
    'notificationsView': 'notifications',
    'reportsView': 'reports'
  };

  const requiredPerm = permMap[viewId];
  if (requiredPerm) {
    const isAdmin = SEMS_STATE.currentUser?.role_type === 'Admin' || (SEMS_STATE.currentUser?.role && SEMS_STATE.currentUser.role.toLowerCase().includes('admin'));
    if (requiredPerm === 'technicians' && !isAdmin) {
      showToast('Access Restricted: Technician management and user controls are reserved for Administrators.');
      return;
    }
    if (!isAdmin && !hasPermission(requiredPerm)) {
      showToast('Access Denied: Your administrator has restricted access to this module.');
      return;
    }
  }

  // Update sidebar active classes
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  } else {
    const matchingNav = document.querySelector(`.nav-item[data-target="${viewId}"]`);
    if (matchingNav) matchingNav.classList.add('active');
  }

  // Hide all views and show target view
  document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));
  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  if (viewId === 'addMachineView') {
    const mIdInput = document.getElementById('addMachineId');
    if (mIdInput && (!mIdInput.value || mIdInput.value.startsWith('MCH-'))) {
      generateAutoId();
    }
  }

  // Update Page Title in Top Header
  const titleMap = {
    'dashboardView': 'Executive Maintenance Dashboard',
    'machinesView': 'Machine Inventory System',
    'addMachineView': 'Register Equipment Asset',
    'schedulerView': 'Calendar Maintenance Scheduler',
    'techniciansView': 'Technician Roster & User Access Control',
    'notificationsView': 'Notification Center & Alert Management',
    'reportsView': 'Industrial Analytics & Audit Reports'
  };

  const titleElem = document.getElementById('pageTitleDisplay');
  if (titleElem && titleMap[viewId]) {
    titleElem.innerText = titleMap[viewId];
  }

  // Resize charts on view change if necessary
  if (viewId === 'reportsView' && SEMS_STATE.charts.downtimeBar) {
    setTimeout(() => {
      SEMS_STATE.charts.downtimeBar.resize();
      SEMS_STATE.charts.costChart.resize();
    }, 50);
  }

  // Refresh data when navigating to Technicians view
  if (viewId === 'techniciansView') {
    if (SEMS_STATE.currentTechTab === 'access') {
      loadUsers();
    } else {
      loadTechnicians();
    }
  }

  // Close mobile sidebar if open
  closeMobileSidebar();
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) {
    sidebar.classList.toggle('mobile-open');
  }
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  if (sidebar) {
    sidebar.classList.remove('mobile-open');
  }
}

function setupResponsiveHandlers() {
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('appSidebar');
    const menuBtn = document.getElementById('mobileMenuBtn');
    if (sidebar && sidebar.classList.contains('mobile-open')) {
      if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
        sidebar.classList.remove('mobile-open');
      }
    }
  });
}

/* --------------------------------------------------------
   MODULE 1: AUTHENTICATION & LOGIN
   -------------------------------------------------------- */
function selectLoginRole(role) {
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  if (emailInput) {
    emailInput.value = '';
    emailInput.placeholder = role === 'admin' 
      ? 'Enter admin email (e.g. admin@smartfactory.com)' 
      : 'Enter technician email';
    emailInput.focus();
  }
  if (passInput) {
    passInput.value = '';
    passInput.placeholder = 'Enter password';
  }
  hideLoginAlert();
}

function fillLogin(email, password) {
  selectLoginRole(email && email.includes('admin') ? 'admin' : 'technician');
}

function showLoginAlert(msg) {
  const banner = document.getElementById('loginAlertBanner');
  const text = document.getElementById('loginAlertMessage');
  if (banner && text) {
    text.innerText = msg;
    banner.style.display = 'flex';
  }
}

function hideLoginAlert() {
  const banner = document.getElementById('loginAlertBanner');
  if (banner) banner.style.display = 'none';
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

async function handleLogin() {
  hideLoginAlert();
  const emailInput = document.getElementById('loginEmail');
  const passInput = document.getElementById('loginPassword');
  const email = emailInput.value.trim();
  const password = passInput.value.trim();

  // Validate empty fields
  if (!email) {
    showLoginAlert('Please enter your work email address.');
    emailInput.focus();
    return;
  }

  if (!validateEmail(email)) {
    showLoginAlert('Please enter a valid work email address format.');
    emailInput.focus();
    return;
  }

  if (!password) {
    showLoginAlert('Please enter your account password.');
    passInput.focus();
    return;
  }

  // Toggle button loading spinner
  const submitBtn = document.getElementById('loginSubmitBtn');
  const btnIcon = document.getElementById('loginBtnIcon');
  const btnText = document.getElementById('loginBtnText');

  if (submitBtn) submitBtn.disabled = true;
  if (btnIcon) btnIcon.className = 'fa-solid fa-spinner fa-spin';
  if (btnText) btnText.innerText = 'Authenticating...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (res.ok && data.status === 'success') {
      SEMS_STATE.currentUser = data.user;
      try {
        localStorage.setItem('sems_user', JSON.stringify(data.user));
      } catch (e) {}
      
      // Update UI displays
      document.getElementById('userNameDisplay').innerText = data.user.name;
      document.getElementById('userRoleDisplay').innerText = data.user.role;
      document.getElementById('userAvatar').innerText = data.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

      // Apply role-based access control immediately
      applyRoleAccessControl();

      // Hide login overlay
      document.getElementById('loginPage').style.display = 'none';
      showToast(`Welcome back, ${data.user.name}!`);
      
      // Fetch latest data
      fetchInitialData();
    } else {
      showLoginAlert(data.message || 'Invalid work email or password. Please verify credentials.');
    }
  } catch (err) {
    console.error("Login request failed:", err);
    // Graceful fallback for offline demo testing
    if (email === 'admin@smartfactory.com' || email.includes('admin')) {
      SEMS_STATE.currentUser = { name: 'Alex Mercer (Admin)', role: 'Plant Manager (Admin)', role_type: 'Admin', email, permissions: {} };
    } else {
      SEMS_STATE.currentUser = { name: 'Sarah Connor (Technician)', role: 'Senior Reliability Engineer (Technician)', role_type: 'Technician', email, permissions: { dashboard: true, machines: true, scheduler: true, update_scheduler: true, notifications: true } };
    }
    try {
      localStorage.setItem('sems_user', JSON.stringify(SEMS_STATE.currentUser));
    } catch (e) {}
    document.getElementById('userNameDisplay').innerText = SEMS_STATE.currentUser.name;
    document.getElementById('userRoleDisplay').innerText = SEMS_STATE.currentUser.role;
    applyRoleAccessControl();
    document.getElementById('loginPage').style.display = 'none';
    showToast(`Logged in as ${SEMS_STATE.currentUser.name}`);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
    if (btnIcon) btnIcon.className = 'fa-solid fa-right-to-bracket';
    if (btnText) btnText.innerText = 'Sign In to Dashboard';
  }
}

function logout() {
  try {
    localStorage.removeItem('sems_user');
  } catch (e) {}
  document.getElementById('loginPage').style.display = 'flex';
  hideLoginAlert();
  showToast('Logged out of SEMS Industrial ERP.');
}

function handlePasswordReset() {
  const email = document.getElementById('resetEmailInput').value.trim();
  if (!email || !validateEmail(email)) {
    alert('Please enter a valid work email address.');
    return;
  }
  showToast(`Password reset link dispatched to ${email}!`);
  closeModal('forgotPasswordModal');
}

/* --------------------------------------------------------
   MODULE 2: DASHBOARD & KPI CARDS
   -------------------------------------------------------- */
function updateKPICards() {
  const data = SEMS_STATE.kpiData;
  const setVal = (id, val, fallback) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val !== undefined && val !== null ? val : fallback;
  };

  setVal('kpiTotalMachines', data.total_machines, 150);
  setVal('kpiActiveMachines', data.active_machines, 132);
  setVal('kpiMaintenanceDue', data.maintenance_due, 10);
  setVal('kpiOverdue', data.overdue_maintenance, 3);
  setVal('kpiCompleted', data.completed_services, 95);
}

function renderRecentActivityTable() {
  const tbody = document.getElementById('recentActivityTableBody');
  if (!tbody) return;

  let activities = SEMS_STATE.recentActivities;

  if (!activities || activities.length === 0) {
    activities = SEMS_STATE.maintenanceTasks.slice(0, 5).map(t => ({
      name: t.machine_name || t.machine_id,
      type: t.service_type || 'Preventive Maintenance',
      date: t.maintenance_date,
      status: t.status,
      tech: t.technician_name || 'Assigned Specialist'
    }));
  }

  if (activities.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">No recent maintenance activities recorded.</td></tr>`;
    return;
  }

  tbody.innerHTML = activities.slice(0, 6).map(act => `
    <tr>
      <td style="font-weight: 700; color: var(--primary-dark);">${act.name}</td>
      <td>${act.type}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${act.date}</td>
      <td>${getStatusBadge(act.status)}</td>
      <td><i class="fa-solid fa-user-gear" style="color: var(--primary-blue); font-size: 0.8rem; margin-right: 0.3rem;"></i> ${act.tech}</td>
    </tr>
  `).join('');
}

/* --------------------------------------------------------
   CHARTS INITIALIZATION
   -------------------------------------------------------- */
function initCharts() {
  // 1. Monthly Trend Line Chart
  const trendCtx = document.getElementById('monthlyTrendChart');
  if (trendCtx) {
    if (SEMS_STATE.charts.trendLine) SEMS_STATE.charts.trendLine.destroy();
    SEMS_STATE.charts.trendLine = new Chart(trendCtx, {
      type: 'line',
      data: {
        labels: ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'],
        datasets: [
          {
            label: 'Completed Preventive Services',
            data: [77, 84, 88, 92, 97, 95],
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#2563eb',
            pointRadius: 4
          },
          {
            label: 'Unplanned Machine Breakdowns',
            data: [5, 4, 3, 2, 1, 3],
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            borderDash: [5, 5],
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointBackgroundColor: '#ef4444',
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, font: { family: 'Plus Jakarta Sans', size: 12 } } }
        },
        scales: {
          y: { grid: { color: 'rgba(226, 232, 240, 0.6)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 2. Status Doughnut Chart
  const statusCtx = document.getElementById('statusPieChart');
  if (statusCtx) {
    if (SEMS_STATE.charts.statusPie) SEMS_STATE.charts.statusPie.destroy();
    SEMS_STATE.charts.statusPie = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['Completed Services', 'Scheduled / Pending', 'Overdue Alerts'],
        datasets: [{
          data: [
            SEMS_STATE.kpiData.completed_services || 95,
            SEMS_STATE.kpiData.maintenance_due || 10,
            SEMS_STATE.kpiData.overdue_maintenance || 3
          ],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { family: 'Plus Jakarta Sans', size: 12 } } }
        },
        cutout: '70%'
      }
    });
  }

  // 3. Downtime Bar Chart
  const downtimeCtx = document.getElementById('downtimeBarChart');
  if (downtimeCtx) {
    if (SEMS_STATE.charts.downtimeBar) SEMS_STATE.charts.downtimeBar.destroy();
    SEMS_STATE.charts.downtimeBar = new Chart(downtimeCtx, {
      type: 'bar',
      data: {
        labels: ['Machining Shop', 'Thermal Utilities', 'Assembly Line A', 'Robotics Hub', 'Utility Plant'],
        datasets: [{
          label: 'Downtime Hours (Sep 2026)',
          data: [18.5, 34.0, 12.2, 8.0, 22.5],
          backgroundColor: '#0284c7',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 4. Cost Analysis Bar Chart
  const costCtx = document.getElementById('costAnalysisChart');
  if (costCtx) {
    if (SEMS_STATE.charts.costChart) SEMS_STATE.charts.costChart.destroy();
    SEMS_STATE.charts.costChart = new Chart(costCtx, {
      type: 'bar',
      data: {
        labels: ['Spare Parts', 'Labor', 'Emergency Repair', 'Overhauls'],
        datasets: [{
          label: 'Expenditure ($)',
          data: [14200, 9800, 4500, 18600],
          backgroundColor: ['#3b82f6', '#10b981', '#ef4444', '#8b5cf6'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.6)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }
}

/* --------------------------------------------------------
   MODULE 3: MACHINE MANAGEMENT & FILTERING
   -------------------------------------------------------- */
function renderMachinesTable() {
  const tbody = document.getElementById('machinesTableBody');
  if (!tbody) return;

  const machines = SEMS_STATE.machines;

  if (machines.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
      <i class="fa-solid fa-inbox" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
      No machine records found. Click "Add New Machine" to register assets.
    </td></tr>`;
    return;
  }

  const isAdmin = SEMS_STATE.currentUser?.role_type === 'Admin' || (SEMS_STATE.currentUser?.role && SEMS_STATE.currentUser.role.toLowerCase().includes('admin'));
  const canEdit = isAdmin || hasPermission('add_machine');
  const canDelete = isAdmin || hasPermission('delete_machine');

  tbody.innerHTML = machines.slice(0, 30).map(m => {
    const score = m.health_score !== undefined ? m.health_score : 90;
    const scoreColor = score < 70 ? '#ef4444' : score < 85 ? '#f59e0b' : '#10b981';

    return `
    <tr>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary-navy);">${m.machine_id}</td>
      <td style="font-weight: 700;">${m.machine_name}</td>
      <td>${m.category}</td>
      <td>${m.location}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${m.install_date}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${m.next_service_date || '2026-09-25'}</td>
      <td>
        <button class="btn btn-sm btn-secondary health-score-badge" onclick="openHealthScoreModal('${m.machine_id}')" title="Click to view Health Score Formula Breakdown & Simulator">
          <i class="fa-solid fa-heart-pulse" style="color: ${scoreColor};"></i>
          <span>${score}%</span>
        </button>
      </td>
      <td>${getStatusBadge(m.status)}</td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" onclick="openEditMachineModal('${m.machine_id}')" title="Edit Machine">
              <i class="fa-solid fa-pen"></i>
            </button>
          ` : ''}
          ${canDelete ? `
            <button class="btn btn-danger btn-sm" onclick="deleteMachine('${m.machine_id}')" title="Delete Machine">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
          ${!canEdit && !canDelete ? `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">View Only</span>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function filterMachinesList() {
  const query = (document.getElementById('machineSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('statusFilterSelect')?.value || '';

  const filtered = SEMS_STATE.machines.filter(m => {
    const matchesQ = !query || 
      m.machine_name.toLowerCase().includes(query) || 
      m.machine_id.toLowerCase().includes(query) || 
      (m.department && m.department.toLowerCase().includes(query)) ||
      (m.category && m.category.toLowerCase().includes(query));
    const matchesStatus = !status || m.status === status;
    return matchesQ && matchesStatus;
  });

  const tbody = document.getElementById('machinesTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
      <i class="fa-solid fa-magnifying-glass" style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
      No equipment found matching "<strong>${query || status}</strong>".
    </td></tr>`;
    return;
  }

  const isAdmin = SEMS_STATE.currentUser?.role_type === 'Admin' || (SEMS_STATE.currentUser?.role && SEMS_STATE.currentUser.role.toLowerCase().includes('admin'));
  const canEdit = isAdmin || hasPermission('add_machine');
  const canDelete = isAdmin || hasPermission('delete_machine');

  tbody.innerHTML = filtered.slice(0, 30).map(m => {
    const score = m.health_score !== undefined ? m.health_score : 90;
    const scoreColor = score < 70 ? '#ef4444' : score < 85 ? '#f59e0b' : '#10b981';

    return `
    <tr>
      <td style="font-family: var(--font-mono); font-weight: 700;">${m.machine_id}</td>
      <td style="font-weight: 700;">${m.machine_name}</td>
      <td>${m.category}</td>
      <td>${m.location}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${m.install_date}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${m.next_service_date || '2026-09-25'}</td>
      <td>
        <button class="btn btn-sm btn-secondary health-score-badge" onclick="openHealthScoreModal('${m.machine_id}')" title="Click to view Health Score Formula Breakdown & Simulator">
          <i class="fa-solid fa-heart-pulse" style="color: ${scoreColor};"></i>
          <span>${score}%</span>
        </button>
      </td>
      <td>${getStatusBadge(m.status)}</td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          ${canEdit ? `
            <button class="btn btn-secondary btn-sm" onclick="openEditMachineModal('${m.machine_id}')" title="Edit Machine">
              <i class="fa-solid fa-pen"></i>
            </button>
          ` : ''}
          ${canDelete ? `
            <button class="btn btn-danger btn-sm" onclick="deleteMachine('${m.machine_id}')" title="Delete Machine">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
          ${!canEdit && !canDelete ? `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">View Only</span>` : ''}
        </div>
      </td>
    </tr>
  `;
  }).join('');
}

function openEditMachineModal(machineId) {
  const m = SEMS_STATE.machines.find(item => item.machine_id === machineId);
  if (!m) return;

  document.getElementById('editMachineIdHidden').value = m.machine_id;
  document.getElementById('editMachineIdDisplay').value = m.machine_id;
  document.getElementById('editMachineName').value = m.machine_name;
  document.getElementById('editCategory').value = m.category;
  document.getElementById('editDepartment').value = m.department;
  document.getElementById('editLocation').value = m.location;
  document.getElementById('editStatus').value = m.status;

  openModal('editMachineModal');
}

async function submitEditMachine() {
  const mId = document.getElementById('editMachineIdHidden').value;
  const newMachineId = (document.getElementById('editMachineIdDisplay').value || '').trim() || mId;
  const updatedData = {
    new_machine_id: newMachineId,
    machine_name: document.getElementById('editMachineName').value.trim(),
    category: document.getElementById('editCategory').value.trim(),
    department: document.getElementById('editDepartment').value.trim(),
    location: document.getElementById('editLocation').value.trim(),
    status: document.getElementById('editStatus').value
  };

  if (!updatedData.machine_name) {
    alert('Machine Name cannot be empty.');
    return;
  }

  try {
    const res = await fetch(`/api/machines/${mId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
    const result = await res.json();
    if (res.ok && result.status === 'success') {
      const targetIdx = SEMS_STATE.machines.findIndex(m => m.machine_id === mId);
      if (targetIdx !== -1) {
        SEMS_STATE.machines[targetIdx] = { 
          ...SEMS_STATE.machines[targetIdx], 
          ...updatedData, 
          machine_id: newMachineId 
        };
      }
      if (SEMS_STATE.maintenanceTasks) {
        SEMS_STATE.maintenanceTasks.forEach(task => {
          if (task.machine_id === mId) task.machine_id = newMachineId;
        });
      }
      renderMachinesTable();
      closeModal('editMachineModal');
      showToast(`Machine ${newMachineId} details updated successfully.`);
    } else {
      alert(result.message || 'Failed to update machine.');
    }
  } catch (e) {
    showToast(`Failed to update machine.`);
  }
}

async function deleteMachine(machineId) {
  if (confirm(`Are you sure you want to delete Machine ${machineId}? This will remove all associated logs.`)) {
    try {
      const res = await fetch(`/api/machines/${machineId}`, { method: 'DELETE' });
      if (res.ok) {
        SEMS_STATE.machines = SEMS_STATE.machines.filter(m => m.machine_id !== machineId);
        if (SEMS_STATE.kpiData.total_machines > 0) SEMS_STATE.kpiData.total_machines -= 1;
        updateKPICards();
        renderMachinesTable();
        showToast(`Machine ${machineId} deleted successfully.`);
      }
    } catch (e) {
      showToast(`Error deleting machine: ${e}`);
    }
  }
}

function generateAutoId() {
  const ids = (SEMS_STATE.machines || [])
    .map(m => parseInt(m.machine_id, 10))
    .filter(n => !isNaN(n));
  const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  const inp = document.getElementById('addMachineId');
  if (inp) inp.value = nextId;
  return nextId;
}

async function submitAddMachine() {
  const machineId = document.getElementById('addMachineId').value.trim();
  const machineName = document.getElementById('addMachineName').value.trim();

  if (!machineId || !machineName) {
    alert('Machine ID and Machine Name are required.');
    return;
  }

  const newMachine = {
    machine_id: machineId,
    machine_name: machineName,
    machine_type: document.getElementById('addMachineType').value,
    category: document.getElementById('addCategory').value,
    department: document.getElementById('addDepartment').value.trim(),
    location: document.getElementById('addLocation').value.trim(),
    install_date: document.getElementById('addInstallDate').value,
    manufacturer: document.getElementById('addManufacturer').value.trim(),
    maintenance_interval: document.getElementById('addInterval').value,
    notes: document.getElementById('addNotes').value.trim(),
    status: 'Active',
    health_score: 98
  };

  try {
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMachine)
    });
    const result = await res.json();

    if (res.ok && result.status === 'success') {
      SEMS_STATE.machines.unshift(newMachine);
      SEMS_STATE.kpiData.total_machines += 1;
      SEMS_STATE.kpiData.active_machines += 1;
      updateKPICards();
      renderMachinesTable();

      showToast(`Machine ${machineId} registered successfully!`);
      document.getElementById('addMachineForm').reset();
      switchTab('machinesView', document.querySelector('[data-target=machinesView]'));
    } else {
      alert(result.message || 'Could not add machine.');
    }
  } catch (err) {
    showToast('Failed to connect to backend.');
  }
}

/* --------------------------------------------------------
   MODULE 4: MAINTENANCE SCHEDULER
   -------------------------------------------------------- */
function renderSchedulerTable() {
  const tbody = document.getElementById('schedulerTableBody');
  if (!tbody) return;

  const tasks = SEMS_STATE.maintenanceTasks;

  if (tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
      <i class="fa-solid fa-calendar-xmark" style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
      No maintenance tasks scheduled. Click "Schedule Maintenance Task" above.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = tasks.map(t => `
    <tr>
      <td style="font-family: var(--font-mono); font-weight: 700;">#TASK-${t.maintenance_id}</td>
      <td style="font-weight: 700; color: var(--primary-dark);">${t.machine_name || t.machine_id}</td>
      <td><i class="fa-solid fa-user" style="color: var(--primary-blue); font-size: 0.8rem; margin-right: 0.25rem;"></i> ${t.technician_name || 'Marcus Vance'}</td>
      <td style="font-family: var(--font-mono); font-size: 0.85rem;">${t.maintenance_date}</td>
      <td><span class="priority-tag priority-${(t.priority || 'Medium').toLowerCase()}">${t.priority}</span></td>
      <td>${getStatusBadge(t.status)}</td>
      <td>${t.service_type || 'Routine Service'}</td>
      <td>
        <div style="display: flex; gap: 0.35rem; align-items: center; flex-wrap: wrap;">
          <button class="btn btn-whatsapp btn-sm" onclick="openWhatsAppModal(${t.technician_id}, '${t.machine_id}', '${t.status === 'Overdue' ? 'Overdue Critical Alert' : 'Maintenance Due Reminder'}', '${t.priority || 'High'}', '${(t.description || t.service_type || '').replace(/'/g, "\\'")}')" title="Notify Assigned Technician on WhatsApp">
            <i class="fa-brands fa-whatsapp"></i>
          </button>
          ${t.status !== 'Completed' ? `
            <button class="btn btn-secondary btn-sm" onclick="completeMaintenanceTask(${t.maintenance_id})" title="Mark Completed">
              <i class="fa-solid fa-check"></i>
            </button>
          ` : `<span style="font-size: 0.78rem; color: #10b981; font-weight: 700;"><i class="fa-solid fa-check-double"></i> Done</span>`}
          <button class="btn btn-danger btn-sm" onclick="deleteMaintenanceTask(${t.maintenance_id})" title="Delete Task">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openScheduleModal() {
  const mSelect = document.getElementById('schedMachineSelect');
  if (mSelect) {
    mSelect.innerHTML = SEMS_STATE.machines.map(m => `<option value="${m.machine_id}">${m.machine_id} - ${m.machine_name}</option>`).join('');
  }

  const tSelect = document.getElementById('schedTechSelect');
  if (tSelect) {
    tSelect.innerHTML = SEMS_STATE.technicians.map(t => `<option value="${t.technician_id}">${t.name} (${t.department})</option>`).join('');
  }

  // Set default date to future (7 days ahead)
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const futureStr = d.toISOString().split('T')[0];
  const dateInput = document.getElementById('schedDate');
  if (dateInput) {
    dateInput.value = futureStr;
    dateInput.min = new Date().toISOString().split('T')[0];
  }

  openModal('scheduleModal');
}

async function submitScheduleTask() {
  const machineId = document.getElementById('schedMachineSelect').value;
  const techId = document.getElementById('schedTechSelect').value;
  const dateVal = document.getElementById('schedDate').value;
  const priority = document.getElementById('schedPriority').value;
  const serviceType = document.getElementById('schedServiceType').value.trim();
  const description = document.getElementById('schedDescription').value.trim();

  // Date validation
  if (!dateVal) {
    alert('Please select a valid scheduled service date.');
    return;
  }

  const newTask = {
    machine_id: machineId,
    technician_id: parseInt(techId) || 101,
    maintenance_date: dateVal,
    priority: priority,
    service_type: serviceType,
    description: description
  };

  try {
    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    });

    if (res.ok) {
      // Re-fetch maintenance tasks
      const mRes = await fetch('/api/maintenance');
      if (mRes.ok) SEMS_STATE.maintenanceTasks = await mRes.json();

      SEMS_STATE.kpiData.maintenance_due += 1;
      updateKPICards();
      renderSchedulerTable();
      renderRecentActivityTable();

      closeModal('scheduleModal');
      showToast('Maintenance task scheduled successfully!');
    }
  } catch (err) {
    showToast('Failed to schedule maintenance.');
  }
}

async function completeMaintenanceTask(taskId) {
  try {
    const res = await fetch(`/api/maintenance/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Completed', notes: 'Completed by field engineer.' })
    });

    if (res.ok) {
      const task = SEMS_STATE.maintenanceTasks.find(t => t.maintenance_id === taskId);
      if (task) task.status = 'Completed';

      SEMS_STATE.kpiData.completed_services += 1;
      if (SEMS_STATE.kpiData.maintenance_due > 0) SEMS_STATE.kpiData.maintenance_due -= 1;

      updateKPICards();
      renderSchedulerTable();
      showToast(`Task #TASK-${taskId} marked as completed.`);
    }
  } catch (e) {
    showToast('Could not update task status.');
  }
}

async function deleteMaintenanceTask(taskId) {
  if (confirm(`Delete maintenance task #TASK-${taskId}?`)) {
    try {
      const res = await fetch(`/api/maintenance/${taskId}`, { method: 'DELETE' });
      if (res.ok) {
        SEMS_STATE.maintenanceTasks = SEMS_STATE.maintenanceTasks.filter(t => t.maintenance_id !== taskId);
        renderSchedulerTable();
        showToast(`Task #TASK-${taskId} deleted.`);
      }
    } catch (e) {
      showToast('Failed to delete task.');
    }
  }
}

/* --------------------------------------------------------
   MODULE 5: TECHNICIAN MANAGEMENT (WHATSAPP ENABLED)
   -------------------------------------------------------- */
async function loadTechnicians() {
  try {
    const res = await fetch('/api/technicians');
    if (res.ok) {
      SEMS_STATE.technicians = await res.json();
      renderTechniciansTable();
      populateWhatsAppTechDropdown();
    } else {
      console.warn("Could not fetch technicians:", res.statusText);
    }
  } catch (err) {
    console.warn("Could not fetch technicians:", err);
  }
}

function renderTechniciansTable() {
  const tbody = document.getElementById('techniciansTableBody');
  if (!tbody) return;

  const techs = SEMS_STATE.technicians;

  if (techs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
      <i class="fa-solid fa-users-slash" style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
      No technicians registered. Click "Add New Technician" above or create technician access.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = techs.map(t => {
    const rawPhone = t.phone || 'Not specified';
    const email = t.email || '';
    const statusClass = (t.status === 'Available' || t.status === 'Active') ? 'badge-active' : (t.status === 'Busy' ? 'badge-overdue' : 'badge-due');
    const displayStatus = (t.status === 'Active') ? 'Available' : (t.status || 'Available');
    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--primary-navy);">#TECH-${t.technician_id}</td>
        <td style="font-weight: 700; color: var(--primary-dark);">
          <a href="javascript:void(0)" onclick="openWhatsAppModalForTech(${t.technician_id})" title="Click to send WhatsApp message" style="color: var(--primary-dark); display: inline-flex; align-items: center; gap: 0.35rem;">
            <i class="fa-solid fa-user-gear" style="color: var(--primary-blue); font-size: 0.85rem;"></i>
            ${t.name}
          </a>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--primary-blue);">
          ${email ? `<a href="mailto:${email}" style="color: var(--primary-blue); text-decoration: none;">${email}</a>` : '<span style="color: var(--text-light); font-style: italic;">Optional</span>'}
        </td>
        <td>
          <a href="javascript:void(0)" onclick="openWhatsAppModalForTech(${t.technician_id})" class="whatsapp-badge" title="Click to message on WhatsApp (${rawPhone})">
            <i class="fa-brands fa-whatsapp" style="font-size: 0.95rem;"></i>
            <span>${rawPhone}</span>
          </a>
        </td>
        <td>
          <span style="font-size: 0.82rem; font-weight: 600; color: var(--primary-dark);">${t.department || 'Mechanical Systems'}</span>
        </td>
        <td>
          <div style="font-size: 0.82rem; font-weight: 600; color: var(--primary-dark);">${t.role || 'Field Specialist'}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;"><i class="fa-solid fa-list-check" style="font-size: 0.7rem;"></i> ${t.assigned_tasks || 0} Tasks Assigned</div>
        </td>
        <td>
          <span class="status-badge ${statusClass}">
            ${displayStatus}
          </span>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
          ${t.last_login ? `<i class="fa-regular fa-clock" style="margin-right: 3px;"></i>${t.last_login}` : '<span style="color: var(--text-light); font-style: italic;">Never</span>'}
        </td>
        <td>
          <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="openEditTechModal(${t.technician_id})" title="Edit Technician Details">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button class="btn btn-whatsapp btn-sm" onclick="openWhatsAppModalForTech(${t.technician_id})" title="Send WhatsApp Message">
              <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteTechnician(${t.technician_id})" title="Remove Technician">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddTechModal() {
  const form = document.getElementById('addTechForm');
  if (form) form.reset();

  const techIds = (SEMS_STATE.technicians || [])
    .map(t => parseInt(t.technician_id, 10))
    .filter(n => !isNaN(n));
  const nextTechId = techIds.length > 0 ? Math.max(...techIds) + 1 : 1;
  const techIdInp = document.getElementById('techIdInput');
  if (techIdInp) techIdInp.value = nextTechId;

  const passInp = document.getElementById('techPasswordInput');
  if (passInp) passInp.value = '';
  const deptInp = document.getElementById('techDeptInput');
  if (deptInp) deptInp.value = 'Mechanical Systems';
  const roleInp = document.getElementById('techRoleInput');
  if (roleInp) roleInp.value = 'Field Specialist (Technician)';

  // Default permissions for technician
  const defaultPerms = {
    addTechPerm_dashboard: true,
    addTechPerm_machines: true,
    addTechPerm_add_machine: false,
    addTechPerm_delete_machine: false,
    addTechPerm_scheduler: true,
    addTechPerm_update_scheduler: true,
    addTechPerm_notifications: true,
    addTechPerm_edit_notifications: false,
    addTechPerm_reports: false,
    addTechPerm_whatsapp: false
  };
  Object.entries(defaultPerms).forEach(([key, val]) => {
    const chk = document.getElementById(key);
    if (chk) chk.checked = val;
  });

  openModal('addTechModal');
}

async function submitAddTechnician() {
  const techIdVal = document.getElementById('techIdInput')?.value;
  const techId = techIdVal ? parseInt(techIdVal, 10) : undefined;
  const name = document.getElementById('techNameInput').value.trim();
  const phone = document.getElementById('techPhoneInput').value.trim();
  const dept = document.getElementById('techDeptInput').value.trim();
  const email = (document.getElementById('techEmailInput')?.value || '').trim();
  const role = (document.getElementById('techRoleInput')?.value || 'Field Specialist (Technician)').trim();
  const password = (document.getElementById('techPasswordInput')?.value || '').trim();

  if (!name || !phone) {
    alert('Technician Full Name and WhatsApp Contact Number are required.');
    return;
  }

  // Basic phone sanity check (must have at least 7 digits)
  const cleanDigits = phone.replace(/\D/g, '');
  if (cleanDigits.length < 7) {
    alert('Please enter a valid WhatsApp phone number (e.g. 8946028566 or +91 8946028566).');
    return;
  }

  if (!email || !validateEmail(email)) {
    alert('A valid Technician Work Email is required to establish login access.');
    return;
  }

  if (!password || password.length < 4) {
    alert('Login Password is required (minimum 4 characters) to grant technician login access.');
    return;
  }

  const permissions = {
    dashboard: document.getElementById('addTechPerm_dashboard')?.checked || false,
    machines: document.getElementById('addTechPerm_machines')?.checked || false,
    add_machine: document.getElementById('addTechPerm_add_machine')?.checked || false,
    delete_machine: document.getElementById('addTechPerm_delete_machine')?.checked || false,
    scheduler: document.getElementById('addTechPerm_scheduler')?.checked || false,
    update_scheduler: document.getElementById('addTechPerm_update_scheduler')?.checked || false,
    notifications: document.getElementById('addTechPerm_notifications')?.checked || false,
    edit_notifications: document.getElementById('addTechPerm_edit_notifications')?.checked || false,
    reports: document.getElementById('addTechPerm_reports')?.checked || false,
    whatsapp: document.getElementById('addTechPerm_whatsapp')?.checked || false
  };

  const newTech = { technician_id: techId, name, phone, department: dept, email, role, password, permissions };

  try {
    const res = await fetch('/api/technicians', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTech)
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      await loadTechnicians();
      await loadUsers();
      closeModal('addTechModal');
      document.getElementById('addTechForm').reset();
      showToast(`Technician #${data.technician_id || techId} (${name}) registered in Roster and granted system login access!`);
    } else {
      alert(data.message || 'Failed to register technician.');
    }
  } catch (e) {
    showToast('Failed to register technician.');
  }
}

function openEditTechModal(techId) {
  const t = SEMS_STATE.technicians.find(item => item.technician_id === techId);
  if (!t) return;

  document.getElementById('editTechIdHidden').value = t.technician_id;
  const editTechIdDisplay = document.getElementById('editTechIdDisplay');
  if (editTechIdDisplay) editTechIdDisplay.value = t.technician_id;
  document.getElementById('editTechName').value = t.name;
  document.getElementById('editTechPhone').value = t.phone || '';
  document.getElementById('editTechDept').value = t.department || '';
  document.getElementById('editTechEmail').value = t.email || '';
  document.getElementById('editTechStatus').value = t.status || 'Available';

  openModal('editTechModal');
}

async function submitEditTechnician() {
  const origTechId = document.getElementById('editTechIdHidden').value;
  const newTechIdVal = document.getElementById('editTechIdDisplay')?.value;
  const newTechId = newTechIdVal ? parseInt(newTechIdVal, 10) : parseInt(origTechId, 10);
  const name = document.getElementById('editTechName').value.trim();
  const phone = document.getElementById('editTechPhone').value.trim();
  const dept = document.getElementById('editTechDept').value.trim();
  const email = document.getElementById('editTechEmail').value.trim();
  const status = document.getElementById('editTechStatus').value;

  if (!name || !phone) {
    alert('Technician Name and WhatsApp Phone Number cannot be empty.');
    return;
  }

  if (email && !validateEmail(email)) {
    alert('Invalid email format. Please check the email or leave blank.');
    return;
  }

  const updated = { new_technician_id: newTechId, name, phone, department: dept, email, status };

  try {
    const res = await fetch(`/api/technicians/${origTechId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      await loadTechnicians();
      await loadUsers();
      closeModal('editTechModal');
      showToast(`Technician #${newTechId} (${name}) updated successfully.`);
    } else {
      alert(data.message || 'Failed to update technician.');
    }
  } catch (e) {
    showToast('Failed to update technician.');
  }
}

async function deleteTechnician(techId) {
  if (confirm(`Are you sure you want to remove technician record #TECH-${techId}?`)) {
    try {
      const res = await fetch(`/api/technicians/${techId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadTechnicians();
        showToast(`Technician removed.`);
      }
    } catch (e) {
      showToast('Error removing technician.');
    }
  }
}

/* --------------------------------------------------------
   MODULE 5B: TECHNICIAN USER LOGINS & PERMISSIONS (ADMIN GOVERNED)
   -------------------------------------------------------- */
function switchTechSubTab(tab) {
  SEMS_STATE.currentTechTab = tab;
  const rosterPanel = document.getElementById('techRosterPanel');
  const accessPanel = document.getElementById('userAccessPanel');
  const rosterBtn = document.getElementById('tabTechRosterBtn');
  const accessBtn = document.getElementById('tabUserAccessBtn');

  if (tab === 'access') {
    if (rosterPanel) rosterPanel.style.display = 'none';
    if (accessPanel) accessPanel.style.display = 'block';
    if (rosterBtn) rosterBtn.classList.remove('active');
    if (accessBtn) accessBtn.classList.add('active');
    loadUsers();
  } else {
    if (rosterPanel) rosterPanel.style.display = 'block';
    if (accessPanel) accessPanel.style.display = 'none';
    if (rosterBtn) rosterBtn.classList.add('active');
    if (accessBtn) accessBtn.classList.remove('active');
    loadTechnicians();
  }
}

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      SEMS_STATE.users = await res.json();
    }
  } catch (err) {
    console.warn("Could not fetch users:", err);
  }

  const users = SEMS_STATE.users;
  if (!users || users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No user accounts found. Click "Create Technician User Login" above.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const isAdmin = u.role_type === 'Admin' || (u.role && u.role.toLowerCase().includes('admin'));
    const perms = u.permissions || {};
    const permList = [];
    if (perms.dashboard) permList.push('Dashboard');
    if (perms.machines) permList.push('Machines');
    if (perms.add_machine) permList.push('+Add/Edit');
    if (perms.delete_machine) permList.push('-Delete');
    if (perms.scheduler) permList.push('Scheduler');
    if (perms.update_scheduler) permList.push('Tasks');
    if (perms.notifications) permList.push('Notifs');
    if (perms.edit_notifications) permList.push('Edit/Del Alerts');
    if (perms.reports) permList.push('Reports');
    if (perms.whatsapp) permList.push('WhatsApp');

    const permBadgesHtml = isAdmin 
      ? `<span class="priority-tag priority-critical" style="font-size: 0.72rem; background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;"><i class="fa-solid fa-crown"></i> Full Admin Access</span>`
      : (permList.length > 0
        ? permList.map(p => `<span class="priority-tag" style="font-size: 0.68rem; margin: 2px; padding: 0.15rem 0.4rem; background: var(--bg-main); border: 1px solid var(--border-subtle);">${p}</span>`).join('')
        : `<span style="font-size: 0.75rem; color: #ef4444; font-style: italic;">No permissions granted</span>`
      );

    return `
      <tr>
        <td style="font-family: var(--font-mono); font-weight: 700;">#USR-${u.user_id}</td>
        <td>
          <div style="font-weight: 700; color: var(--primary-dark); display: flex; align-items: center; gap: 0.4rem;">
            <i class="${isAdmin ? 'fa-solid fa-user-shield' : 'fa-solid fa-user'}" style="color: ${isAdmin ? '#2563eb' : '#64748b'};"></i>
            ${u.name}
          </div>
        </td>
        <td style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--primary-blue);">
          ${u.email}
        </td>
        <td>
          <div style="display: flex; flex-direction: column; gap: 0.25rem;">
            <span class="role-badge ${isAdmin ? 'role-admin' : 'role-technician'}" style="font-size: 0.75rem;">
              ${isAdmin ? 'Admin' : 'Technician'}
            </span>
            <span style="font-size: 0.75rem; color: ${u.status === 'Active' ? '#10b981' : '#ef4444'}; font-weight: 700;">
              ● ${u.status || 'Active'}
            </span>
          </div>
        </td>
        <td style="max-width: 280px;">
          <div style="display: flex; flex-wrap: wrap; gap: 0.2rem;">
            ${permBadgesHtml}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button class="btn btn-secondary btn-sm" onclick="openEditUserModal(${u.user_id})" title="Edit User & Permissions">
              <i class="fa-solid fa-user-pen"></i> Edit
            </button>
            ${!isAdmin ? `
              <button class="btn btn-danger btn-sm" onclick="deleteUserAccount(${u.user_id})" title="Delete User Account">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCreateUserModal() {
  const form = document.getElementById('manageUserAccessForm');
  if (form) form.reset();
  document.getElementById('userAccessIdHidden').value = '';
  document.getElementById('userModalTitle').innerText = 'Create Technician User Login & Grant Access';

  const userIds = (SEMS_STATE.users || [])
    .map(u => parseInt(u.user_id, 10))
    .filter(n => !isNaN(n));
  const nextUserId = userIds.length > 0 ? Math.max(...userIds) + 1 : 1;
  const userAccessIdInp = document.getElementById('userAccessIdInput');
  if (userAccessIdInp) userAccessIdInp.value = nextUserId;

  const passInput = document.getElementById('userAccessPassword');
  const passLabel = document.getElementById('userAccessPassLabel');
  const passHint = document.getElementById('userAccessPassHint');
  if (passInput) {
    passInput.required = true;
    passInput.value = '';
  }
  if (passLabel) passLabel.innerHTML = 'Password <span style="color: #dc2626;">*</span>';
  if (passHint) passHint.style.display = 'none';

  document.getElementById('userAccessRole').value = 'Senior Reliability Engineer (Technician)';
  document.getElementById('userAccessStatus').value = 'Active';

  const phoneInp = document.getElementById('userAccessPhone');
  if (phoneInp) phoneInp.value = '';
  const deptInp = document.getElementById('userAccessDept');
  if (deptInp) deptInp.value = 'Mechanical Systems';

  // Default permissions: basic view permissions, no destructive permissions
  const defaultPerms = {
    perm_dashboard: true,
    perm_machines: true,
    perm_add_machine: false,
    perm_delete_machine: false,
    perm_scheduler: true,
    perm_update_scheduler: true,
    perm_notifications: true,
    perm_edit_notifications: false,
    perm_reports: false,
    perm_whatsapp: false
  };

  Object.entries(defaultPerms).forEach(([key, val]) => {
    const chk = document.getElementById(key);
    if (chk) chk.checked = val;
  });

  openModal('manageUserAccessModal');
}

function openEditUserModal(userId) {
  const u = SEMS_STATE.users.find(item => item.user_id == userId);
  if (!u) return;

  const form = document.getElementById('manageUserAccessForm');
  if (form) form.reset();

  document.getElementById('userAccessIdHidden').value = u.user_id;
  const userAccessIdInp = document.getElementById('userAccessIdInput');
  if (userAccessIdInp) userAccessIdInp.value = u.user_id;

  document.getElementById('userModalTitle').innerText = `Edit User Access: ${u.name}`;

  document.getElementById('userAccessName').value = u.name;
  document.getElementById('userAccessEmail').value = u.email;

  const passInput = document.getElementById('userAccessPassword');
  const passLabel = document.getElementById('userAccessPassLabel');
  const passHint = document.getElementById('userAccessPassHint');
  if (passInput) {
    passInput.required = false;
    passInput.value = '';
  }
  if (passLabel) passLabel.innerHTML = 'Password (Optional)';
  if (passHint) passHint.style.display = 'block';

  document.getElementById('userAccessRole').value = u.role || 'Senior Reliability Engineer (Technician)';
  document.getElementById('userAccessStatus').value = u.status || 'Active';

  const phoneInp = document.getElementById('userAccessPhone');
  if (phoneInp) phoneInp.value = u.phone || '';
  const deptInp = document.getElementById('userAccessDept');
  if (deptInp) deptInp.value = u.department || 'Mechanical Systems';

  const perms = u.permissions || {};
  const permKeys = [
    'dashboard', 'machines', 'add_machine', 'delete_machine',
    'scheduler', 'update_scheduler', 'notifications', 'edit_notifications',
    'reports', 'whatsapp'
  ];

  permKeys.forEach(pk => {
    const chk = document.getElementById(`perm_${pk}`);
    if (chk) chk.checked = !!perms[pk];
  });

  openModal('manageUserAccessModal');
}

async function submitUserAccessForm() {
  const userId = document.getElementById('userAccessIdHidden').value;
  const userAccessIdVal = document.getElementById('userAccessIdInput')?.value;
  const enteredUserId = userAccessIdVal ? parseInt(userAccessIdVal, 10) : null;
  const name = document.getElementById('userAccessName').value.trim();
  const email = document.getElementById('userAccessEmail').value.trim();
  const password = document.getElementById('userAccessPassword').value.trim();
  const role = document.getElementById('userAccessRole').value;
  const status = document.getElementById('userAccessStatus').value;
  const phone = document.getElementById('userAccessPhone')?.value.trim() || '';
  const department = document.getElementById('userAccessDept')?.value.trim() || 'Mechanical Systems';

  if (!name || !email) {
    alert('Name and Email are required.');
    return;
  }

  if (!userId && !password) {
    alert('Password is required when creating a new user account.');
    return;
  }

  const permissions = {
    dashboard: document.getElementById('perm_dashboard')?.checked || false,
    machines: document.getElementById('perm_machines')?.checked || false,
    add_machine: document.getElementById('perm_add_machine')?.checked || false,
    delete_machine: document.getElementById('perm_delete_machine')?.checked || false,
    scheduler: document.getElementById('perm_scheduler')?.checked || false,
    update_scheduler: document.getElementById('perm_update_scheduler')?.checked || false,
    notifications: document.getElementById('perm_notifications')?.checked || false,
    edit_notifications: document.getElementById('perm_edit_notifications')?.checked || false,
    reports: document.getElementById('perm_reports')?.checked || false,
    whatsapp: document.getElementById('perm_whatsapp')?.checked || false
  };

  const payload = { name, email, role, status, permissions, phone, department };
  if (password) {
    payload.password = password;
  }
  if (!userId && enteredUserId) {
    payload.user_id = enteredUserId;
  } else if (userId && enteredUserId) {
    payload.new_user_id = enteredUserId;
  }

  try {
    let res;
    if (userId) {
      res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      closeModal('manageUserAccessModal');
      showToast(userId ? `User access for ${name} updated and synced to Technician Roster!` : `Technician access created for ${name} and added to Technician Roster!`);
      await loadUsers();
      await loadTechnicians();
    } else {
      alert(data.message || 'Error saving user account.');
    }
  } catch (e) {
    showToast('Failed to save user account.');
  }
}

async function deleteUserAccount(userId) {
  if (confirm(`Are you sure you want to delete user account #USR-${userId}? They will no longer be able to log in.`)) {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        showToast('User account removed.');
        await loadUsers();
        await loadTechnicians();
      } else {
        alert(data.message || 'Failed to delete user.');
      }
    } catch (e) {
      showToast('Error deleting user account.');
    }
  }
}

function populateWhatsAppTechDropdown() {
  const select = document.getElementById('waTechSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Select Registered Field Engineer --</option>' +
    SEMS_STATE.technicians.map(t => {
      const phoneDisplay = t.phone || 'No phone';
      return `<option value="${t.technician_id}">${t.name} (${phoneDisplay} - ${t.department})</option>`;
    }).join('');

  if (currentVal && SEMS_STATE.technicians.some(t => t.technician_id == currentVal)) {
    select.value = currentVal;
  }
}

function applySelectedTechWhatsApp() {
  const techId = document.getElementById('waTechSelect').value;
  const t = SEMS_STATE.technicians.find(item => item.technician_id == techId);
  const phoneInput = document.getElementById('waRecipientPhone');

  if (t && phoneInput) {
    phoneInput.value = t.phone || '';
  }
  updateWhatsAppPreview();
}

/* --------------------------------------------------------
   MODULE 6: WHATSAPP MESSAGING & NOTIFICATION CENTER
   -------------------------------------------------------- */

/**
 * Normalizes phone numbers to pure digits including country code for WhatsApp URLs.
 * Automatically adds country code 91 for standard 10-digit Indian numbers.
 */
function formatWhatsAppNumber(rawPhone, defaultCountry = '91') {
  if (!rawPhone) return '';
  // Remove spaces, parentheses, hyphens
  let clean = rawPhone.replace(/[^\d+]/g, '');

  if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }
  if (clean.startsWith('00')) {
    clean = clean.substring(2);
  }
  // Remove leading single 0 if domestic style
  if (clean.length === 11 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }
  // If 10 digits, prepend default country code (e.g. 91)
  if (clean.length === 10) {
    clean = defaultCountry + clean;
  }
  return clean;
}

/**
 * Builds the structured WhatsApp notification text with rich formatting
 */
function generateWhatsAppMessageText() {
  const techId = document.getElementById('waTechSelect')?.value;
  const t = SEMS_STATE.technicians.find(item => item.technician_id == techId);
  const techName = t ? t.name : 'Field Reliability Engineer';
  const phone = document.getElementById('waRecipientPhone')?.value || (t ? t.phone : '');

  const machineId = document.getElementById('waMachineSelect')?.value;
  const m = SEMS_STATE.machines.find(item => item.machine_id === machineId) || {
    machine_id: machineId || 'MCH-UNIT',
    machine_name: 'Industrial Equipment Unit',
    category: 'General Equipment',
    department: 'Main Plant Floor',
    location: 'Bay A',
    status: 'Active',
    health_score: 95,
    manufacturer: 'Siemens Industrial'
  };

  const priority = document.getElementById('waPrioritySelect')?.value || 'High';
  const waType = document.getElementById('waTypeSelect')?.value || 'Maintenance Due Reminder';
  const dueDate = document.getElementById('waDueDateInput')?.value || new Date().toISOString().split('T')[0];
  const notes = (document.getElementById('waCustomNotes')?.value || '').trim();

  const priorityEmoji = priority === 'Critical' ? '🚨' : priority === 'High' ? '⚠️' : priority === 'Medium' ? '⚡' : 'ℹ️';

  let defaultTaskNotes = '';
  if (waType === 'Maintenance Due Reminder') {
    defaultTaskNotes = 'Scheduled preventive maintenance due. Conduct thorough visual inspection, test vibration thresholds, replenish lubricants, and record resolution in SEMS.';
  } else if (waType === 'Overdue Critical Alert') {
    defaultTaskNotes = 'URGENT ATTENTION REQUIRED: Scheduled servicing for this asset is OVERDUE! Immediate diagnostic check and safety verification must be performed to prevent equipment failure.';
  } else if (waType === 'Equipment Breakdown Emergency') {
    defaultTaskNotes = 'EMERGENCY SHUTDOWN ALERT: Equipment reported breakdown during active shift. Immediate technical intervention and component triage required at workstation.';
  } else if (waType === 'Technician Assignment Work Order') {
    defaultTaskNotes = 'You have been assigned as the primary reliability lead for this unit. Please inspect maintenance logbook and schedule necessary toolsets.';
  } else {
    defaultTaskNotes = 'Perform routine maintenance check, test calibration accuracy, and confirm operational health score.';
  }

  const taskNotes = notes || defaultTaskNotes;

  return `🔧 *SMART FACTORY | EQUIPMENT MAINTENANCE DISPATCH*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 *Assigned Specialist:* ${techName} (${phone})
${priorityEmoji} *Priority Level:* *${priority.toUpperCase()}*
📋 *Work Order Type:* ${waType}

🏭 *EQUIPMENT SPECIFICATIONS:*
• *Machine ID:* ${m.machine_id}
• *Machine Name:* ${m.machine_name}
• *Category:* ${m.category || 'Machinery'}
• *Department:* ${m.department || 'Production'}
• *Plant Location:* ${m.location || 'Main Floor'}
• *Operating Status:* ${m.status || 'Active'} (Health Score: ${m.health_score || 90}%)
• *Manufacturer:* ${m.manufacturer || 'Siemens Industrial'}

📅 *Service Target Date:* ${dueDate}

📝 *REQUIRED OPERATIONAL INSTRUCTIONS:*
${taskNotes}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏭 *SEMS Industrial Platform | Plant Reliability Ops*`;
}

function updateWhatsAppPreview() {
  const bubble = document.getElementById('whatsappMessageBubble');
  if (!bubble) return;

  const rawText = generateWhatsAppMessageText();

  // Convert WhatsApp *bold* to <strong>, and \n to <br> for the preview chat bubble
  let formattedHtml = rawText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  bubble.innerHTML = `
    <div>${formattedHtml}</div>
    <div class="whatsapp-bubble-time">
      <span>${timeStr}</span>
      <i class="fa-solid fa-check-double" style="color: #53bdeb; font-size: 0.75rem;"></i>
    </div>
  `;
}

function handleWATypeChange() {
  const type = document.getElementById('waTypeSelect')?.value;
  const prioSelect = document.getElementById('waPrioritySelect');
  const notesArea = document.getElementById('waCustomNotes');

  if (type === 'Overdue Critical Alert' || type === 'Equipment Breakdown Emergency') {
    if (prioSelect) prioSelect.value = 'Critical';
  } else if (type === 'Maintenance Due Reminder') {
    if (prioSelect) prioSelect.value = 'High';
  } else if (type === 'Technician Assignment Work Order') {
    if (prioSelect) prioSelect.value = 'Medium';
  } else {
    if (prioSelect) prioSelect.value = 'Low';
  }

  updateWhatsAppPreview();
}

function openWhatsAppModal(presetTechId = null, presetMachineId = null, presetType = 'Maintenance Due Reminder', presetPriority = 'High', presetNotes = '') {
  // 1. Populate Machine dropdown
  const mSelect = document.getElementById('waMachineSelect');
  if (mSelect) {
    mSelect.innerHTML = SEMS_STATE.machines.map(m => `
      <option value="${m.machine_id}">${m.machine_id} - ${m.machine_name} (${m.department})</option>
    `).join('');
    if (presetMachineId) mSelect.value = presetMachineId;
  }

  // 2. Populate Technician dropdown
  populateWhatsAppTechDropdown();
  const tSelect = document.getElementById('waTechSelect');
  if (tSelect) {
    if (presetTechId) {
      tSelect.value = presetTechId;
    } else if (SEMS_STATE.technicians.length > 0) {
      tSelect.value = SEMS_STATE.technicians[0].technician_id;
    }
  }

  // 3. Set phone number
  applySelectedTechWhatsApp();

  // 4. Set Type, Priority, Date, Notes
  const typeSelect = document.getElementById('waTypeSelect');
  if (typeSelect) typeSelect.value = presetType;

  const prioSelect = document.getElementById('waPrioritySelect');
  if (prioSelect) prioSelect.value = presetPriority;

  const dateInput = document.getElementById('waDueDateInput');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }

  const notesInput = document.getElementById('waCustomNotes');
  if (notesInput) {
    notesInput.value = presetNotes || '';
  }

  // 5. Hide previous alert banner
  const banner = document.getElementById('whatsappDispatchStatusBanner');
  if (banner) banner.style.display = 'none';

  // 6. Update Preview & Open Modal
  updateWhatsAppPreview();
  openModal('sendWhatsAppModal');
}

function openWhatsAppModalForTech(techId) {
  // If machine is selected or default
  const defaultMachineId = SEMS_STATE.machines[0]?.machine_id || 'MCH-CNC-001';
  openWhatsAppModal(techId, defaultMachineId, 'Technician Assignment Work Order', 'High');
}

function openWhatsAppModalForAlert(machineId, message, dueDate, priority) {
  const isOverdue = priority === 'Critical' || (message && message.toLowerCase().includes('overdue'));
  const isBreakdown = message && message.toLowerCase().includes('breakdown');
  const type = isBreakdown ? 'Equipment Breakdown Emergency' : (isOverdue ? 'Overdue Critical Alert' : 'Maintenance Due Reminder');

  // Pick first technician assigned to machine or default
  const firstTech = SEMS_STATE.technicians[0];
  const techId = firstTech ? firstTech.technician_id : null;

  openWhatsAppModal(techId, machineId, type, priority, message);

  const dateInput = document.getElementById('waDueDateInput');
  if (dateInput && dueDate) {
    dateInput.value = dueDate;
    updateWhatsAppPreview();
  }
}

function copyWhatsAppMessage() {
  const text = generateWhatsAppMessageText();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('✓ WhatsApp message copied to clipboard!');
    }).catch(() => {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  showToast('✓ WhatsApp message copied to clipboard!');
}

/**
 * Dispatches WhatsApp message directly via device WhatsApp account (Web or Desktop App)
 * and logs the notification to the backend.
 */
async function submitWhatsAppDispatch(mode = 'auto') {
  if (SEMS_STATE.isSendingWA) return;

  const phoneInput = document.getElementById('waRecipientPhone');
  const rawPhone = phoneInput ? phoneInput.value.trim() : '';

  const banner = document.getElementById('whatsappDispatchStatusBanner');
  const btn = document.getElementById('sendWhatsAppBtn');
  const btnIcon = document.getElementById('sendWABtnIcon');
  const btnText = document.getElementById('sendWABtnText');

  const cleanPhone = formatWhatsAppNumber(rawPhone);

  if (!cleanPhone || cleanPhone.length < 10) {
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = '#fee2e2';
      banner.style.color = '#b91c1c';
      banner.style.border = '1px solid #fca5a5';
      banner.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Please enter a valid 10+ digit WhatsApp phone number with country code (e.g. 8946028566 or +91 8946028566).`;
    }
    return;
  }

  const messageText = generateWhatsAppMessageText();
  const encodedMessage = encodeURIComponent(messageText);

  // Construct target WhatsApp URL
  // If mode === 'web', force WhatsApp Web directly in browser tab
  // If mode === 'auto', use api.whatsapp.com/send which seamlessly delegates to WhatsApp Desktop or Web
  let whatsappUrl = '';
  if (mode === 'web') {
    whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
  } else {
    whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
  }

  // Trigger WhatsApp launch on the device
  window.open(whatsappUrl, '_blank');

  // Log dispatch in backend database
  const techId = document.getElementById('waTechSelect')?.value;
  const techObj = SEMS_STATE.technicians.find(t => t.technician_id == techId);
  const techName = techObj ? techObj.name : 'Field Specialist';
  const machineId = document.getElementById('waMachineSelect')?.value || 'Industrial Equipment';
  const priority = document.getElementById('waPrioritySelect')?.value || 'High';
  const waType = document.getElementById('waTypeSelect')?.value || 'WhatsApp Work Order';
  const dueDate = document.getElementById('waDueDateInput')?.value || new Date().toISOString().split('T')[0];

  SEMS_STATE.isSendingWA = true;
  if (btn) btn.disabled = true;
  if (btnIcon) btnIcon.className = 'fa-solid fa-spinner fa-spin';
  if (btnText) btnText.innerText = 'Connecting WhatsApp...';

  if (banner) {
    banner.style.display = 'block';
    banner.style.background = '#ecfdf5';
    banner.style.color = '#065f46';
    banner.style.border = '1px solid #a7f3d0';
    banner.innerHTML = `<i class="fa-solid fa-circle-check"></i> WhatsApp window opened for <strong>+${cleanPhone}</strong>. Logging alert in SEMS...`;
  }

  try {
    const res = await fetch('/api/notifications/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        technician_name: techName,
        phone: cleanPhone,
        machine_id: machineId,
        message: messageText,
        priority: priority,
        notification_type: waType,
        due_date: dueDate
      })
    });

    const data = await res.json();
    if (res.ok && data.status === 'success') {
      const notifRes = await fetch('/api/notifications');
      if (notifRes.ok) {
        SEMS_STATE.notifications = await notifRes.json();
        renderNotifications();
      }
      showToast(`✓ WhatsApp message dispatched to ${techName} (+${cleanPhone})!`);
      setTimeout(() => {
        closeModal('sendWhatsAppModal');
      }, 1500);
    }
  } catch (err) {
    console.warn("Backend notification log note:", err);
  } finally {
    SEMS_STATE.isSendingWA = false;
    if (btn) btn.disabled = false;
    if (btnIcon) btnIcon.className = 'fa-brands fa-whatsapp';
    if (btnText) btnText.innerText = 'Send via WhatsApp';
  }
}

function setNotifFilter(filter) {
  SEMS_STATE.currentNotifFilter = filter;
  document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(filter === 'unread' ? 'notifFilterUnread' : filter === 'read' ? 'notifFilterRead' : 'notifFilterAll');
  if (btn) btn.classList.add('active');
  renderNotifications();
}

function renderNotifications() {
  const feed = document.getElementById('notificationFeed');
  if (!feed) return;

  const filter = SEMS_STATE.currentNotifFilter || 'all';
  let alerts = SEMS_STATE.notifications;

  // Update unread count badge
  const unreadCount = alerts.filter(n => n.status === 'Unread').length;
  const badge = document.getElementById('unreadNotifBadge');
  if (badge) badge.innerText = unreadCount;

  // Apply filter
  if (filter === 'unread') {
    alerts = alerts.filter(n => n.status === 'Unread');
  } else if (filter === 'read') {
    alerts = alerts.filter(n => n.status === 'Read');
  }

  if (alerts.length === 0) {
    feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 3rem;">
      <i class="fa-solid fa-bell-slash" style="font-size: 2rem; display: block; margin-bottom: 0.5rem; opacity: 0.5;"></i>
      No ${filter !== 'all' ? filter : ''} notifications found.
    </div>`;
    return;
  }

  const isAdmin = SEMS_STATE.currentUser?.role_type === 'Admin' || (SEMS_STATE.currentUser?.role && SEMS_STATE.currentUser.role.toLowerCase().includes('admin'));
  const canEditNotif = isAdmin || hasPermission('edit_notifications');
  const canWA = isAdmin || hasPermission('whatsapp');

  feed.innerHTML = alerts.map(n => {
    const isUnread = n.status === 'Unread';
    const isCritical = n.priority === 'Critical' || (n.notification_type && n.notification_type.includes('Alert'));
    const isWhatsApp = n.status === 'Sent via WhatsApp' || (n.notification_type && n.notification_type.toLowerCase().includes('whatsapp'));

    return `
      <div class="notification-item ${n.priority.toLowerCase()} ${isUnread ? 'unread' : 'read'}">
        <div class="notification-content">
          <div class="notification-icon" style="background: ${isWhatsApp ? '#dcfce7' : isCritical ? '#fee2e2' : '#fef3c7'}; color: ${isWhatsApp ? '#15803d' : isCritical ? '#dc2626' : '#d97706'};">
            <i class="${isWhatsApp ? 'fa-brands fa-whatsapp' : isCritical ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-bell'}"></i>
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
              <span style="font-weight: 800; font-size: 0.95rem; color: var(--primary-dark);">
                ${n.notification_type || 'Alert'}: ${n.machine_id}
              </span>
              ${isUnread ? `<span class="priority-tag priority-critical" style="font-size: 0.7rem; padding: 0.15rem 0.4rem;">NEW</span>` : ''}
              ${isWhatsApp ? `<span class="whatsapp-badge" style="font-size: 0.68rem; padding: 0.1rem 0.4rem;"><i class="fa-brands fa-whatsapp"></i> WhatsApp Logged</span>` : ''}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.25rem;">${n.message}</p>
            <div style="display: flex; gap: 1rem; font-size: 0.75rem; color: var(--text-light); margin-top: 0.5rem; flex-wrap: wrap;">
              <span><i class="fa-solid fa-calendar"></i> Due: ${n.due_date}</span>
              <span><i class="fa-solid fa-flag"></i> Priority: ${n.priority}</span>
              <span><i class="fa-solid fa-circle-check"></i> Status: ${n.status}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 0.4rem; align-self: center; flex-wrap: wrap;">
          <button class="btn btn-secondary btn-sm btn-notif-action" onclick="viewNotificationDetails(${n.notification_id})" title="View Details">
            <i class="fa-solid fa-circle-info"></i> Details
          </button>
          ${isUnread ? `
            <button class="btn btn-outline btn-sm btn-notif-action btn-notif-read" onclick="markNotificationRead(${n.notification_id})" title="Mark as Read">
              <i class="fa-solid fa-check"></i> Read
            </button>
          ` : `
            <button class="btn btn-secondary btn-sm btn-notif-action btn-notif-unread" onclick="markNotificationUnread(${n.notification_id})" title="Mark as Unread">
              <i class="fa-solid fa-envelope"></i> Unread
            </button>
          `}
          ${canEditNotif ? `
            <button class="btn btn-secondary btn-sm btn-notif-action btn-notif-edit" onclick="openEditNotificationModal(${n.notification_id})" title="Edit Notification Alert">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn btn-danger btn-sm btn-notif-action btn-notif-delete" onclick="deleteNotification(${n.notification_id})" title="Delete Notification Alert">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
          ${canWA ? `
            <button class="btn btn-whatsapp btn-sm btn-notif-action" onclick="openWhatsAppModalForAlert('${n.machine_id}', '${n.message.replace(/'/g, "\\'")}', '${n.due_date}', '${n.priority}')" title="Dispatch WhatsApp Alert">
              <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function markNotificationRead(notifId) {
  try {
    const res = await fetch(`/api/notifications/${notifId}/read`, { method: 'PUT' });
    if (res.ok) {
      const notif = SEMS_STATE.notifications.find(n => n.notification_id == notifId);
      if (notif) notif.status = 'Read';
      renderNotifications();
      showToast(`Notification #${notifId} marked as read.`);
    }
  } catch (e) {
    showToast('Failed to update notification status.');
  }
}

async function markNotificationUnread(notifId) {
  try {
    const res = await fetch(`/api/notifications/${notifId}/unread`, { method: 'PUT' });
    if (res.ok) {
      const notif = SEMS_STATE.notifications.find(n => n.notification_id == notifId);
      if (notif) notif.status = 'Unread';
      renderNotifications();
      showToast(`Notification #${notifId} marked as unread.`);
    }
  } catch (e) {
    showToast('Failed to mark notification as unread.');
  }
}

function openEditNotificationModal(notifId) {
  const n = SEMS_STATE.notifications.find(item => item.notification_id == notifId);
  if (!n) return;

  document.getElementById('editNotifIdHidden').value = n.notification_id;
  document.getElementById('editNotifMachineId').value = n.machine_id || '';
  document.getElementById('editNotifMessage').value = n.message || '';
  document.getElementById('editNotifPriority').value = n.priority || 'Medium';
  document.getElementById('editNotifDueDate').value = n.due_date || '';
  document.getElementById('editNotifStatus').value = n.status || 'Unread';
  document.getElementById('editNotifType').value = n.notification_type || 'Alert';

  openModal('editNotificationModal');
}

async function submitEditNotification() {
  const notifId = document.getElementById('editNotifIdHidden').value;
  const payload = {
    machine_id: document.getElementById('editNotifMachineId').value.trim(),
    message: document.getElementById('editNotifMessage').value.trim(),
    priority: document.getElementById('editNotifPriority').value,
    due_date: document.getElementById('editNotifDueDate').value,
    status: document.getElementById('editNotifStatus').value,
    notification_type: document.getElementById('editNotifType').value.trim() || 'Alert'
  };

  if (!payload.machine_id || !payload.message) {
    alert('Machine ID and Message are required.');
    return;
  }

  try {
    const res = await fetch(`/api/notifications/${notifId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      const idx = SEMS_STATE.notifications.findIndex(n => n.notification_id == notifId);
      if (idx !== -1) {
        SEMS_STATE.notifications[idx] = { ...SEMS_STATE.notifications[idx], ...payload };
      }
      renderNotifications();
      closeModal('editNotificationModal');
      showToast(`Notification #${notifId} updated.`);
    } else {
      alert(data.message || 'Failed to update notification.');
    }
  } catch (e) {
    showToast('Error updating notification.');
  }
}

async function deleteNotification(notifId) {
  if (confirm(`Are you sure you want to delete notification #${notifId}?`)) {
    try {
      const res = await fetch(`/api/notifications/${notifId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        SEMS_STATE.notifications = SEMS_STATE.notifications.filter(n => n.notification_id != notifId);
        renderNotifications();
        showToast(`Notification #${notifId} deleted.`);
      } else {
        alert(data.message || 'Failed to delete notification.');
      }
    } catch (e) {
      showToast('Error deleting notification.');
    }
  }
}

async function markAllNotifications(status) {
  const targetStatus = status === 'read' ? 'Read' : 'Unread';
  try {
    const endpoint = status === 'read' ? 'read' : 'unread';
    const promises = SEMS_STATE.notifications.map(n => 
      fetch(`/api/notifications/${n.notification_id}/${endpoint}`, { method: 'PUT' })
    );
    await Promise.all(promises);
    SEMS_STATE.notifications.forEach(n => n.status = targetStatus);
    renderNotifications();
    showToast(`All notifications marked as ${targetStatus}.`);
  } catch (e) {
    showToast('Failed to update all notifications.');
  }
}

function viewNotificationDetails(notifId) {
  const n = SEMS_STATE.notifications.find(item => item.notification_id == notifId);
  if (!n) return;

  const body = document.getElementById('notificationDetailsBody');
  if (body) {
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">Notification ID</span>
          <span style="font-family: var(--font-mono); font-weight: 700;">#NOTIF-${n.notification_id}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">Target Machine</span>
          <span style="font-weight: 700; color: var(--primary-dark);">${n.machine_id}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">Priority Level</span>
          <span class="priority-tag priority-${n.priority.toLowerCase()}">${n.priority}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">Scheduled Date</span>
          <span style="font-family: var(--font-mono);">${n.due_date}</span>
        </div>
        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem;">Dispatch Status</span>
          <span style="font-weight: 700; color: ${n.status.includes('WhatsApp') ? '#10b981' : n.status === 'Unread' ? '#dc2626' : '#2563eb'};">${n.status}</span>
        </div>
        <div style="margin-top: 0.5rem;">
          <span style="color: var(--text-muted); font-size: 0.85rem; display: block; margin-bottom: 0.25rem;">Alert Message:</span>
          <div style="background: var(--bg-main); padding: 0.85rem; border-radius: var(--radius-md); font-size: 0.9rem; line-height: 1.5; border: 1px solid var(--border-subtle);">
            ${n.message}
          </div>
        </div>
      </div>
    `;
  }

  const waBtn = document.getElementById('notifDetailsWABtn');
  if (waBtn) {
    waBtn.onclick = () => {
      closeModal('notificationDetailsModal');
      openWhatsAppModalForAlert(n.machine_id, n.message, n.due_date, n.priority);
    };
  }

  openModal('notificationDetailsModal');
}

/* --------------------------------------------------------
   MODULE 7: REPORTS & EXPORT AUDITS (PDF / EXCEL)
   -------------------------------------------------------- */
function exportToPDF() {
  if (!window.jspdf) {
    alert("jsPDF library loading...");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFont("Helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text("SMART EQUIPMENT MAINTENANCE SYSTEM (SEMS)", 14, 20);

  doc.setFontSize(11);
  doc.setFont("Helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("Plant Asset Reliability & Maintenance Operations Audit", 14, 28);
  doc.text(`Generated Date: ${new Date().toLocaleDateString()} | Author: ${SEMS_STATE.currentUser ? SEMS_STATE.currentUser.name : 'Plant Admin'}`, 14, 34);

  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.5);
  doc.line(14, 38, 196, 38);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(30, 58, 138);
  doc.text("1. EXECUTIVE OPERATIONS KPIs", 14, 48);

  doc.setFont("Helvetica", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(`• Total Registered Machines: ${SEMS_STATE.kpiData.total_machines}`, 20, 56);
  doc.text(`• Active Operational Machines: ${SEMS_STATE.kpiData.active_machines}`, 20, 64);
  doc.text(`• Upcoming Maintenance Due: ${SEMS_STATE.kpiData.maintenance_due}`, 20, 72);
  doc.text(`• Overdue Critical Alerts: ${SEMS_STATE.kpiData.overdue_maintenance}`, 20, 80);
  doc.text(`• YTD Completed Services: ${SEMS_STATE.kpiData.completed_services}`, 20, 88);

  doc.setFont("Helvetica", "bold");
  doc.setTextColor(30, 58, 138);
  doc.text("2. MONITORED EQUIPMENT STATUS SAMPLES", 14, 102);

  let y = 112;
  SEMS_STATE.machines.slice(0, 12).forEach((m, idx) => {
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    doc.text(`${idx + 1}. [${m.machine_id}] ${m.machine_name} - ${m.status} (Health: ${m.health_score || 95}%)`, 20, y);
    y += 8;
  });

  doc.save("SEMS_Industrial_Maintenance_Audit.pdf");
  showToast("PDF Maintenance Audit Report generated & downloaded!");
}

function exportToExcel() {
  if (!window.XLSX) {
    alert("SheetJS library loading...");
    return;
  }
  const worksheetData = [
    ["Machine ID", "Machine Name", "Category", "Department", "Location", "Manufacturer", "Install Date", "Next Service Date", "Health Score", "Status"],
    ...SEMS_STATE.machines.map(m => [
      m.machine_id,
      m.machine_name,
      m.category,
      m.department,
      m.location,
      m.manufacturer || 'Siemens Industrial',
      m.install_date,
      m.next_service_date || '2026-09-25',
      `${m.health_score || 90}%`,
      m.status
    ])
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(worksheetData);
  XLSX.utils.book_append_sheet(wb, ws, "Machine Inventory");
  XLSX.writeFile(wb, "SEMS_Equipment_Inventory_Audit.xlsx");

  showToast("Excel spreadsheet exported successfully!");
}

/* --------------------------------------------------------
   UI HELPERS & BADGES
   -------------------------------------------------------- */
function getStatusBadge(status) {
  switch (status) {
    case 'Active':
      return `<span class="status-badge badge-active"><i class="fa-solid fa-circle-check"></i> Active</span>`;
    case 'Under Maintenance':
    case 'Pending':
      return `<span class="status-badge badge-due"><i class="fa-solid fa-wrench"></i> Under Service</span>`;
    case 'Breakdown':
    case 'Overdue':
      return `<span class="status-badge badge-overdue"><i class="fa-solid fa-triangle-exclamation"></i> Overdue / Breakdown</span>`;
    case 'Scheduled':
      return `<span class="status-badge badge-scheduled"><i class="fa-solid fa-clock"></i> Scheduled</span>`;
    case 'Completed':
      return `<span class="status-badge badge-active"><i class="fa-solid fa-circle-check"></i> Completed</span>`;
    default:
      return `<span class="status-badge badge-active">${status || 'Active'}</span>`;
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-info" style="color: #38bdf8;"></i> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* --------------------------------------------------------
   MODULE 8: HEALTH SCORE RISK ENGINE & WHAT-IF SIMULATOR
   -------------------------------------------------------- */
function openHealthScoreModal(machineId) {
  let machine = null;
  if (machineId) {
    machine = SEMS_STATE.machines.find(m => m.machine_id === machineId);
  }
  if (!machine) {
    machine = SEMS_STATE.machines.find(m => m.machine_id === 'MCH-CMP-005') || SEMS_STATE.machines[0] || {
      machine_id: 'MCH-CMP-005',
      machine_name: 'Rotary Air Compressor C4',
      age_years: 6.0,
      days_overdue: 15,
      maintenance_interval_days: 30,
      breakdowns_count: 3,
      daily_usage_hours: 12.0,
      maintenance_risk: 20.0,
      breakdown_risk: 18.0,
      age_risk: 12.0,
      usage_risk: 5.0,
      total_risk: 55.0,
      health_score: 45
    };
  }

  const age = machine.age_years !== undefined ? machine.age_years : 6.0;
  const overdue = machine.days_overdue !== undefined ? machine.days_overdue : 15;
  const interval = machine.maintenance_interval_days || 30;
  const breakdowns = machine.breakdowns_count !== undefined ? machine.breakdowns_count : 3;
  const usage = machine.daily_usage_hours !== undefined ? machine.daily_usage_hours : 12.0;

  const maintRisk = machine.maintenance_risk !== undefined ? machine.maintenance_risk : Math.min(40, Math.round(((overdue / interval) * 40) * 10) / 10);
  const breakdownRisk = machine.breakdown_risk !== undefined ? machine.breakdown_risk : Math.min(30, Math.round((breakdowns * 6) * 10) / 10);
  const ageRisk = machine.age_risk !== undefined ? machine.age_risk : Math.min(20, Math.round((age * 2) * 10) / 10);
  const usageRisk = machine.usage_risk !== undefined ? machine.usage_risk : Math.min(10, Math.round(((usage / 24) * 10) * 10) / 10);
  const totalRisk = machine.total_risk !== undefined ? machine.total_risk : Math.min(100, Math.round((maintRisk + breakdownRisk + ageRisk + usageRisk) * 10) / 10);
  const score = machine.health_score !== undefined ? machine.health_score : Math.max(0, Math.round(100 - totalRisk));

  // Update Modal Header & Summary
  const mid = document.getElementById('hsModalMachineId');
  const mname = document.getElementById('hsModalMachineName');
  const msub = document.getElementById('hsModalSubtitle');
  const mval = document.getElementById('hsModalScoreValue');
  const mbadge = document.getElementById('hsModalScoreBadge');

  if (mid) mid.innerText = machine.machine_id;
  if (mname) mname.innerText = machine.machine_name;
  if (msub) msub.innerText = `Age: ${age} years • Overdue: ${overdue} days • Breakdowns: ${breakdowns} • Usage: ${usage} hrs/day • Interval: ${interval} days`;
  if (mval) {
    mval.innerText = `${score}%`;
    mval.style.color = score < 70 ? '#ef4444' : score < 85 ? '#f59e0b' : '#10b981';
  }
  if (mbadge) {
    mbadge.innerText = `Total Risk: ${totalRisk}`;
    mbadge.className = `priority-tag ${score < 70 ? 'priority-critical' : score < 85 ? 'priority-medium' : 'priority-low'}`;
  }

  // Populate Formula Cards
  const mRiskEl = document.getElementById('hsModalMaintRisk');
  const mDetEl = document.getElementById('hsModalMaintDetails');
  if (mRiskEl) mRiskEl.innerText = maintRisk;
  if (mDetEl) mDetEl.innerText = `(${overdue} / ${interval}) × 40 = ${maintRisk}`;

  const bRiskEl = document.getElementById('hsModalBreakdownRisk');
  const bDetEl = document.getElementById('hsModalBreakdownDetails');
  if (bRiskEl) bRiskEl.innerText = breakdownRisk;
  if (bDetEl) bDetEl.innerText = `${breakdowns} × 6 = ${breakdownRisk}`;

  const aRiskEl = document.getElementById('hsModalAgeRisk');
  const aDetEl = document.getElementById('hsModalAgeDetails');
  if (aRiskEl) aRiskEl.innerText = ageRisk;
  if (aDetEl) aDetEl.innerText = `${age} × 2 = ${ageRisk}`;

  const uRiskEl = document.getElementById('hsModalUsageRisk');
  const uDetEl = document.getElementById('hsModalUsageDetails');
  if (uRiskEl) uRiskEl.innerText = usageRisk;
  if (uDetEl) uDetEl.innerText = `(${usage} / 24) × 10 = ${usageRisk}`;

  // Populate Live Simulator
  const simAge = document.getElementById('simAge');
  const simOverdue = document.getElementById('simOverdue');
  const simInterval = document.getElementById('simInterval');
  const simBreakdowns = document.getElementById('simBreakdowns');
  const simUsage = document.getElementById('simUsage');

  if (simAge) simAge.value = age;
  if (simOverdue) simOverdue.value = overdue;
  if (simInterval) simInterval.value = interval;
  if (simBreakdowns) simBreakdowns.value = breakdowns;
  if (simUsage) simUsage.value = usage;

  simulateHealthScore();
  openModal('healthScoreModal');
}

function simulateHealthScore() {
  const age = parseFloat(document.getElementById('simAge')?.value) || 0;
  const overdue = parseFloat(document.getElementById('simOverdue')?.value) || 0;
  const interval = Math.max(1, parseFloat(document.getElementById('simInterval')?.value) || 30);
  const breakdowns = parseFloat(document.getElementById('simBreakdowns')?.value) || 0;
  const usage = parseFloat(document.getElementById('simUsage')?.value) || 0;

  const maintRisk = Math.min(40, Math.round(((overdue / interval) * 40) * 10) / 10);
  const breakdownRisk = Math.min(30, Math.round((breakdowns * 6) * 10) / 10);
  const ageRisk = Math.min(20, Math.round((age * 2) * 10) / 10);
  const usageRisk = Math.min(10, Math.round(((usage / 24) * 10) * 10) / 10);

  const totalRisk = Math.min(100, Math.round((maintRisk + breakdownRisk + ageRisk + usageRisk) * 10) / 10);
  const score = Math.max(0, Math.round(100 - totalRisk));

  const scoreEl = document.getElementById('simResultScore');
  const breakEl = document.getElementById('simResultBreakdown');

  if (scoreEl) {
    scoreEl.innerText = `${score}%`;
    scoreEl.style.color = score < 70 ? '#ef4444' : score < 85 ? '#f59e0b' : '#10b981';
  }
  if (breakEl) {
    breakEl.innerText = `Total Risk: ${totalRisk} (Maint: ${maintRisk} + Breakdown: ${breakdownRisk} + Age: ${ageRisk} + Usage: ${usageRisk})`;
  }
}

function loadPromptExample() {
  const simAge = document.getElementById('simAge');
  const simOverdue = document.getElementById('simOverdue');
  const simInterval = document.getElementById('simInterval');
  const simBreakdowns = document.getElementById('simBreakdowns');
  const simUsage = document.getElementById('simUsage');

  if (simAge) simAge.value = 6;
  if (simOverdue) simOverdue.value = 15;
  if (simInterval) simInterval.value = 30;
  if (simBreakdowns) simBreakdowns.value = 3;
  if (simUsage) simUsage.value = 12;

  simulateHealthScore();
  showToast('Loaded Reference: Age 6y, Overdue 15d, Breakdowns 3, Usage 12h/d → Health Score = 45%');
}

/* --------------------------------------------------------
   MODULE 10: TECHNICIAN SELF-REGISTRATION MODAL
   -------------------------------------------------------- */
async function handleRegisterTechnician() {
  const name = document.getElementById('regTechName')?.value.trim();
  const email = document.getElementById('regTechEmail')?.value.trim();
  const password = document.getElementById('regTechPassword')?.value.trim();
  const phone = document.getElementById('regTechPhone')?.value.trim();
  const dept = document.getElementById('regTechDept')?.value.trim() || 'Mechanical Systems';
  const role = document.getElementById('regTechRole')?.value.trim() || 'Senior Reliability Engineer (Technician)';

  const alertBanner = document.getElementById('registerAlertBanner');
  const alertMsg = document.getElementById('registerAlertMessage');

  if (!name || !email || !password || !phone) {
    if (alertBanner) {
      alertBanner.style.display = 'flex';
      if (alertMsg) alertMsg.innerText = 'Full Name, Work Email, Password, and WhatsApp Number are required.';
    }
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone, department: dept, role })
    });
    const data = await res.json();
    if (res.ok && data.status === 'success') {
      closeModal('registerTechnicianModal');
      showToast(`Welcome ${name}! Technician account registered and synchronized into Roster.`);
      if (data.user) {
        SEMS_STATE.currentUser = data.user;
        updateUserUI(data.user);
        const loginOverlay = document.getElementById('loginModalOverlay');
        if (loginOverlay) loginOverlay.style.display = 'none';
        await loadInitialData();
      }
    } else {
      if (alertBanner) {
        alertBanner.style.display = 'flex';
        if (alertMsg) alertMsg.innerText = data.message || 'Registration failed.';
      }
    }
  } catch (err) {
    if (alertBanner) {
      alertBanner.style.display = 'flex';
      if (alertMsg) alertMsg.innerText = 'Server communication error during registration.';
    }
  }
}
