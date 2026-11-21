// QualiTrack Pro - Product Quality & Defect Tracking Client App
const API_BASE = '/api';

// Application State
const state = {
  currentTab: 'tab-dashboard',
  selectedDefectId: null,
  defects: [],
  products: [],
  batches: [],
  checkpoints: [],
  metrics: null,
  pareto: null,
  filter: {
    search: '',
    status: 'ALL',
    severity: 'ALL',
    product_id: 'ALL'
  },
  charts: {
    pareto: null,
    severity: null
  }
};

// Lifecycle Stages Definition
const LIFECYCLE_STAGES = [
  { key: 'NEW', label: 'Logged', step: 1 },
  { key: 'TRIAGED', label: 'Triaged', step: 2 },
  { key: 'UNDER_INVESTIGATION', label: 'Investigating', step: 3 },
  { key: 'RCA_COMPLETED', label: '5-Whys RCA', step: 4 },
  { key: 'CAPA_PENDING', label: 'CAPA Plan', step: 5 },
  { key: 'RESOLVED', label: 'Resolved', step: 6 },
  { key: 'VERIFIED_CLOSED', label: 'Verified Closed', step: 7 }
];

// Helper: Show Toast notification
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600 text-white' :
             type === 'error' ? 'bg-rose-600 text-white' :
             type === 'warning' ? 'bg-amber-600 text-white' : 'bg-slate-900 text-white';

  toast.className = `toast px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 ${bg}`;
  toast.innerHTML = `
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Fetch helper
async function fetchAPI(endpoint, options = {}) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Network error' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

// Badge helpers
function getSeverityBadge(sev) {
  switch (sev) {
    case 'CRITICAL':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 border border-rose-200">CRITICAL</span>`;
    case 'MAJOR':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">MAJOR</span>`;
    case 'MINOR':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">MINOR</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">${sev}</span>`;
  }
}

function getStatusBadge(status) {
  switch (status) {
    case 'NEW':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">New</span>`;
    case 'TRIAGED':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Triaged</span>`;
    case 'UNDER_INVESTIGATION':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-50 text-yellow-800 border border-yellow-200">Investigating</span>`;
    case 'RCA_COMPLETED':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">RCA Done</span>`;
    case 'CAPA_PENDING':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">CAPA Active</span>`;
    case 'RESOLVED':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">Resolved</span>`;
    case 'VERIFIED_CLOSED':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Closed</span>`;
    case 'REOPENED':
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">Reopened</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">${status}</span>`;
  }
}

function getPriorityBadge(pri) {
  switch (pri) {
    case 'P1_URGENT':
      return `<span class="text-rose-600 font-bold">P1 - Urgent</span>`;
    case 'P2_HIGH':
      return `<span class="text-amber-600 font-semibold">P2 - High</span>`;
    case 'P3_MEDIUM':
      return `<span class="text-slate-600 font-medium">P3 - Medium</span>`;
    default:
      return `<span class="text-slate-400">P4 - Low</span>`;
  }
}

// ---------------------------------------------------------------------
// Initialization & Global Data Load
// ---------------------------------------------------------------------
async function init() {
  setupNavigation();
  setupModals();
  setupFilters();

  await Promise.all([
    loadProducts(),
    loadBatches(),
    loadCheckpoints(),
    loadMetrics(),
    loadDefects()
  ]);

  renderDashboardPriority();
  initParetoChart();
  initSeverityChart();

  // If defects exist, select the first one for the workspace
  if (state.defects.length > 0) {
    selectDefectForWorkspace(state.defects[0].id);
  }
}

// Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active', 'border-blue-600', 'text-blue-600');
        t.classList.add('border-transparent', 'text-slate-500');
      });
      tab.classList.add('active', 'border-blue-600', 'text-blue-600');
      tab.classList.remove('border-transparent', 'text-slate-500');

      const targetTabId = tab.dataset.tab;
      document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
      const activeSection = document.getElementById(targetTabId);
      if (activeSection) activeSection.classList.remove('hidden');

      state.currentTab = targetTabId;

      if (targetTabId === 'tab-dashboard') {
        loadMetrics();
      } else if (targetTabId === 'tab-defects') {
        loadDefects();
      } else if (targetTabId === 'tab-batches') {
        renderBatchesTab();
      } else if (targetTabId === 'tab-products') {
        renderProductsTab();
      }
    });
  });

  // Reset Demo Seed button
  document.getElementById('btn-seed-data').addEventListener('click', async () => {
    if (confirm('Reset database to realistic manufacturing demo records?')) {
      await fetchAPI('/seed', { method: 'POST' });
      showToast('Database re-seeded successfully', 'success');
      await Promise.all([loadProducts(), loadBatches(), loadCheckpoints(), loadMetrics(), loadDefects()]);
      if (state.defects.length > 0) {
        selectDefectForWorkspace(state.defects[0].id);
      }
    }
  });

  // Table vs Kanban switch
  const btnTable = document.getElementById('btn-view-table');
  const btnKanban = document.getElementById('btn-view-kanban');
  const viewTable = document.getElementById('defects-view-table');
  const viewKanban = document.getElementById('defects-view-kanban');

  btnTable.addEventListener('click', () => {
    btnTable.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
    btnTable.classList.remove('text-slate-600');
    btnKanban.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
    btnKanban.classList.add('text-slate-600');
    viewTable.classList.remove('hidden');
    viewKanban.classList.add('hidden');
  });

  btnKanban.addEventListener('click', () => {
    btnKanban.classList.add('bg-white', 'text-slate-800', 'shadow-xs');
    btnKanban.classList.remove('text-slate-600');
    btnTable.classList.remove('bg-white', 'text-slate-800', 'shadow-xs');
    btnTable.classList.add('text-slate-600');
    viewTable.classList.add('hidden');
    viewKanban.classList.remove('hidden');
    renderKanbanBoard();
  });
}

