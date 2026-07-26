import { DB, DEAL_STAGES } from './database.js';
import { parseTextToLead, getSavedAiApiKey, getSavedAiModel, saveAiApiKey } from './aiParser.js';

let activeFounderFilter = 'ALL';
let activeServiceFilter = 'ALL';
let activeMobileStage = 'ALL';
let showOnlyFollowUps = false;
let currentSearchQuery = '';

export function initApp() {
  setupEventListeners();

  DB.subscribe((leads) => {
    renderApp(leads);
  });

  DB.subscribeSyncStatus((status) => {
    updateSyncStatusUI(status);
  });

  renderApp(DB.getLeads());

  const inputSheets = document.getElementById('sheetsScriptUrl');
  if (inputSheets) inputSheets.value = DB.getEndpointUrl();

  updateAiKeyBadge();
}

function updateAiKeyBadge() {
  const key = getSavedAiApiKey();
  const model = getSavedAiModel();
  const badge = document.getElementById('aiKeyStatusBadge');

  if (badge) {
    if (key && key.startsWith('sk-')) {
      badge.textContent = `✅ OpenAI Activa (${model})`;
    } else {
      badge.textContent = `🔑 Pegar Clave API OpenAI`;
    }
  }
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `<span>${isError ? '⚠️' : '⚡'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function updateSyncStatusUI(status) {
  const statusEl = document.getElementById('syncStatus');
  const statusText = document.getElementById('syncStatusText');

  if (!statusEl || !statusText) return;

  statusText.textContent = status.message || 'Google Sheets activo';
  if (status.state === 'offline') {
    statusEl.classList.add('demo-mode');
  } else {
    statusEl.classList.remove('demo-mode');
  }
}

function setupEventListeners() {
  const fab = document.getElementById('fabNewLead');
  if (fab) fab.addEventListener('click', () => openLeadModal());

  const aiIngestForm = document.getElementById('aiIngestForm');
  if (aiIngestForm) {
    aiIngestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inputEl = document.getElementById('aiIngestInput');
      const submitBtn = document.getElementById('btnSubmitAiIngest');
      const text = inputEl ? inputEl.value.trim() : '';

      if (!text) return;

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<span>Procesando IA...</span>';
        }

        const parsedLead = await parseTextToLead(text);
        await DB.addLead(parsedLead);

        showToast(`¡Lead creado con IA para "${parsedLead.companyName}"!`);
        if (inputEl) inputEl.value = '';
      } catch (err) {
        console.error('Error parsing AI lead:', err);
        showToast('Error procesando lead con IA: ' + err.message, true);
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>Crear Lead con IA</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>';
        }
      }
    });
  }

  const btnConfigAiKey = document.getElementById('btnConfigAiKey');
  if (btnConfigAiKey) {
    btnConfigAiKey.addEventListener('click', () => {
      const inputAi = document.getElementById('aiApiKeyInput');
      const selectModel = document.getElementById('aiModelSelect');
      if (inputAi) inputAi.value = getSavedAiApiKey();
      if (selectModel) selectModel.value = getSavedAiModel();
      updateAiKeyBadge();
      document.getElementById('aiKeyModal').classList.remove('hidden');
    });
  }

  const closeAiKeyModal = document.getElementById('closeAiKeyModal');
  if (closeAiKeyModal) {
    closeAiKeyModal.addEventListener('click', () => {
      document.getElementById('aiKeyModal').classList.add('hidden');
    });
  }

  const aiKeyForm = document.getElementById('aiKeyForm');
  if (aiKeyForm) {
    aiKeyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = document.getElementById('aiApiKeyInput').value.trim();
      const model = document.getElementById('aiModelSelect').value;
      saveAiApiKey(val, model);
      updateAiKeyBadge();
      document.getElementById('aiKeyModal').classList.add('hidden');
      showToast(`Clave API de OpenAI guardada (${model})`);
    });
  }

  const btnClearSearch = document.getElementById('btnClearSearch');
  const searchInput = document.getElementById('searchInput');
  if (searchInput && btnClearSearch) {
    searchInput.addEventListener('input', (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      if (currentSearchQuery) btnClearSearch.classList.remove('hidden');
      else btnClearSearch.classList.add('hidden');
      renderApp(DB.getLeads());
    });

    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchQuery = '';
      btnClearSearch.classList.add('hidden');
      renderApp(DB.getLeads());
    });
  }

  const btnFollowUp = document.getElementById('btnFollowUpFilter');
  if (btnFollowUp) {
    btnFollowUp.addEventListener('click', () => {
      showOnlyFollowUps = !showOnlyFollowUps;
      btnFollowUp.classList.toggle('btn-primary', showOnlyFollowUps);
      btnFollowUp.classList.toggle('btn-secondary', !showOnlyFollowUps);
      renderApp(DB.getLeads());
    });
  }

  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) btnExport.addEventListener('click', () => {
    DB.exportCSV();
    showToast('Base de datos exportada a CSV');
  });

  const btnClearDemo = document.getElementById('btnClearDemoLeads');
  if (btnClearDemo) {
    btnClearDemo.addEventListener('click', () => {
      if (confirm('¿Quieres eliminar los leads de prueba e iniciar con la base vacía?')) {
        DB.clearDemoLeads();
        document.getElementById('sheetsConfigModal').classList.add('hidden');
        showToast('Leads de prueba eliminados');
      }
    });
  }

  const stageTabs = document.querySelectorAll('#mobileStageTabs .stage-tab-btn');
  stageTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const btn = e.target.closest('.stage-tab-btn');
      if (!btn) return;
      stageTabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      activeMobileStage = btn.getAttribute('data-stage') || 'ALL';
      renderApp(DB.getLeads());
    });
  });

  document.getElementById('btnNewLead').addEventListener('click', () => openLeadModal());
  document.getElementById('closeLeadModal').addEventListener('click', closeLeadModal);
  document.getElementById('cancelLeadModal').addEventListener('click', closeLeadModal);

  document.getElementById('btnConfigSheets').addEventListener('click', () => {
    document.getElementById('sheetsConfigModal').classList.remove('hidden');
  });
  document.getElementById('closeSheetsModal').addEventListener('click', () => {
    document.getElementById('sheetsConfigModal').classList.add('hidden');
  });

  document.getElementById('viewKanbanBtn').addEventListener('click', () => setView('kanban'));
  document.getElementById('viewTableBtn').addEventListener('click', () => setView('table'));

  const founderBtns = document.querySelectorAll('#founderFilter .segment-btn');
  founderBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetBtn = e.target.closest('.segment-btn');
      if (!targetBtn) return;
      founderBtns.forEach(b => b.classList.remove('active'));
      targetBtn.classList.add('active');
      activeFounderFilter = targetBtn.getAttribute('data-founder') || 'ALL';
      renderApp(DB.getLeads());
    });
  });

  document.getElementById('serviceFilter').addEventListener('change', (e) => {
    activeServiceFilter = e.target.value;
    renderApp(DB.getLeads());
  });

  document.getElementById('leadForm').addEventListener('submit', handleLeadFormSubmit);
  document.getElementById('btnDeleteLead').addEventListener('click', handleLeadDelete);

  document.getElementById('sheetsConfigForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('sheetsScriptUrl').value.trim();
    DB.setEndpointUrl(url);
    document.getElementById('sheetsConfigModal').classList.add('hidden');
    showToast('Configuración guardada y sincronizando...');
  });
}

function setView(viewType) {
  const kanban = document.getElementById('kanbanView');
  const table = document.getElementById('tableView');
  const kBtn = document.getElementById('viewKanbanBtn');
  const tBtn = document.getElementById('viewTableBtn');

  if (viewType === 'kanban') {
    kanban.classList.remove('hidden');
    table.classList.add('hidden');
    kBtn.classList.add('active');
    tBtn.classList.remove('active');
  } else {
    kanban.classList.add('hidden');
    table.classList.remove('hidden');
    kBtn.classList.remove('active');
    tBtn.classList.add('active');
  }
}

function renderApp(allLeads) {
  updateFounderBadges(allLeads);
  updateFollowUpBadge(allLeads);

  const filteredLeads = filterLeads(allLeads);
  renderKPIs(filteredLeads);
  renderKanban(filteredLeads);
  renderTable(filteredLeads);
}

function updateFounderBadges(allLeads) {
  let countAll = allLeads.length;
  let countPau = 0;
  let countMikel = 0;

  allLeads.forEach(l => {
    const founder = l.assignedFounder || '';
    if (founder === 'Pau Martí' || founder.includes('Ambos')) countPau++;
    if (founder === 'Miquel Canals' || founder.includes('Mikel') || founder.includes('Ambos')) countMikel++;
  });

  const cAll = document.getElementById('countAllFounder');
  const cPau = document.getElementById('countPau');
  const cMikel = document.getElementById('countMikel');

  if (cAll) cAll.textContent = countAll;
  if (cPau) cPau.textContent = countPau;
  if (cMikel) cMikel.textContent = countMikel;
}

function updateFollowUpBadge(allLeads) {
  const todayStr = new Date().toISOString().split('T')[0];
  let pendingCount = 0;

  allLeads.forEach(l => {
    if (l.nextActionDate && l.nextActionDate <= todayStr && l.dealStage !== 'Ganado' && l.dealStage !== 'Perdido') {
      pendingCount++;
    }
  });

  const badge = document.getElementById('badgeFollowUp');
  if (badge) badge.textContent = pendingCount;
}

function filterLeads(leads) {
  const todayStr = new Date().toISOString().split('T')[0];

  return leads.filter(lead => {
    if (activeFounderFilter && activeFounderFilter !== 'ALL') {
      const assigned = lead.assignedFounder || '';
      if (activeFounderFilter === 'Pau Martí') {
        if (assigned !== 'Pau Martí' && !assigned.includes('Ambos')) return false;
      } else if (activeFounderFilter === 'Miquel Canals') {
        if (assigned !== 'Miquel Canals' && !assigned.includes('Mikel') && !assigned.includes('Ambos')) return false;
      }
    }
    if (activeServiceFilter && activeServiceFilter !== 'ALL') {
      if (lead.serviceType !== activeServiceFilter) return false;
    }
    if (showOnlyFollowUps) {
      if (!lead.nextActionDate || lead.nextActionDate > todayStr || lead.dealStage === 'Ganado' || lead.dealStage === 'Perdido') {
        return false;
      }
    }
    if (currentSearchQuery) {
      const matchCompany = (lead.companyName || '').toLowerCase().includes(currentSearchQuery);
      const matchContact = (lead.contactName || '').toLowerCase().includes(currentSearchQuery);
      const matchNotes = (lead.leadNotes || '').toLowerCase().includes(currentSearchQuery);
      const matchId = (lead.id || '').toLowerCase().includes(currentSearchQuery);
      if (!matchCompany && !matchContact && !matchNotes && !matchId) return false;
    }
    return true;
  });
}

function renderKPIs(leads) {
  let pipelineVal = 0;
  let activeCount = 0;
  let wonCount = 0;
  let wonTotalVal = 0;

  leads.forEach(l => {
    const val = Number(l.dealValue || 0);
    if (l.dealStage === 'Ganado') {
      wonCount++;
      wonTotalVal += val;
    } else if (l.dealStage !== 'Perdido') {
      pipelineVal += val;
      activeCount++;
    }
  });

  const avgTicket = (activeCount + wonCount) > 0 ? (pipelineVal + wonTotalVal) / (activeCount + wonCount) : 0;

  document.getElementById('kpiPipelineValue').textContent = formatCurrency(pipelineVal);
  document.getElementById('kpiActiveLeads').textContent = activeCount;
  document.getElementById('kpiWonLeads').textContent = `${wonCount} (${formatCurrency(wonTotalVal)})`;
  document.getElementById('kpiAvgTicket').textContent = formatCurrency(avgTicket);
}

function renderKanban(leads) {
  const board = document.getElementById('kanbanView');

  if (window.innerWidth <= 768 && activeMobileStage !== 'ALL') {
    board.classList.add('mobile-single-view');
  } else {
    board.classList.remove('mobile-single-view');
  }

  DEAL_STAGES.forEach(stage => {
    const col = document.querySelector(`.kanban-column[data-stage="${stage}"]`);
    const cardContainer = document.getElementById(`cards-${stage}`);
    const countEl = document.getElementById(`count-${stage}`);
    
    if (cardContainer) cardContainer.innerHTML = '';
    if (countEl) countEl.textContent = '0';

    if (col) {
      if (activeMobileStage === 'ALL' || activeMobileStage === stage) {
        col.classList.add('mobile-active-stage');
      } else {
        col.classList.remove('mobile-active-stage');
      }
    }
  });

  const stageCounts = {};
  DEAL_STAGES.forEach(s => stageCounts[s] = 0);

  leads.forEach(lead => {
    const stage = lead.dealStage || 'Nuevo Lead';
    const cardContainer = document.getElementById(`cards-${stage}`);
    
    if (cardContainer) {
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      const cardEl = createKanbanCardEl(lead);
      cardContainer.appendChild(cardEl);
    }
  });

  DEAL_STAGES.forEach(stage => {
    const countEl = document.getElementById(`count-${stage}`);
    if (countEl) countEl.textContent = stageCounts[stage] || 0;
  });
}

function createKanbanCardEl(lead) {
  const card = document.createElement('div');
  card.className = 'lead-card';
  card.setAttribute('draggable', 'true');

  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', lead.id);
  });

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-action-btn') || e.target.closest('.quick-stage-select')) return;
    openLeadModal(lead);
  });

  // CLEAN FOLLOW-UP TAG LOGIC: Only show date if explicitly defined
  const todayStr = new Date().toISOString().split('T')[0];
  let followUpTagHtml = '';
  if (lead.nextActionDate && lead.dealStage !== 'Ganado' && lead.dealStage !== 'Perdido') {
    if (lead.nextActionDate === todayStr) {
      followUpTagHtml = `<span class="tag tag-followup">📅 Hoy</span>`;
    } else {
      followUpTagHtml = `<span class="tag">📅 ${escapeHtml(lead.nextActionDate)}</span>`;
    }
  }

  const monogram = getCompanyInitials(lead.companyName);
  const avatarBg = getCompanyColor(lead.companyName);

  const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
  const waUrl = lead.contactPhone ? `https://wa.me/${lead.contactPhone}?text=${prefilledText}` : null;

  card.innerHTML = `
    <div class="card-top-bar">
      <span class="lead-id-badge">${escapeHtml(lead.id)}</span>
    </div>
    
    <div class="company-avatar-row">
      <div class="company-avatar" style="background:${avatarBg}">${monogram}</div>
      <div class="card-company">${escapeHtml(lead.companyName)}</div>
    </div>

    ${lead.contactName ? `<div class="card-contact">👤 ${escapeHtml(lead.contactName)}</div>` : ''}
    
    <div class="card-tags">
      <span class="tag tag-founder">👤 ${escapeHtml(lead.assignedFounder || 'Pau')}</span>
      <span class="tag tag-service">⚡ ${escapeHtml(lead.serviceType || 'IA')}</span>
      ${followUpTagHtml}
    </div>
    
    <div class="card-footer">
      <span class="card-value mono-font">${formatCurrency(lead.dealValue)}</span>
      <div class="card-actions">
        <select class="quick-stage-select" title="Mover etapa rápidamente">
          ${DEAL_STAGES.map(s => `<option value="${s}" ${s === lead.dealStage ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${waUrl ? `
          <a href="${waUrl}" target="_blank" rel="noopener" class="card-action-btn" title="Enviar WhatsApp preparado">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </a>
        ` : ''}
      </div>
    </div>
  `;

  const stageSelect = card.querySelector('.quick-stage-select');
  if (stageSelect) {
    stageSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      const newStage = e.target.value;
      await DB.updateLead(lead.id, { dealStage: newStage });
      showToast(`Etapa actualizada a "${newStage}"`);
    });
  }

  return card;
}

function renderTable(leads) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  leads.forEach(lead => {
    const tr = document.createElement('tr');
    const monogram = getCompanyInitials(lead.companyName);
    const avatarBg = getCompanyColor(lead.companyName);
    const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
    const waUrl = lead.contactPhone ? `https://wa.me/${lead.contactPhone}?text=${prefilledText}` : null;

    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <span class="lead-id-badge">${escapeHtml(lead.id)}</span>
          <div class="company-avatar" style="background:${avatarBg}; width:24px; height:24px; font-size:0.65rem;">${monogram}</div>
          <strong>${escapeHtml(lead.companyName)}</strong>
        </div>
      </td>
      <td>${escapeHtml(lead.contactName || '-')}</td>
      <td><span class="tag tag-founder">${escapeHtml(lead.assignedFounder || 'Pau')}</span></td>
      <td><span class="tag tag-service">${escapeHtml(lead.serviceType || 'IA')}</span></td>
      <td><span class="tag">${escapeHtml(lead.dealStage)}</span></td>
      <td><strong class="mono-font">${formatCurrency(lead.dealValue)}</strong></td>
      <td class="mono-font">${lead.nextActionDate ? escapeHtml(lead.nextActionDate) : '-'}</td>
      <td>
        <button class="btn btn-sm btn-secondary btn-edit-lead">Editar</button>
        ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-sm btn-tertiary">WhatsApp</a>` : ''}
      </td>
    `;

    tr.querySelector('.btn-edit-lead').addEventListener('click', () => openLeadModal(lead));
    tbody.appendChild(tr);
  });
}

function openLeadModal(lead = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('btnDeleteLead');

  if (lead) {
    title.textContent = `[${lead.id}] ${lead.companyName}`;
    document.getElementById('leadId').value = lead.id;
    document.getElementById('companyName').value = lead.companyName || '';
    document.getElementById('contactName').value = lead.contactName || '';
    document.getElementById('contactPhone').value = lead.contactPhone || '';
    document.getElementById('contactEmail').value = lead.contactEmail || '';
    document.getElementById('assignedFounder').value = lead.assignedFounder || 'Pau Martí';
    document.getElementById('serviceType').value = lead.serviceType || 'Automatización Make/n8n';
    document.getElementById('dealStage').value = lead.dealStage || 'Nuevo Lead';
    document.getElementById('dealValue').value = lead.dealValue || 0;
    document.getElementById('nextActionDate').value = lead.nextActionDate || '';
    document.getElementById('leadNotes').value = lead.leadNotes || '';
    deleteBtn.classList.remove('hidden');
  } else {
    title.textContent = 'Nuevo Prospecto para Flux.ai';
    document.getElementById('leadForm').reset();
    document.getElementById('leadId').value = '';
    deleteBtn.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  document.getElementById('companyName').focus();
}

function closeLeadModal() {
  document.getElementById('leadModal').classList.add('hidden');
}

async function handleLeadFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('leadId').value;
  const leadData = {
    companyName: document.getElementById('companyName').value.trim(),
    contactName: document.getElementById('contactName').value.trim(),
    contactPhone: document.getElementById('contactPhone').value.trim(),
    contactEmail: document.getElementById('contactEmail').value.trim(),
    assignedFounder: document.getElementById('assignedFounder').value,
    serviceType: document.getElementById('serviceType').value,
    dealStage: document.getElementById('dealStage').value,
    dealValue: Number(document.getElementById('dealValue').value || 0),
    nextActionDate: document.getElementById('nextActionDate').value,
    leadNotes: document.getElementById('leadNotes').value.trim()
  };

  if (id) {
    await DB.updateLead(id, leadData);
    showToast('Lead actualizado con éxito');
  } else {
    await DB.addLead(leadData);
    showToast('¡Nuevo lead registrado!');
  }

  closeLeadModal();
}

async function handleLeadDelete() {
  const id = document.getElementById('leadId').value;
  if (id && confirm('¿Estás seguro de eliminar este prospecto?')) {
    await DB.deleteLead(id);
    showToast('Lead eliminado');
    closeLeadModal();
  }
}

function getCompanyInitials(nameStr) {
  if (!nameStr) return 'FX';
  const parts = nameStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nameStr.substring(0, 2).toUpperCase();
}

const PALETTE = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#0891b2', '#e11d48', '#4f46e5'];
function getCompanyColor(nameStr) {
  if (!nameStr) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < nameStr.length; i++) {
    hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
}

function formatCurrency(amount) {
  const val = Number(amount || 0);
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
