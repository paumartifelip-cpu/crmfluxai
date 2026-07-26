// Google Sheets Integration Module via Apps Script Web App Endpoint

const SHEETS_URL_KEY = 'flux_crm_sheets_url';
const LOCAL_LEADS_KEY = 'flux_crm_local_leads';

const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbx3ebsEN7oCAGzGWhFcDlSAlvnxgEK9mVHXW-l89kh6F5o_i7ioSeGu9ux6CoNKqq0M/exec';

let sheetsScriptUrl = DEFAULT_SHEETS_URL;

const DEFAULT_INITIAL_LEADS = [
  {
    id: 'demo-lead-1',
    companyName: 'Grupo Hotelero Cancún',
    contactName: 'Carlos Mendoza',
    contactPhone: '529981234567',
    contactEmail: 'carlos@hotelcuba.com',
    assignedFounder: 'Pau Martí',
    serviceType: 'Chatbot Inteligente',
    dealStage: 'Reunión / Demo',
    dealValue: 65000,
    nextActionDate: '2026-07-28',
    leadNotes: 'Interesados en chatbot multilingüe para atención a huéspedes por WhatsApp.',
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-lead-2',
    companyName: 'Agencia Logística Monterrey',
    contactName: 'Sofía Garza',
    contactPhone: '528181239876',
    contactEmail: 'sofia@logisticamty.mx',
    assignedFounder: 'Mikel Canals',
    serviceType: 'Automatización Make/n8n',
    dealStage: 'Propuesta Enviada',
    dealValue: 45000,
    nextActionDate: '2026-07-27',
    leadNotes: 'Automatizar extracción de PDFs de facturas e ingreso a su ERP con IA.',
    createdAt: new Date().toISOString()
  }
];

export function initSheets() {
  const savedUrl = localStorage.getItem(SHEETS_URL_KEY);
  if (savedUrl && savedUrl.startsWith('https://script.google.com/')) {
    sheetsScriptUrl = savedUrl;
  } else {
    sheetsScriptUrl = DEFAULT_SHEETS_URL;
  }
  return { active: true, url: sheetsScriptUrl };
}

export function getSavedSheetsUrl() {
  return localStorage.getItem(SHEETS_URL_KEY) || DEFAULT_SHEETS_URL;
}

export function saveSheetsUrl(url) {
  const cleanUrl = url.trim() || DEFAULT_SHEETS_URL;
  localStorage.setItem(SHEETS_URL_KEY, cleanUrl);
  return initSheets();
}

export function resetSheetsUrl() {
  localStorage.removeItem(SHEETS_URL_KEY);
  sheetsScriptUrl = DEFAULT_SHEETS_URL;
  return initSheets();
}

// Fetch leads from Google Sheets with timeout resilience
export async function fetchLeads() {
  if (sheetsScriptUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(sheetsScriptUrl + '?action=getLeads', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        saveLocalLeads(data);
        return data;
      }
    } catch (e) {
      console.warn('Google Sheets fetch offline or slow, loading local cache:', e);
    }
  }
  return getLocalLeads();
}

// Add New Lead
export async function addLead(leadData) {
  const newLead = {
    id: 'lead-' + Date.now(),
    ...leadData,
    dealValue: Number(leadData.dealValue || 0),
    createdAt: new Date().toISOString()
  };

  const leads = getLocalLeads();
  leads.unshift(newLead);
  saveLocalLeads(leads);

  if (sheetsScriptUrl) {
    try {
      fetch(sheetsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addLead', lead: newLead })
      }).catch(err => console.error('Error background sync add lead:', err));
    } catch (e) {
      console.error('Sync error:', e);
    }
  }
  return newLead;
}

// Update Lead
export async function updateLead(leadId, updatedFields) {
  const leads = getLocalLeads();
  const index = leads.findIndex(l => l.id === leadId);
  if (index !== -1) {
    leads[index] = {
      ...leads[index],
      ...updatedFields,
      dealValue: Number(updatedFields.dealValue || 0)
    };
    saveLocalLeads(leads);

    if (sheetsScriptUrl) {
      try {
        fetch(sheetsScriptUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'updateLead', lead: leads[index] })
        }).catch(err => console.error('Error background sync update lead:', err));
      } catch (e) {
        console.error('Sync error:', e);
      }
    }
  }
}

// Delete Lead
export async function deleteLead(leadId) {
  let leads = getLocalLeads();
  leads = leads.filter(l => l.id !== leadId);
  saveLocalLeads(leads);

  if (sheetsScriptUrl) {
    try {
      fetch(sheetsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteLead', leadId: leadId })
      }).catch(err => console.error('Error background sync delete lead:', err));
    } catch (e) {
      console.error('Sync error:', e);
    }
  }
}

// CSV Export Helper Function
export function exportLeadsToCSV(leads) {
  if (!leads || leads.length === 0) return;
  
  const headers = ["ID", "Empresa", "Contacto", "Telefono", "Email", "Socio", "Servicio", "Etapa", "Valor MXN", "Fecha Seguimiento", "Notas", "Fecha Creado"];
  const rows = leads.map(l => [
    l.id || '',
    `"${(l.companyName || '').replace(/"/g, '""')}"`,
    `"${(l.contactName || '').replace(/"/g, '""')}"`,
    `"${(l.contactPhone || '').replace(/"/g, '""')}"`,
    `"${(l.contactEmail || '').replace(/"/g, '""')}"`,
    `"${(l.assignedFounder || '').replace(/"/g, '""')}"`,
    `"${(l.serviceType || '').replace(/"/g, '""')}"`,
    `"${(l.dealStage || '').replace(/"/g, '""')}"`,
    l.dealValue || 0,
    l.nextActionDate || '',
    `"${(l.leadNotes || '').replace(/"/g, '""')}"`,
    l.createdAt || ''
  ]);

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `FluxAI_CRM_Export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getLocalLeads() {
  const data = localStorage.getItem(LOCAL_LEADS_KEY);
  if (!data) return DEFAULT_INITIAL_LEADS;
  try { return JSON.parse(data); } catch (e) { return DEFAULT_INITIAL_LEADS; }
}

function saveLocalLeads(leads) {
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads));
}