// ---------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------
async function loadMetrics() {
  try {
    const data = await fetchAPI('/metrics/overview');
    state.metrics = data;

    document.getElementById('metric-fpy').textContent = `${data.fpy}%`;
    document.getElementById('metric-dpmo').textContent = data.dpmo.toLocaleString();
    document.getElementById('metric-density').textContent = data.defectDensity;
    document.getElementById('metric-open').textContent = data.openDefects;
    document.getElementById('metric-total').textContent = `of ${data.totalDefects} total`;
    document.getElementById('metric-critical').textContent = data.criticalDefects;
    document.getElementById('metric-mttr').textContent = data.avgMttrHours;
    document.getElementById('badge-total-defects').textContent = data.totalDefects;

    // Load Pareto data
    const pareto = await fetchAPI('/metrics/pareto');
    state.pareto = pareto;
    updateParetoChart(pareto.items);

    // Load Distributions
    const dist = await fetchAPI('/metrics/distributions');
    updateSeverityChart(dist.severity);
    renderStatusPills(dist.status);
  } catch (err) {
    console.error('Failed to load metrics:', err);
  }
}

async function loadProducts() {
  const products = await fetchAPI('/products');
  state.products = products;

  // Populate product filter
  const filterProd = document.getElementById('filter-product');
  filterProd.innerHTML = '<option value="ALL">All Products</option>' +
    products.map(p => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');

  // Populate defect modal product select
  const selectDefectProd = document.getElementById('select-defect-product');
  selectDefectProd.innerHTML = products.map(p => `<option value="${p.id}">${p.name} [${p.sku}]</option>`).join('');

  // Populate batch modal product select
  const selectBatchProd = document.getElementById('select-batch-product');
  if (selectBatchProd) {
    selectBatchProd.innerHTML = products.map(p => `<option value="${p.id}">${p.name} [${p.sku}]</option>`).join('');
  }
}

async function loadBatches() {
  const batches = await fetchAPI('/batches');
  state.batches = batches;

  const selectDefectBatch = document.getElementById('select-defect-batch');
  selectDefectBatch.innerHTML = batches.map(b => `<option value="${b.id}">${b.batch_number} - ${b.product_name} (${b.units_produced} pcs)</option>`).join('');
}

async function loadCheckpoints() {
  const checkpoints = await fetchAPI('/checkpoints');
  state.checkpoints = checkpoints;

  const selectDefectChk = document.getElementById('select-defect-checkpoint');
  selectDefectChk.innerHTML = '<option value="">-- None / General Line Inspection --</option>' +
    checkpoints.map(c => `<option value="${c.id}">[${c.stage}] ${c.name}</option>`).join('');
}

async function loadDefects() {
  const params = new URLSearchParams();
  if (state.filter.status !== 'ALL') params.set('status', state.filter.status);
  if (state.filter.severity !== 'ALL') params.set('severity', state.filter.severity);
  if (state.filter.product_id !== 'ALL') params.set('product_id', state.filter.product_id);
  if (state.filter.search) params.set('search', state.filter.search);

  const defects = await fetchAPI(`/defects?${params.toString()}`);
  state.defects = defects;

  renderDefectsTable(defects);
  renderDefectWorkspaceSelector(defects);
  renderDashboardPriority();
  if (!document.getElementById('defects-view-kanban').classList.contains('hidden')) {
    renderKanbanBoard();
  }
}

// ---------------------------------------------------------------------
// Chart.js Visualizations
// ---------------------------------------------------------------------
function initParetoChart() {
  const ctx = document.getElementById('paretoChart').getContext('2d');
  state.charts.pareto = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Defect Count',
          data: [],
          backgroundColor: '#3b82f6',
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          label: 'Cumulative %',
          data: [],
          type: 'line',
          borderColor: '#ef4444',
          borderWidth: 2,
          pointBackgroundColor: '#ef4444',
          pointRadius: 4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.dataset.type === 'line') {
                return `Cumulative: ${context.parsed.y}%`;
              }
              return `Count: ${context.parsed.y} defects`;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Defect Count', font: { size: 11 } },
          ticks: { stepSize: 1 }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Cumulative %', font: { size: 11 } },
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function updateParetoChart(items) {
  if (!state.charts.pareto) return;
  state.charts.pareto.data.labels = items.map(i => i.type.replace(/_/g, ' '));
  state.charts.pareto.data.datasets[0].data = items.map(i => i.count);
  state.charts.pareto.data.datasets[1].data = items.map(i => i.cumulative_pct);
  state.charts.pareto.update();
}

function initSeverityChart() {
  const ctx = document.getElementById('severityChart').getContext('2d');
  state.charts.severity = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Critical', 'Major', 'Minor'],
      datasets: [{
        data: [0, 0, 0],
        backgroundColor: ['#ef4444', '#f59e0b', '#94a3b8'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
      },
      cutout: '68%'
    }
  });
}

