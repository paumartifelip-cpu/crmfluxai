// Google Sheets Integration Module with Robust Offline Sync & Formatting

const SHEETS_URL_KEY = 'flux_crm_sheets_url';
const LOCAL_LEADS_KEY = 'flux_crm_local_leads';

const DEFAULT_SHEETS_URL = 'https://script.google.com/macros/s/AKfycbx3ebsEN7oCAGzGWhFcDlSAlvnxgEK9mVHXW-l89kh6F5o_i7ioSeGu9ux6CoNKqq0M/exec';

let sheetsScriptUrl = DEFAULT_SHEETS_URL;

const DEFAULT_INITIAL_LEADS = [
  {
    id: 'demo-lead-1',
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
    createdAt: new Date().toISOString()
  },
  {
    id: 'demo-lead-2',
    companyName: 'Agencia Logística Monterrey',
    contactName: 'Sofía Garza',
    contactPhone: '8181239876',
    contactEmail: 'sofia@logisticamty.mx',
    assignedFounder: 'Mikel Canals',
    serviceType: 'Automatización Make/n8n',
    dealStage: 'Propuesta Enviada',
    dealValue: 45000,
    nextActionDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
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

// Fallo 1 Fix: Reliable Sync with Timeout Resilience
export async function fetchLeads() {
  if (sheetsScriptUrl) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(sheetsScriptUrl + '?action=getLeads', { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json();
      if (Array.isArray(data)) {
        saveLocalLeads(data);
        return data;
      }
    } catch (e) {
      console.warn('Google Sheets fetch timeout or offline, loading cached leads:', e);
    }
  }
  return getLocalLeads();
}

// Fallo 2 Fix: Clear all demo leads helper
export function clearDemoLeads() {
  saveLocalLeads([]);
  if (sheetsScriptUrl) {
    fetch(sheetsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearAllLeads' })
    }).catch(() => {});
  }
}

// Fallo 8 Fix: Auto-format Mexican and International WhatsApp Numbers
export function formatWhatsAppPhone(phoneStr) {
  if (!phoneStr) return '';
  let cleaned = phoneStr.replace(/\D/g, '');
  if (!cleaned) return '';
  
  // If user entered 10 digits (standard Mexico phone without country code)
  if (cleaned.length === 10) {
    return '52' + cleaned;
  }
  // If user entered 11 digits starting with 1 (US/CA) or 521 (old MX format)
  if (cleaned.length === 11 && cleaned.startsWith('521')) {
    return '52' + cleaned.substring(3);
  }
  return cleaned;
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
    fetch(sheetsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'addLead', lead: newLead })
    }).catch(err => console.error('Error background sync add lead:', err));
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
      fetch(sheetsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateLead', lead: leads[index] })
      }).catch(err => console.error('Error background sync update lead:', err));
    }
  }
}

// Delete Lead
export async function deleteLead(leadId) {
  let leads = getLocalLeads();
  leads = leads.filter(l => l.id !== leadId);
  saveLocalLeads(leads);

  if (sheetsScriptUrl) {
    fetch(sheetsScriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteLead', leadId: leadId })
    }).catch(err => console.error('Error background sync delete lead:', err));
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
  try { 
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : DEFAULT_INITIAL_LEADS;
  } catch (e) { 
    return DEFAULT_INITIAL_LEADS; 
  }
}

function saveLocalLeads(leads) {
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads));
}
