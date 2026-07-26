/**
 * ============================================================================
 * FLUX.AI CRM — MASTER DATA ARCHITECTURE ENGINE (DATABASE LAYER)
 * ============================================================================
 * Architecture: Local-First / Optimistic UI / Event-Driven Sync Engine
 * Design: High Reliability, Zero Data Loss, Auto-Recovery & Conflict Resolution
 * Founders: Pau Martí & Miquel Canals (Flux.ai)
 * ============================================================================
 */

const STORAGE_KEYS = {
  LEADS: 'flux_crm_db_leads_v2',
  QUEUE: 'flux_crm_db_sync_queue_v2',
  ENDPOINT: 'flux_crm_sheets_endpoint_v2',
  SETTINGS: 'flux_crm_db_settings_v2'
};

const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbx3ebsEN7oCAGzGWhFcDlSAlvnxgEK9mVHXW-l89kh6F5o_i7ioSeGu9ux6CoNKqq0M/exec';

// Enums & Constants
export const DEAL_STAGES = [
  'Nuevo Lead',
  'Contactado',
  'Reunión / Demo',
  'Propuesta Enviada',
  'Ganado',
  'Perdido'
];

export const FOUNDERS = ['Pau Martí', 'Miquel Canals', 'Ambos (Pau & Miquel)'];

// Default Seed Leads if database is empty
const INITIAL_DEMO_LEADS = [
  {
    id: 'flux-lead-101',
    companyName: 'Grupo Hotelero Cancún',
    contactName: 'Carlos Mendoza',
    contactPhone: '5512345678',
    contactEmail: 'carlos@hotelcuba.com',
    assignedFounder: 'Pau Martí',
    serviceType: 'Chatbot Inteligente',
    dealStage: 'Reunión / Demo',
    dealValue: 65000,
    nextActionDate: new Date().toISOString().split('T')[0],
    leadNotes: 'Interesados en chatbot multilingüe para atención a huéspedes por WhatsApp.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncState: 'synced'
  },
  {
    id: 'flux-lead-102',
    companyName: 'Agencia Logística Monterrey',
    contactName: 'Sofía Garza',
    contactPhone: '8181239876',
    contactEmail: 'sofia@logisticamty.mx',
    assignedFounder: 'Miquel Canals',
    serviceType: 'Automatización Make/n8n',
    dealStage: 'Propuesta Enviada',
    dealValue: 45000,
    nextActionDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    leadNotes: 'Automatizar extracción de PDFs de facturas e ingreso a su ERP con IA.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    syncState: 'synced'
  }
];

class DatabaseEngine {
  constructor() {
    this.leads = [];
    this.syncQueue = [];
    this.endpointUrl = DEFAULT_ENDPOINT;
    this.isSyncing = false;
    this.listeners = new Set();
    this.syncStatusListeners = new Set();

    this.init();
  }

  init() {
    // Load Endpoint
    const savedEndpoint = localStorage.getItem(STORAGE_KEYS.ENDPOINT);
    if (savedEndpoint && savedEndpoint.startsWith('https://script.google.com/')) {
      this.endpointUrl = savedEndpoint;
    } else {
      this.endpointUrl = DEFAULT_ENDPOINT;
    }

    // Load Local Memory Cache
    this.leads = this.loadFromStorage(STORAGE_KEYS.LEADS, INITIAL_DEMO_LEADS);
    this.syncQueue = this.loadFromStorage(STORAGE_KEYS.QUEUE, []);

    // Listen to network status changes
    window.addEventListener('online', () => this.processSyncQueue());

    // Auto sync queue poll loop every 12 seconds
    setInterval(() => {
      if (navigator.onLine && this.syncQueue.length > 0) {
        this.processSyncQueue();
      }
    }, 12000);

    // Initial background pull
    if (navigator.onLine && this.endpointUrl) {
      this.pullFromRemote();
    }
  }

  // --- PUB/SUB EVENT SYSTEM ---
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  subscribeSyncStatus(callback) {
    this.syncStatusListeners.add(callback);
    return () => this.syncStatusListeners.delete(callback);
  }

  notify() {
    this.listeners.forEach(cb => cb(this.getLeads()));
  }

  notifySyncStatus(status) {
    this.syncStatusListeners.forEach(cb => cb(status));
  }

  // --- DATA ACCESS METHODS ---
  getLeads() {
    return [...this.leads];
  }

  getLeadById(id) {
    return this.leads.find(l => l.id === id) || null;
  }

  getEndpointUrl() {
    return this.endpointUrl;
  }