function updateSeverityChart(severityList) {
  if (!state.charts.severity) return;
  const critical = severityList.find(s => s.severity === 'CRITICAL')?.count || 0;
  const major = severityList.find(s => s.severity === 'MAJOR')?.count || 0;
  const minor = severityList.find(s => s.severity === 'MINOR')?.count || 0;
  state.charts.severity.data.datasets[0].data = [critical, major, minor];
  state.charts.severity.update();
}

function renderStatusPills(statusList) {
  const container = document.getElementById('status-distribution-pills');
  container.innerHTML = statusList.map(s => `
    <div class="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-100">
      <span class="text-slate-600 font-medium">${s.status.replace(/_/g, ' ')}</span>
      <span class="font-bold text-slate-900">${s.count}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------
// Defect Table & Kanban Renderers
// ---------------------------------------------------------------------
function renderDefectsTable(defects) {
  const tbody = document.getElementById('defects-tbody');
  if (defects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="px-5 py-8 text-center text-slate-400">No defects match your active filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = defects.map(d => `
    <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="selectDefectForWorkspace('${d.id}', true)">
      <td class="px-5 py-3 font-mono text-xs font-bold text-blue-600">${d.id}</td>
      <td class="px-5 py-3">
        <div class="font-medium text-slate-900">${escapeHtml(d.title)}</div>
        <div class="text-xs text-slate-400 truncate max-w-xs">${escapeHtml(d.description)}</div>
      </td>
      <td class="px-5 py-3 text-xs">
        <span class="font-semibold text-slate-800">${escapeHtml(d.product_name)}</span>
        <span class="block text-slate-400">${escapeHtml(d.batch_number)}</span>
      </td>
      <td class="px-5 py-3 text-xs font-medium text-slate-600">${d.defect_type.replace(/_/g, ' ')}</td>
      <td class="px-5 py-3">${getSeverityBadge(d.severity)}</td>
      <td class="px-5 py-3 text-xs">${getPriorityBadge(d.priority)}</td>
      <td class="px-5 py-3">${getStatusBadge(d.status)}</td>
      <td class="px-5 py-3 text-xs">
        <span class="inline-flex items-center gap-1 ${d.has_rca ? 'text-purple-600 font-bold' : 'text-slate-300'}">
          ● RCA
        </span>
        <span class="inline-flex items-center gap-1 ml-2 ${d.capa_count > 0 ? 'text-emerald-600 font-bold' : 'text-slate-300'}">
          ● CAPA (${d.capa_count})
        </span>
      </td>
      <td class="px-5 py-3 text-right">
        <button class="px-2.5 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition" onclick="event.stopPropagation(); selectDefectForWorkspace('${d.id}', true)">
          Manage &rarr;
        </button>
      </td>
    </tr>
  `).join('');
}

function renderDashboardPriority() {
  const tbody = document.getElementById('dashboard-priority-tbody');
  // High priority or open critical defects
  const priorityList = state.defects.filter(d => d.status !== 'VERIFIED_CLOSED').slice(0, 5);

  if (priorityList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-6 text-center text-emerald-600 font-semibold">Zero high-priority defects outstanding! All cleared or verified.</td></tr>`;
    return;
  }

  tbody.innerHTML = priorityList.map(d => `
    <tr class="hover:bg-slate-50 transition cursor-pointer" onclick="selectDefectForWorkspace('${d.id}', true)">
      <td class="px-5 py-3 font-mono text-xs font-bold text-blue-600">${d.id}</td>
      <td class="px-5 py-3 font-medium text-slate-900">${escapeHtml(d.title)}</td>
      <td class="px-5 py-3 text-xs text-slate-600">${escapeHtml(d.product_sku)} | ${escapeHtml(d.batch_number)}</td>
      <td class="px-5 py-3">${getSeverityBadge(d.severity)}</td>
      <td class="px-5 py-3">${getStatusBadge(d.status)}</td>
      <td class="px-5 py-3 text-xs text-slate-600">${escapeHtml(d.assigned_to || 'Unassigned')}</td>
      <td class="px-5 py-3 text-right">
        <button class="px-2.5 py-1 text-xs font-semibold rounded bg-slate-900 text-white hover:bg-slate-800 transition">Inspect</button>
      </td>
    </tr>
  `).join('');
}

