import { 
  initSheets, 
  getSavedSheetsUrl, 
  saveSheetsUrl, 
  resetSheetsUrl, 
  fetchLeads, 
  addLead, 
  updateLead, 
  deleteLead,
  exportLeadsToCSV 
} from './sheets.js';

let currentLeads = [];
let activeFounderFilter = 'ALL';
let activeServiceFilter = 'ALL';
let activeMobileStage = 'ALL';
let currentSearchQuery = '';

const STAGES = ['Nuevo Lead', 'Contactado', 'Reunión / Demo', 'Propuesta Enviada', 'Ganado', 'Perdido'];

export async function initApp() {
  initSheets();
  setupEventListeners();
  await loadAndRenderLeads();
  
  const savedUrl = getSavedSheetsUrl();
  const input = document.getElementById('sheetsScriptUrl');
  if (input) input.value = savedUrl;
}

function showToast(message, isError = false) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast-error' : ''}`;
  toast.innerHTML = `<span>${isError ? '⚠️' : '✅'}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

async function loadAndRenderLeads() {
  currentLeads = await fetchLeads();
  renderApp();
}

function setupEventListeners() {
  // Mobile FAB
  const fab = document.getElementById('fabNewLead');
  if (fab) fab.addEventListener('click', () => openLeadModal());

  // Export CSV
  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) btnExport.addEventListener('click', () => {
    exportLeadsToCSV(filterLeads(currentLeads));
    showToast('Leads exportados a CSV con éxito');
  });

  // Mobile Stage Tabs
  const stageTabs = document.querySelectorAll('#mobileStageTabs .stage-tab-btn');
  stageTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      stageTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeMobileStage = e.target.getAttribute('data-stage');
      renderApp();
    });
  });

  // Modals
  document.getElementById('btnNewLead').addEventListener('click', () => openLeadModal());
  document.getElementById('closeLeadModal').addEventListener('click', closeLeadModal);
  document.getElementById('cancelLeadModal').addEventListener('click', closeLeadModal);

  document.getElementById('btnConfigSheets').addEventListener('click', () => {
    document.getElementById('sheetsConfigModal').classList.remove('hidden');
  });
  document.getElementById('closeSheetsModal').addEventListener('click', () => {
    document.getElementById('sheetsConfigModal').classList.add('hidden');
  });

  // Views switch
  document.getElementById('viewKanbanBtn').addEventListener('click', () => setView('kanban'));
  document.getElementById('viewTableBtn').addEventListener('click', () => setView('table'));

  // Founder filter
  const founderBtns = document.querySelectorAll('#founderFilter .founder-btn');
  founderBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      founderBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFounderFilter = e.target.getAttribute('data-founder');
      renderApp();
    });
  });

  // Service filter
  document.getElementById('serviceFilter').addEventListener('change', (e) => {
    activeServiceFilter = e.target.value;
    renderApp();
  });

  // Search input
  document.getElementById('searchInput').addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.toLowerCase().trim();
    renderApp();
  });

  // Forms
  document.getElementById('leadForm').addEventListener('submit', handleLeadFormSubmit);
  document.getElementById('btnDeleteLead').addEventListener('click', handleLeadDelete);

  // Sheets Config Form
  document.getElementById('sheetsConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('sheetsScriptUrl').value.trim();
    saveSheetsUrl(url);
    document.getElementById('sheetsConfigModal').classList.add('hidden');
    showToast('Enlace de Google Sheets guardado');
    await loadAndRenderLeads();
  });

  document.getElementById('btnResetSheets').addEventListener('click', async () => {
    resetSheetsUrl();
    document.getElementById('sheetsConfigModal').classList.add('hidden');
    showToast('CRM cambiado a Modo Demo Local');
    await loadAndRenderLeads();
  });

  // AI Assistant
  document.getElementById('btnGenerateAiIdea').addEventListener('click', generateAiIdea);
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

function renderApp() {
  const filteredLeads = filterLeads(currentLeads);
  renderKPIs(filteredLeads);
  renderKanban(filteredLeads);
  renderTable(filteredLeads);
}

function filterLeads(leads) {
  return leads.filter(lead => {
    if (activeFounderFilter !== 'ALL') {
      if (lead.assignedFounder !== activeFounderFilter && lead.assignedFounder !== 'Ambos (Pau & Mikel)') {
        return false;
      }
    }
    if (activeServiceFilter !== 'ALL') {
      if (lead.serviceType !== activeServiceFilter) return false;
    }
    if (currentSearchQuery) {
      const matchCompany = (lead.companyName || '').toLowerCase().includes(currentSearchQuery);
      const matchContact = (lead.contactName || '').toLowerCase().includes(currentSearchQuery);
      const matchNotes = (lead.leadNotes || '').toLowerCase().includes(currentSearchQuery);
      if (!matchCompany && !matchContact && !matchNotes) return false;
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

  // Handle Mobile Single Stage View vs All Stages
  if (window.innerWidth <= 768 && activeMobileStage !== 'ALL') {
    board.classList.add('mobile-single-view');
  } else {
    board.classList.remove('mobile-single-view');
  }

  STAGES.forEach(stage => {
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
  STAGES.forEach(s => stageCounts[s] = 0);

  leads.forEach(lead => {
    const stage = lead.dealStage || 'Nuevo Lead';
    const cardContainer = document.getElementById(`cards-${stage}`);
    
    if (cardContainer) {
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      const cardEl = createKanbanCardEl(lead);
      cardContainer.appendChild(cardEl);
    }
  });

  STAGES.forEach(stage => {
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

  const cleanPhone = (lead.contactPhone || '').replace(/\D/g, '');
  const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${prefilledText}` : null;

  card.innerHTML = `
    <div class="card-company">
      <span>${escapeHtml(lead.companyName)}</span>
    </div>
    <div class="card-contact">👤 ${escapeHtml(lead.contactName || 'Sin contacto')}</div>
    <div class="card-tags">
      <span class="tag tag-founder">👤 ${escapeHtml(lead.assignedFounder || 'Pau')}</span>
      <span class="tag tag-service">⚡ ${escapeHtml(lead.serviceType || 'IA')}</span>
    </div>
    <div class="card-footer">
      <span class="card-value">${formatCurrency(lead.dealValue)}</span>
      <div class="card-actions">
        <select class="quick-stage-select" title="Mover etapa rápidamente">
          ${STAGES.map(s => `<option value="${s}" ${s === lead.dealStage ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${waUrl ? `
          <a href="${waUrl}" target="_blank" rel="noopener" class="card-action-btn" title="Enviar WhatsApp con mensaje preparado">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
          </a>
        ` : ''}
      </div>
    </div>
  `;

  // Quick stage selector change handler
  const stageSelect = card.querySelector('.quick-stage-select');
  if (stageSelect) {
    stageSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      const newStage = e.target.value;
      await updateLead(lead.id, { dealStage: newStage });
      showToast(`Etapa actualizada a "${newStage}"`);
      await loadAndRenderLeads();
    });
  }

  return card;
}

function renderTable(leads) {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  leads.forEach(lead => {
    const tr = document.createElement('tr');
    const cleanPhone = (lead.contactPhone || '').replace(/\D/g, '');
    const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${prefilledText}` : null;

    tr.innerHTML = `
      <td><strong>${escapeHtml(lead.companyName)}</strong></td>
      <td>${escapeHtml(lead.contactName || '-')}</td>
      <td><span class="tag tag-founder">${escapeHtml(lead.assignedFounder || 'Pau')}</span></td>
      <td><span class="tag tag-service">${escapeHtml(lead.serviceType || 'IA')}</span></td>
      <td><span class="tag">${escapeHtml(lead.dealStage)}</span></td>
      <td><strong>${formatCurrency(lead.dealValue)}</strong></td>
      <td>
        <button class="btn btn-sm btn-secondary btn-edit-lead">Editar</button>
        ${waUrl ? `<a href="${waUrl}" target="_blank" class="btn btn-sm btn-outline-purple">WhatsApp</a>` : ''}
      </td>
    `;

    tr.querySelector('.btn-edit-lead').addEventListener('click', () => openLeadModal(lead));
    tbody.appendChild(tr);
  });
}