  setEndpointUrl(url) {
    const clean = url.trim() || DEFAULT_ENDPOINT;
    this.endpointUrl = clean;
    localStorage.setItem(STORAGE_KEYS.ENDPOINT, clean);
    this.pullFromRemote();
  }

  // --- MUTATION METHODS (OPTIMISTIC UI + TRANSACTION QUEUE) ---
  async addLead(leadData) {
    const sanitized = this.sanitizeLeadSchema({
      id: 'lead-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      ...leadData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncState: 'pending'
    });

    // 1. Optimistic Local Insert
    this.leads.unshift(sanitized);
    this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
    this.notify();

    // 2. Queue Sync Operation
    this.enqueueOperation({ type: 'ADD', payload: sanitized });
    this.processSyncQueue();
    return sanitized;
  }

  async updateLead(id, updatedFields) {
    const index = this.leads.findIndex(l => l.id === id);
    if (index === -1) return null;

    const current = this.leads[index];
    const updated = this.sanitizeLeadSchema({
      ...current,
      ...updatedFields,
      updatedAt: new Date().toISOString(),
      syncState: 'pending'
    });

    // 1. Optimistic Local Update
    this.leads[index] = updated;
    this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
    this.notify();

    // 2. Queue Sync Operation
    this.enqueueOperation({ type: 'UPDATE', payload: updated });
    this.processSyncQueue();
    return updated;
  }

  async deleteLead(id) {
    const index = this.leads.findIndex(l => l.id === id);
    if (index === -1) return false;

    const targetLead = this.leads[index];

    // 1. Optimistic Local Delete
    this.leads.splice(index, 1);
    this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
    this.notify();

    // 2. Queue Sync Operation
    this.enqueueOperation({ type: 'DELETE', payload: { id: targetLead.id } });
    this.processSyncQueue();
    return true;
  }