function renderKanbanBoard() {
  const container = document.getElementById('kanban-columns-container');
  const columns = [
    { key: 'NEW', title: 'New Defect', color: 'bg-blue-500' },
    { key: 'TRIAGED', title: 'Triaged', color: 'bg-indigo-500' },
    { key: 'UNDER_INVESTIGATION', title: 'Under Investigation', color: 'bg-amber-500' },
    { key: 'RCA_COMPLETED', title: 'RCA Completed', color: 'bg-purple-500' },
    { key: 'CAPA_PENDING', title: 'CAPA Active', color: 'bg-orange-500' },
    { key: 'RESOLVED', title: 'Resolved', color: 'bg-teal-500' },
    { key: 'VERIFIED_CLOSED', title: 'Verified Closed', color: 'bg-emerald-500' }
  ];

  container.innerHTML = columns.map(col => {
    const colDefects = state.defects.filter(d => d.status === col.key);
    return `
      <div class="kanban-col bg-slate-100 rounded-xl p-3 flex flex-col flex-1 border border-slate-200 min-h-[500px]">
        <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full ${col.color}"></span>
            <span class="text-xs font-bold text-slate-800 uppercase tracking-wide">${col.title}</span>
          </div>
          <span class="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white text-slate-600 shadow-2xs">${colDefects.length}</span>
        </div>
        <div class="space-y-2 flex-1 overflow-y-auto">
          ${colDefects.map(d => `
            <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs hover:shadow-xs transition cursor-pointer" onclick="selectDefectForWorkspace('${d.id}', true)">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-mono font-bold text-blue-600">${d.id}</span>
                ${getSeverityBadge(d.severity)}
              </div>
              <h4 class="text-xs font-bold text-slate-800 line-clamp-2">${escapeHtml(d.title)}</h4>
              <p class="text-[11px] text-slate-400 mt-1">${escapeHtml(d.product_sku)} • ${escapeHtml(d.batch_number)}</p>
              <div class="mt-2 pt-2 border-t border-slate-50 flex items-center justify-between text-[11px]">
                <span class="text-slate-500">${escapeHtml(d.assigned_to ? d.assigned_to.split(' ')[0] : 'Unassigned')}</span>
                <span class="font-semibold text-slate-700">${getPriorityBadge(d.priority)}</span>
              </div>
            </div>
          `).join('')}
          ${colDefects.length === 0 ? `<div class="p-4 text-center text-xs text-slate-400 italic">No defects in stage</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ---------------------------------------------------------------------
// Defect Detail & Lifecycle Workspace
// ---------------------------------------------------------------------
function renderDefectWorkspaceSelector(defects) {
  const select = document.getElementById('workspace-defect-select');
  select.innerHTML = defects.map(d => `
    <option value="${d.id}" ${d.id === state.selectedDefectId ? 'selected' : ''}>
      ${d.id}: ${escapeHtml(d.title)} [${d.status}]
    </option>
  `).join('');

  select.addEventListener('change', e => {
    selectDefectForWorkspace(e.target.value);
  });
}

async function selectDefectForWorkspace(defectId, navigateToTab = false) {
  state.selectedDefectId = defectId;
  const select = document.getElementById('workspace-defect-select');
  if (select) select.value = defectId;

  if (navigateToTab) {
    document.getElementById('nav-tab-workspace').click();
  }

  try {
    const data = await fetchAPI(`/defects/${defectId}`);
    renderWorkspace(data);
  } catch (err) {
    console.error('Failed to load defect detail:', err);
  }
}

function renderWorkspace({ defect, rca, capas, auditLogs, comments }) {
  // Title and header
  document.getElementById('detail-id-tag').textContent = defect.id;
  document.getElementById('detail-title').textContent = defect.title;
  document.getElementById('detail-product-info').textContent = `${defect.product_name} (${defect.product_sku}) | Batch: ${defect.batch_number}`;
  document.getElementById('detail-severity-badge').innerHTML = getSeverityBadge(defect.severity);
  document.getElementById('detail-priority-text').innerHTML = getPriorityBadge(defect.priority);
  document.getElementById('detail-checkpoint').textContent = defect.checkpoint_name ? `[${defect.checkpoint_stage}] ${defect.checkpoint_name}` : 'Ad-hoc Field Discovery';
  document.getElementById('detail-reporter').textContent = `${defect.discovered_by} (${new Date(defect.discovered_at).toLocaleDateString()})`;
  document.getElementById('detail-description').textContent = defect.description;
  document.getElementById('detail-containment').textContent = defect.containment_action || 'None recorded yet.';

  // Resolution summary box
  const resBox = document.getElementById('detail-resolution-box');
  if (defect.resolution_notes) {
    resBox.classList.remove('hidden');
    document.getElementById('detail-resolution-text').textContent = defect.resolution_notes;
  } else {
    resBox.classList.add('hidden');
  }

  // Lifecycle Stepper
  renderLifecycleStepper(defect.status);

  // Dynamic Lifecycle Actions
  renderLifecycleActionButtons(defect);

  // Populate 5-Whys RCA
  if (rca) {
    document.getElementById('rca-category').value = rca.fishbone_category || 'MACHINE';
    document.getElementById('rca-why-1').value = rca.why_1 || '';
    document.getElementById('rca-why-2').value = rca.why_2 || '';
    document.getElementById('rca-why-3').value = rca.why_3 || '';
    document.getElementById('rca-why-4').value = rca.why_4 || '';
    document.getElementById('rca-why-5').value = rca.why_5 || '';
    document.getElementById('rca-conclusion').value = rca.root_cause_conclusion || '';
  } else {
    document.getElementById('rca-category').value = 'MACHINE';
    document.getElementById('rca-why-1').value = '';
    document.getElementById('rca-why-2').value = '';
    document.getElementById('rca-why-3').value = '';
    document.getElementById('rca-why-4').value = '';
    document.getElementById('rca-why-5').value = '';
    document.getElementById('rca-conclusion').value = '';
  }

  // Populate CAPA list
  renderCapaList(capas);

  // Populate Audit Logs
  renderAuditLogs(auditLogs);

  // Populate Comments
  renderComments(comments);
}

function renderLifecycleStepper(currentStatus) {
  const container = document.getElementById('lifecycle-stepper-container');
  const badge = document.getElementById('workspace-current-status-badge');
  badge.innerHTML = getStatusBadge(currentStatus);

  const currentIndex = LIFECYCLE_STAGES.findIndex(s => s.key === currentStatus);
  const isReopened = currentStatus === 'REOPENED';

  container.innerHTML = LIFECYCLE_STAGES.map((s, idx) => {
    let stateClass = '';
    if (idx < currentIndex) stateClass = 'completed';
    else if (idx === currentIndex) stateClass = 'active';

    return `
      <div class="stepper-item ${stateClass}">
        <div class="stepper-circle">${idx < currentIndex ? '✓' : s.step}</div>
        <span class="text-xs font-semibold mt-2 text-slate-700">${s.label}</span>
      </div>
    `;
  }).join('');
}

function renderLifecycleActionButtons(defect) {
  const container = document.getElementById('workspace-lifecycle-actions');
  const current = defect.status;
  let buttonsHtml = '';

  if (current === 'NEW') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs" onclick="transitionStatus('${defect.id}', 'TRIAGED', 'Accepted into triage queue')">Accept & Triage</button>`;
  } else if (current === 'TRIAGED') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs" onclick="transitionStatus('${defect.id}', 'UNDER_INVESTIGATION', 'Initiating root cause teardown')">Begin Investigation</button>`;
  } else if (current === 'UNDER_INVESTIGATION') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs" onclick="document.getElementById('btn-save-rca').click()">Complete & Sign RCA</button>`;
  } else if (current === 'RCA_COMPLETED') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs" onclick="document.getElementById('btn-open-add-capa').click()">Initiate CAPA</button>`;
  } else if (current === 'CAPA_PENDING') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs" onclick="promptResolutionNotes('${defect.id}')">Mark Resolved</button>`;
  } else if (current === 'RESOLVED') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs" onclick="transitionStatus('${defect.id}', 'VERIFIED_CLOSED', 'Effectiveness verified via QA re-inspection')">Verify & Close</button>`;
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold shadow-xs ml-1" onclick="transitionStatus('${defect.id}', 'REOPENED', 'Verification test failed; recurrence identified')">Reopen</button>`;
  } else if (current === 'VERIFIED_CLOSED') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold shadow-xs" onclick="transitionStatus('${defect.id}', 'REOPENED', 'Audit audit check triggered reopening')">Reopen Case</button>`;
  } else if (current === 'REOPENED') {
    buttonsHtml += `<button class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs" onclick="transitionStatus('${defect.id}', 'UNDER_INVESTIGATION', 'Restarting secondary investigation')">Re-investigate</button>`;
  }

  container.innerHTML = buttonsHtml;
}

