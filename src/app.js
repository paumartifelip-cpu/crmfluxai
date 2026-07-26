import { DB, DEAL_STAGES } from './database.js';
import { parseTextToLead, getSavedAiApiKey, getSavedAiModel, saveAiApiKey } from './aiParser.js';

let activeFounderFilter = 'ALL';
let activeServiceFilter = 'ALL';
let activeMobileStage = 'ALL';
let showOnlyFollowUps = false;
let currentSearchQuery = '';

export function initApp() {
  setupEventListeners();

  // Subscribe to DB changes
  DB.subscribe((leads) => {
    renderApp(leads);
  });

  // Subscribe to Sync Status
  DB.subscribeSyncStatus((status) => {
    updateSyncStatusUI(status);
  });

  // Initial Render
  renderApp(DB.getLeads());

  // Populate config fields
  const inputSheets = document.getElementById('sheetsScriptUrl');
  if (inputSheets) inputSheets.value = DB.getEndpointUrl();

  updateAiKeyBadge();
}

function updateAiKeyBadge() {
  const key = getSavedAiApiKey();
  const model = getSavedAiModel();
  const badge = document.getElementById('aiKeyStatusBadge');
  const btnRemove = document.getElementById('btnRemoveAiKey');

  if (badge) {
    if (key && key.startsWith('sk-')) {
      badge.textContent = `✅ OpenAI Activa (${model})`;
    } else {
      badge.textContent = `🔑 Pegar Clave API OpenAI`;
    }
  }

  if (btnRemove) {
    if (key) btnRemove.classList.remove('hidden');
    else btnRemove.classList.add('hidden');
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
  // Mobile FAB
  const fab = document.getElementById('fabNewLead');
  if (fab) fab.addEventListener('click', () => openLeadModal());

  // SMART AI LEAD INGESTION FORM
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

  // AI Key Modal
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

  const btnRemoveAiKey = document.getElementById('btnRemoveAiKey');
  if (btnRemoveAiKey) {
    btnRemoveAiKey.addEventListener('click', () => {
      saveAiApiKey('');
      updateAiKeyBadge();
      document.getElementById('aiApiKeyInput').value = '';
      document.getElementById('aiKeyModal').classList.add('hidden');
      showToast('Clave API eliminada');
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

  // Value Preset Chips ($15k, $30k, $50k, $100k)
  const presetChips = document.querySelectorAll('.preset-chip');
  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const val = chip.getAttribute('data-val');
      const valInput = document.getElementById('dealValue');
      if (valInput) valInput.value = val;
    });
  });

  // Copy AI Pitch
  const btnCopyAi = document.getElementById('btnCopyAiIdea');
  if (btnCopyAi) {
    btnCopyAi.addEventListener('click', () => {
      const aiBox = document.getElementById('aiSuggestion');
      if (aiBox) {
        navigator.clipboard.writeText(aiBox.innerText);
        showToast('Propuesta copiada al portapapeles');
      }
    });
  }

  // Clear Search
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

  // Follow-up Filter
  const btnFollowUp = document.getElementById('btnFollowUpFilter');
  if (btnFollowUp) {
    btnFollowUp.addEventListener('click', () => {
      showOnlyFollowUps = !showOnlyFollowUps;
      btnFollowUp.classList.toggle('btn-primary', showOnlyFollowUps);
      btnFollowUp.classList.toggle('btn-secondary', !showOnlyFollowUps);
      renderApp(DB.getLeads());
    });
  }

  // Export CSV
  const btnExport = document.getElementById('btnExportCSV');
  if (btnExport) btnExport.addEventListener('click', () => {
    DB.exportCSV();
    showToast('Base de datos exportada a CSV');
  });

  // Clear Demo Leads
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

  // Mobile Stage Tabs
  const stageTabs = document.querySelectorAll('#mobileStageTabs .stage-tab-btn');
  stageTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      stageTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      activeMobileStage = e.target.getAttribute('data-stage');
      renderApp(DB.getLeads());
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
  const founderBtns = document.querySelectorAll('#founderFilter .segment-btn');
  founderBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      founderBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFounderFilter = e.target.getAttribute('data-founder');
      renderApp(DB.getLeads());
    });
  });

  // Service filter
  document.getElementById('serviceFilter').addEventListener('change', (e) => {
    activeServiceFilter = e.target.value;
    renderApp(DB.getLeads());
  });

  // Forms
  document.getElementById('leadForm').addEventListener('submit', handleLeadFormSubmit);
  document.getElementById('btnDeleteLead').addEventListener('click', handleLeadDelete);

  // Sheets Config Form
  document.getElementById('sheetsConfigForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('sheetsScriptUrl').value.trim();
    DB.setEndpointUrl(url);
    document.getElementById('sheetsConfigModal').classList.add('hidden');
    showToast('Configuración guardada y sincronizando...');
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
    if (l.assignedFounder === 'Pau Martí' || l.assignedFounder.includes('Ambos')) countPau++;
    if (l.assignedFounder === 'Miquel Canals' || l.assignedFounder.includes('Ambos')) countMikel++;
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
    // Founder filter
    if (activeFounderFilter !== 'ALL') {
      if (lead.assignedFounder !== activeFounderFilter && !lead.assignedFounder.includes('Ambos')) {
        return false;
      }
    }
    // Service filter
    if (activeServiceFilter !== 'ALL') {
      if (lead.serviceType !== activeServiceFilter) return false;
    }
    // Follow-up filter
    if (showOnlyFollowUps) {
      if (!lead.nextActionDate || lead.nextActionDate > todayStr || lead.dealStage === 'Ganado' || lead.dealStage === 'Perdido') {
        return false;
      }
    }
    // Search query filter
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

  const todayStr = new Date().toISOString().split('T')[0];
  let followUpTagHtml = '';
  if (lead.nextActionDate && lead.dealStage !== 'Ganado' && lead.dealStage !== 'Perdido') {
    if (lead.nextActionDate === todayStr) {
      followUpTagHtml = `<span class="tag tag-followup">📅 Hoy</span>`;
    } else if (lead.nextActionDate < todayStr) {
      followUpTagHtml = `<span class="tag tag-overdue">⚠️ Vencido</span>`;
    }
  }

  const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
  const waUrl = lead.contactPhone ? `https://wa.me/${lead.contactPhone}?text=${prefilledText}` : null;

  card.innerHTML = `
    <div class="card-company">
      <span>${escapeHtml(lead.companyName)}</span>
    </div>
    <div class="card-contact">👤 ${escapeHtml(lead.contactName || 'Sin contacto')}</div>
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
          <a href="${waUrl}" target="_blank" rel="noopener" class="card-action-btn" title="Enviar WhatsApp con mensaje preparado">
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
    const prefilledText = encodeURIComponent(`¡Hola ${lead.contactName || ''}! Te escribo de Flux.ai respecto a tu proyecto de automatización/IA para ${lead.companyName || ''}.`);
    const waUrl = lead.contactPhone ? `https://wa.me/${lead.contactPhone}?text=${prefilledText}` : null;

    tr.innerHTML = `
      <td><strong>${escapeHtml(lead.companyName)}</strong></td>
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

DEAL_STAGES.forEach(stage => {
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
        await DB.updateLead(leadId, { dealStage: stage });
        showToast(`Lead movido a "${stage}"`);
      }
    });
  }
});

function openLeadModal(lead = null) {
  const modal = document.getElementById('leadModal');
  const title = document.getElementById('modalTitle');
  const deleteBtn = document.getElementById('btnDeleteLead');

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

function generateAiIdea() {
  const company = document.getElementById('companyName').value || 'la empresa';
  const service = document.getElementById('serviceType').value;
  const notes = document.getElementById('leadNotes').value || '';
  const aiBox = document.getElementById('aiSuggestion');
  const btnCopy = document.getElementById('btnCopyAiIdea');

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
  if (btnCopy) btnCopy.classList.remove('hidden');
}

function formatCurrency(amount) {
  const val = Number(amount || 0);
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(val);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