  clearDemoLeads() {
    this.leads = [];
    this.saveToStorage(STORAGE_KEYS.LEADS, []);
    this.syncQueue = [];
    this.saveToStorage(STORAGE_KEYS.QUEUE, []);
    this.notify();

    if (this.endpointUrl && navigator.onLine) {
      fetch(this.endpointUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearAllLeads' })
      }).catch(() => {});
    }
  }

  // --- REMOTE SYNC & QUEUE PROCESSOR ---
  enqueueOperation(op) {
    this.syncQueue.push({
      id: 'op-' + Date.now(),
      timestamp: Date.now(),
      attempts: 0,
      ...op
    });
    this.saveToStorage(STORAGE_KEYS.QUEUE, this.syncQueue);
    this.notifySyncStatus({
      state: 'syncing',
      pendingCount: this.syncQueue.length,
      message: `Guardando ${this.syncQueue.length} cambios...`
    });
  }

  async processSyncQueue() {
    if (this.isSyncing || this.syncQueue.length === 0 || !navigator.onLine || !this.endpointUrl) {
      if (this.syncQueue.length === 0) {
        this.notifySyncStatus({ state: 'synced', pendingCount: 0, message: 'Google Sheets Sincronizado 📊' });
      }
      return;
    }

    this.isSyncing = true;

    try {
      while (this.syncQueue.length > 0) {
        const op = this.syncQueue[0];
        let actionName = 'addLead';
        let bodyPayload = {};

        if (op.type === 'ADD') {
          actionName = 'addLead';
          bodyPayload = { action: actionName, lead: op.payload };
        } else if (op.type === 'UPDATE') {
          actionName = 'updateLead';
          bodyPayload = { action: actionName, lead: op.payload };
        } else if (op.type === 'DELETE') {
          actionName = 'deleteLead';
          bodyPayload = { action: actionName, leadId: op.payload.id };
        }

        await fetch(this.endpointUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (op.payload && op.payload.id) {
          const lead = this.leads.find(l => l.id === op.payload.id);
          if (lead) lead.syncState = 'synced';
        }

        this.syncQueue.shift();
        this.saveToStorage(STORAGE_KEYS.QUEUE, this.syncQueue);
        this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
      }

      this.notifySyncStatus({ state: 'synced', pendingCount: 0, message: 'Google Sheets Sincronizado 📊' });
    } catch (err) {
      console.error('Network sync error:', err);
      this.notifySyncStatus({ state: 'offline', pendingCount: this.syncQueue.length, message: 'Reintentando sincronización...' });
    } finally {
      this.isSyncing = false;
    }
  }

  async pullFromRemote() {
    if (!this.endpointUrl || !navigator.onLine) return;

    try {
      this.notifySyncStatus({ state: 'syncing', pendingCount: 0, message: 'Cargando datos...' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      
      const res = await fetch(this.endpointUrl + '?action=getLeads', { signal: controller.signal });
      clearTimeout(timer);

      const remoteData = await res.json();
      if (Array.isArray(remoteData) && remoteData.length > 0) {
        const pendingIds = new Set(this.syncQueue.map(q => q.payload?.id));
        const merged = remoteData.map(r => this.sanitizeLeadSchema(r));

        this.leads.forEach(localLead => {
          if (pendingIds.has(localLead.id) && !merged.some(m => m.id === localLead.id)) {
            merged.unshift(localLead);
          }
        });

        this.leads = merged;
        this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
        this.notify();
      }
      this.notifySyncStatus({ state: 'synced', pendingCount: 0, message: 'Google Sheets Sincronizado 📊' });
    } catch (e) {
      console.warn('Pull remote error or timeout:', e);
      this.notifySyncStatus({ state: 'synced', pendingCount: 0, message: 'Modo Local Activo' });
    }
  }

  // --- SCHEMA SANITIZATION & INTEGRITY ---
  sanitizeLeadSchema(data) {
    let founder = String(data.assignedFounder || '').trim();
    if (founder === 'Mikel Canals' || founder === 'Mikel') founder = 'Miquel Canals';
    if (founder === 'Pau Martí' || founder === 'Pau') founder = 'Pau Martí';
    if (founder.includes('Ambos')) founder = 'Ambos (Pau & Miquel)';
    if (!FOUNDERS.includes(founder)) founder = 'Pau Martí';

    return {
      id: String(data.id || 'lead-' + Date.now()),
      companyName: String(data.companyName || 'Empresa Sin Nombre').trim(),
      contactName: String(data.contactName || '').trim(),
      contactPhone: this.formatPhone(data.contactPhone || ''),
      contactEmail: String(data.contactEmail || '').trim().toLowerCase(),
      assignedFounder: founder,
      serviceType: String(data.serviceType || 'Automatización Make/n8n'),
      dealStage: DEAL_STAGES.includes(data.dealStage) ? data.dealStage : 'Nuevo Lead',
      dealValue: Math.max(0, Number(data.dealValue || 0)),
      nextActionDate: data.nextActionDate ? String(data.nextActionDate).split('T')[0] : '',
      leadNotes: String(data.leadNotes || '').trim(),
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncState: data.syncState || 'synced'
    };
  }

  formatPhone(phoneStr) {
    if (!phoneStr) return '';
    let cleaned = phoneStr.replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.length === 10) return '52' + cleaned;
    if (cleaned.length === 11 && cleaned.startsWith('521')) return '52' + cleaned.substring(3);
    return cleaned;
  }

  // --- IMPORT / EXPORT DATA ENGINE ---
  exportBackupJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.leads, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `FluxAI_CRM_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(dlAnchorElem);
    dlAnchorElem.click();
    dlAnchorElem.remove();
  }

  importBackupJSON(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        const sanitizedList = parsed.map(p => this.sanitizeLeadSchema(p));
        this.leads = sanitizedList;
        this.saveToStorage(STORAGE_KEYS.LEADS, this.leads);
        this.notify();
        return { success: true, count: sanitizedList.length };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
    return { success: false, error: 'Formato de JSON no válido' };
  }

  exportCSV() {
    if (!this.leads.length) return;
    const headers = ["ID", "Empresa", "Contacto", "Telefono", "Email", "Socio", "Servicio", "Etapa", "Valor MXN", "Fecha Seguimiento", "Notas", "Fecha Creado"];
    const rows = this.leads.map(l => [
      l.id,
      `"${l.companyName.replace(/"/g, '""')}"`,
      `"${l.contactName.replace(/"/g, '""')}"`,
      `"${l.contactPhone.replace(/"/g, '""')}"`,
      `"${l.contactEmail.replace(/"/g, '""')}"`,
      `"${l.assignedFounder.replace(/"/g, '""')}"`,
      `"${l.serviceType.replace(/"/g, '""')}"`,
      `"${l.dealStage.replace(/"/g, '""')}"`,
      l.dealValue,
      l.nextActionDate,
      `"${l.leadNotes.replace(/"/g, '""')}"`,
      l.createdAt
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `FluxAI_CRM_Leads_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  saveToStorage(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { console.error('Storage error:', e); }
  }

  loadFromStorage(key, fallback) {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
}

export const DB = new DatabaseEngine();