// 5-Whys Save Event
document.getElementById('btn-save-rca').addEventListener('click', async () => {
  if (!state.selectedDefectId) return;

  const payload = {
    fishbone_category: document.getElementById('rca-category').value,
    why_1: document.getElementById('rca-why-1').value,
    why_2: document.getElementById('rca-why-2').value,
    why_3: document.getElementById('rca-why-3').value,
    why_4: document.getElementById('rca-why-4').value,
    why_5: document.getElementById('rca-why-5').value,
    root_cause_conclusion: document.getElementById('rca-conclusion').value,
    analyzed_by: 'QA Engineering Specialist'
  };

  try {
    await fetchAPI(`/defects/${state.selectedDefectId}/rca`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Root Cause Analysis updated and saved!', 'success');
    await loadDefects();
    selectDefectForWorkspace(state.selectedDefectId);
  } catch (err) {
    showToast('Failed to save RCA: ' + err.message, 'error');
  }
});

// Lifecycle Status Transition
async function transitionStatus(defectId, newStatus, reason = '') {
  try {
    await fetchAPI(`/defects/${defectId}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: newStatus,
        performed_by: 'QA Lead Marcus',
        reason
      })
    });
    showToast(`Defect transitioned to ${newStatus.replace(/_/g, ' ')}`, 'success');
    await loadMetrics();
    await loadDefects();
    selectDefectForWorkspace(defectId);
  } catch (err) {
    showToast('Status change failed: ' + err.message, 'error');
  }
}

function promptResolutionNotes(defectId) {
  const notes = prompt('Enter resolution summary and corrective actions completed:');
  if (notes) {
    fetchAPI(`/defects/${defectId}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'RESOLVED',
        performed_by: 'QA Lead Marcus',
        resolution_notes: notes,
        reason: 'Containment and corrective repair validated'
      })
    }).then(() => {
      showToast('Defect marked as RESOLVED', 'success');
      loadMetrics();
      loadDefects();
      selectDefectForWorkspace(defectId);
    });
  }
}