STAGES.forEach(stage => {
  const col = document.querySelector(`.kanban-column[data-stage="${stage}"]`);
  if (col) {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      if (leadId) {
        await updateLead(leadId, { dealStage: stage });
        showToast(`Lead movido a "${stage}"`);
        await loadAndRenderLeads();
      }
    });
  }
});

function openLeadModal(lead = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('btnDeleteLead');
  const aiSuggestion = document.getElementById('aiSuggestion');
  
  aiSuggestion.classList.add('hidden');

  if (lead) {
    title.textContent = `Editar Lead: ${lead.companyName}`;
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
    await updateLead(id, leadData);
    showToast('Lead actualizado con éxito');
  } else {
    await addLead(leadData);
    showToast('¡Nuevo lead registrado!');
  }

  closeLeadModal();
  await loadAndRenderLeads();
}

async function handleLeadDelete() {
  const id = document.getElementById('leadId').value;
  if (id && confirm('¿Estás seguro de eliminar este prospecto?')) {
    await deleteLead(id);
    showToast('Lead eliminado');
    closeLeadModal();
    await loadAndRenderLeads();
  }
}

function generateAiIdea() {
  const company = document.getElementById('companyName').value || 'la empresa';
  const service = document.getElementById('serviceType').value;
  const notes = document.getElementById('leadNotes').value || '';
  const aiBox = document.getElementById('aiSuggestion');

  let ideaText = '';

  if (service.includes('Automatización')) {
    ideaText = `💡 **Propuesta de Automatización para ${company}**:\n- Integración de formularios web/WhatsApp a CRM mediante Make/n8n.\n- Notificación automática a ${document.getElementById('assignedFounder').value} al entrar un lead.\n- Generación e inserción automática de facturas e historial de cliente.`;
  } else if (service.includes('Chatbot')) {
    ideaText = `🤖 **Propuesta Chatbot IA para ${company}**:\n- Agente en WhatsApp con Claude/GPT-4o capacitado con el catálogo y FAQs de ${company}.\n- Calificación de clientes en tiempo real y agendamiento automático de citas en Google Calendar.`;
  } else if (service.includes('App IA')) {
    ideaText = `📱 **Propuesta App IA a Medida para ${company}**:\n- Portal web/móvil con módulo de procesamiento de documentos con IA (OCR + LLM).\n- Dashboard analítico con IA predictiva de ventas.`;
  } else {
    ideaText = `✨ **Propuesta Consultoría IA para ${company}**:\n- Auditoría de procesos repetitivos en la empresa.\n- Plan de implementación de herramientas de Inteligencia Artificial para reducir un 40% del tiempo operativo.`;
  }

  if (notes) {
    ideaText += `\n📌 *Ajuste según notas*: "${notes}"`;
  }

  aiBox.innerHTML = ideaText.replace(/\n/g, '<br>');
  aiBox.classList.remove('hidden');
}

function formatCurrency(amount) {
  const val = Number(amount || 0);
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