// ---------------------------------------------------------------------
// CAPA Management
// ---------------------------------------------------------------------
function renderCapaList(capas) {
  const container = document.getElementById('capa-items-container');
  if (capas.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
        No formal CAPA actions assigned yet. Click "+ Add CAPA Action" to design preventive counter-measures.
      </div>
    `;
    return;
  }

  container.innerHTML = capas.map(c => `
    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div class="space-y-1 flex-1">
        <div class="flex items-center gap-2">
          <span class="font-bold px-2 py-0.5 rounded ${c.action_type === 'CORRECTIVE' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}">
            ${c.action_type}
          </span>
          <span class="font-mono text-slate-400">${c.id}</span>
          <span class="text-slate-500">• Due: ${c.target_date}</span>
        </div>
        <p class="font-medium text-slate-800 text-sm mt-1">${escapeHtml(c.description)}</p>
        <p class="text-slate-500">Owner: <strong class="text-slate-700">${escapeHtml(c.owner)}</strong></p>
        ${c.verification_notes ? `<p class="text-emerald-700 italic bg-emerald-50/60 p-1.5 rounded">Verification: ${escapeHtml(c.verification_notes)}</p>` : ''}
      </div>

      <div class="flex items-center space-x-2 shrink-0">
        <select class="rounded-lg border border-slate-300 text-xs px-2.5 py-1.5 bg-white font-semibold" onchange="updateCapaStatus('${c.id}', this.value)">
          <option value="PLANNED" ${c.status === 'PLANNED' ? 'selected' : ''}>Planned</option>
          <option value="IN_PROGRESS" ${c.status === 'IN_PROGRESS' ? 'selected' : ''}>In Progress</option>
          <option value="IMPLEMENTED" ${c.status === 'IMPLEMENTED' ? 'selected' : ''}>Implemented</option>
          <option value="VERIFIED" ${c.status === 'VERIFIED' ? 'selected' : ''}>Verified</option>
        </select>
      </div>
    </div>
  `).join('');
}

async function updateCapaStatus(capaId, newStatus) {
  let notes = null;
  if (newStatus === 'VERIFIED') {
    notes = prompt('Enter CAPA effectiveness verification notes (e.g. 500-unit audit passed 100%):');
  }

  try {
    await fetchAPI(`/capa/${capaId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: newStatus,
        verification_notes: notes || undefined,
        performed_by: 'QA Auditor'
      })
    });
    showToast(`CAPA status updated to ${newStatus}`, 'success');
    loadMetrics();
    selectDefectForWorkspace(state.selectedDefectId);
  } catch (err) {
    showToast('Failed to update CAPA: ' + err.message, 'error');
  }
}

// ---------------------------------------------------------------------
// Audit Trail & Comments
// ---------------------------------------------------------------------
function renderAuditLogs(logs) {
  const container = document.getElementById('audit-trail-container');
  if (logs.length === 0) {
    container.innerHTML = `<p class="text-slate-400 italic">No audit records.</p>`;
    return;
  }

  container.innerHTML = logs.map(l => {
    let details = '';
    try {
      const d = JSON.parse(l.details_json);
      if (d.from && d.to) details = `${d.from} &rarr; ${d.to} (${d.reason || ''})`;
      else if (d.title) details = `${d.title} [${d.severity}]`;
      else if (d.conclusion) details = d.conclusion;
      else details = JSON.stringify(d);
    } catch {}

    return `
      <div class="relative pl-5 border-l-2 border-slate-200 py-1">
        <span class="absolute -left-[5px] top-2 w-2 h-2 rounded-full bg-blue-500"></span>
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-800">${l.action.replace(/_/g, ' ')}</span>
          <span class="text-[10px] text-slate-400">${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        </div>
        <p class="text-slate-500 mt-0.5">${escapeHtml(details)}</p>
        <span class="text-[10px] text-slate-400">By: ${escapeHtml(l.performed_by)}</span>
      </div>
    `;
  }).join('');
}

function renderComments(comments) {
  const container = document.getElementById('comments-container');
  if (comments.length === 0) {
    container.innerHTML = `<p class="text-slate-400 italic">No discussion notes yet.</p>`;
    return;
  }

  container.innerHTML = comments.map(c => `
    <div class="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
      <div class="flex items-center justify-between text-[11px] mb-1">
        <strong class="text-slate-700">${escapeHtml(c.author)}</strong>
        <span class="text-slate-400">${new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
      </div>
      <p class="text-slate-800">${escapeHtml(c.comment)}</p>
    </div>
  `).join('');
}

// Add comment event
document.getElementById('btn-submit-comment').addEventListener('click', async () => {
  const input = document.getElementById('comment-input');
  const comment = input.value.trim();
  if (!comment || !state.selectedDefectId) return;

  try {
    await fetchAPI(`/defects/${state.selectedDefectId}/comments`, {
      method: 'POST',
      body: JSON.stringify({
        author: 'QA Lead Marcus',
        comment
      })
    });
    input.value = '';
    selectDefectForWorkspace(state.selectedDefectId);
  } catch (err) {
    showToast('Failed to post note: ' + err.message, 'error');
  }
});

// ---------------------------------------------------------------------
// Batches & Inspection Gates Tab
// ---------------------------------------------------------------------
function renderBatchesTab() {
  const grid = document.getElementById('batches-grid');
  grid.innerHTML = state.batches.map(b => {
    const yieldRate = b.units_inspected > 0 ? ((b.units_passed / b.units_inspected) * 100).toFixed(1) : 100;
    const isPassing = yieldRate >= 98.0;

    return `
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between text-xs mb-2">
            <span class="font-mono font-bold text-blue-600">${b.batch_number}</span>
            <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : b.status === 'QUARANTINED' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}">
              ${b.status}
            </span>
          </div>
          <h4 class="font-bold text-slate-900 text-sm">${escapeHtml(b.product_name)}</h4>
          <p class="text-xs text-slate-400 mt-0.5">${escapeHtml(b.manufacturing_line)}</p>

          <div class="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs">
            <div class="flex justify-between">
              <span class="text-slate-500">Yield Rate:</span>
              <span class="font-bold ${isPassing ? 'text-emerald-600' : 'text-rose-600'}">${yieldRate}%</span>
            </div>
            <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div class="h-full ${isPassing ? 'bg-emerald-500' : 'bg-rose-500'}" style="width: ${yieldRate}%"></div>
            </div>
            <div class="flex justify-between text-[11px] text-slate-400 pt-1">
              <span>Produced: ${b.units_produced}</span>
              <span>Defects: ${b.defect_count}</span>
            </div>
          </div>
        </div>

        <button class="mt-4 w-full py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition" onclick="filterDefectsByBatch('${b.id}')">
          View Batch Defects &rarr;
        </button>
      </div>
    `;
  }).join('');

  // Checkpoints Table
  const tbody = document.getElementById('checkpoints-tbody');
  tbody.innerHTML = state.checkpoints.map(c => `
    <tr class="hover:bg-slate-50 text-xs">
      <td class="px-5 py-3 font-mono font-bold text-slate-700">${c.id}</td>
      <td class="px-5 py-3 font-semibold text-slate-900">${escapeHtml(c.name)}</td>
      <td class="px-5 py-3">
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${c.stage}</span>
      </td>
      <td class="px-5 py-3 text-slate-600">${escapeHtml(c.criteria)}</td>
      <td class="px-5 py-3">${getSeverityBadge(c.severity_default)}</td>
    </tr>
  `).join('');
}

function filterDefectsByBatch(batchId) {
  document.querySelector('[data-tab=tab-defects]').click();
  // Filter defect list
  state.defects = state.defects.filter(d => d.batch_id === batchId);
  renderDefectsTable(state.defects);
}

// ---------------------------------------------------------------------
// Products Tab
// ---------------------------------------------------------------------
function renderProductsTab() {
  const grid = document.getElementById('products-grid');
  grid.innerHTML = state.products.map(p => `
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between text-xs mb-1">
          <span class="font-mono font-bold text-slate-500">${p.sku}</span>
          <span class="px-2.5 py-0.5 rounded-full font-bold text-xs bg-blue-50 text-blue-700">${escapeHtml(p.category)}</span>
        </div>
        <h3 class="font-bold text-base text-slate-900 mt-1">${escapeHtml(p.name)}</h3>
        <p class="text-xs text-slate-500 mt-2">${escapeHtml(p.description)}</p>
      </div>

      <div class="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
        <div class="p-2 bg-slate-50 rounded-lg">
          <span class="text-slate-400 block text-[10px] uppercase">Target FPY</span>
          <strong class="text-emerald-600 text-sm font-bold">${p.target_fpy}%</strong>
        </div>
        <div class="p-2 bg-slate-50 rounded-lg">
          <span class="text-slate-400 block text-[10px] uppercase">Lots Produced</span>
          <strong class="text-slate-800 text-sm font-bold">${p.batch_count}</strong>
        </div>
        <div class="p-2 bg-slate-50 rounded-lg">
          <span class="text-slate-400 block text-[10px] uppercase">Defects Logged</span>
          <strong class="text-slate-800 text-sm font-bold">${p.defect_count}</strong>
        </div>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------
// Filters & Modals Setup
// ---------------------------------------------------------------------
function setupFilters() {
  const searchInput = document.getElementById('defect-search-input');
  const filterStatus = document.getElementById('filter-status');
  const filterSeverity = document.getElementById('filter-severity');
  const filterProduct = document.getElementById('filter-product');

  searchInput.addEventListener('input', debounce(e => {
    state.filter.search = e.target.value;
    loadDefects();
  }, 250));

  filterStatus.addEventListener('change', e => {
    state.filter.status = e.target.value;
    loadDefects();
  });

  filterSeverity.addEventListener('change', e => {
    state.filter.severity = e.target.value;
    loadDefects();
  });

  filterProduct.addEventListener('change', e => {
    state.filter.product_id = e.target.value;
    loadDefects();
  });
}

function setupModals() {
  // Modal triggers
  document.getElementById('btn-open-log-modal').addEventListener('click', () => {
    document.getElementById('modal-log-defect').classList.remove('hidden');
  });

  document.getElementById('btn-open-add-capa').addEventListener('click', () => {
    document.getElementById('modal-add-capa').classList.remove('hidden');
  });

  const btnOpenBatch = document.getElementById('btn-open-create-batch');
  if (btnOpenBatch) {
    btnOpenBatch.addEventListener('click', () => {
      document.getElementById('modal-create-batch').classList.remove('hidden');
    });
  }

  // Close modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      if (modalId) document.getElementById(modalId).classList.add('hidden');
    });
  });

  // Form: Log New Defect
  document.getElementById('form-log-defect').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('input-defect-title').value.trim(),
      product_id: document.getElementById('select-defect-product').value,
      batch_id: document.getElementById('select-defect-batch').value,
      defect_type: document.getElementById('select-defect-type').value,
      severity: document.getElementById('select-defect-severity').value,
      priority: document.getElementById('select-defect-priority').value,
      checkpoint_id: document.getElementById('select-defect-checkpoint').value || null,
      description: document.getElementById('input-defect-desc').value.trim(),
      containment_action: document.getElementById('input-defect-containment').value.trim() || null,
      discovered_by: document.getElementById('input-defect-discovered-by').value.trim(),
      assigned_to: document.getElementById('input-defect-assigned-to').value.trim() || null
    };

    try {
      const created = await fetchAPI('/defects', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      document.getElementById('modal-log-defect').classList.add('hidden');
      document.getElementById('form-log-defect').reset();
      showToast(`Defect ${created.id} logged successfully!`, 'success');

      await loadMetrics();
      await loadDefects();
      selectDefectForWorkspace(created.id, true);
    } catch (err) {
      showToast('Failed to log defect: ' + err.message, 'error');
    }
  });

  // Form: Add CAPA Action
  document.getElementById('form-add-capa').addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.selectedDefectId) return;

    const payload = {
      action_type: document.getElementById('input-capa-type').value,
      description: document.getElementById('input-capa-desc').value.trim(),
      owner: document.getElementById('input-capa-owner').value.trim(),
      target_date: document.getElementById('input-capa-date').value
    };

    try {
      await fetchAPI(`/defects/${state.selectedDefectId}/capa`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      document.getElementById('modal-add-capa').classList.add('hidden');
      document.getElementById('form-add-capa').reset();
      showToast('CAPA action created successfully!', 'success');

      await loadMetrics();
      selectDefectForWorkspace(state.selectedDefectId);
    } catch (err) {
      showToast('Failed to create CAPA: ' + err.message, 'error');
    }
  });

  // Form: Create Production Batch
  const formBatch = document.getElementById('form-create-batch');
  if (formBatch) {
    formBatch.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        batch_number: document.getElementById('input-batch-number').value.trim(),
        product_id: document.getElementById('select-batch-product').value,
        units_produced: parseInt(document.getElementById('input-batch-units').value, 10),
        manufacturing_line: document.getElementById('input-batch-line').value.trim()
      };

      try {
        await fetchAPI('/batches', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        document.getElementById('modal-create-batch').classList.add('hidden');
        formBatch.reset();
        showToast('Production batch registered!', 'success');
        await loadBatches();
        renderBatchesTab();
      } catch (err) {
        showToast('Failed to create batch: ' + err.message, 'error');
      }
    });
  }
}

// Utility: debounce
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Utility: escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Start application
window.addEventListener('DOMContentLoaded', init);
