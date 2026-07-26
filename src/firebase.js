import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  query,
  orderBy
} from 'firebase/firestore';

// Storage key for Firebase credentials in LocalStorage
const FIREBASE_CONFIG_KEY = 'flux_crm_firebase_config';
const LOCAL_LEADS_KEY = 'flux_crm_local_leads';

let db = null;
let isFirebaseActive = false;

// Initial sample leads for Pau & Mikel to test immediately
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
    leadNotes: 'Interesados en chatbot multilingüe para atención a huéspedes por WhatsApp y reservas.',
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
  },
  {
    id: 'demo-lead-3',
    companyName: 'Fintech Guadalajara',
    contactName: 'Andrés Navarro',
    contactPhone: '523331112233',
    contactEmail: 'andres@fintechgdl.com',
    assignedFounder: 'Ambos (Pau & Mikel)',
    serviceType: 'Desarrollo App IA',
    dealStage: 'Nuevo Lead',
    dealValue: 120000,
    nextActionDate: '2026-07-30',
    leadNotes: 'Buscan agente conversacional de evaluación crediticia.',
    createdAt: new Date().toISOString()
  }
];

// 1. Try initializing Firebase from saved config
export function initFirebase() {
  const savedConfig = localStorage.getItem(FIREBASE_CONFIG_KEY);
  if (savedConfig) {
    try {
      const config = JSON.parse(savedConfig);
      if (config.apiKey && config.projectId) {
        const app = initializeApp(config);
        db = getFirestore(app);
        isFirebaseActive = true;
        console.log('🔥 Firebase inicializado con éxito en el proyecto:', config.projectId);
        return { active: true, projectId: config.projectId };
      }
    } catch (e) {
      console.warn('Configuración de Firebase no válida, usando modo demo local.');
    }
  }
  isFirebaseActive = false;
  db = null;
  return { active: false, projectId: null };
}

// Get saved Firebase Config object
export function getSavedFirebaseConfig() {
  try {
    const saved = localStorage.getItem(FIREBASE_CONFIG_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
}

// Save Firebase Config
export function saveFirebaseConfig(config) {
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
  return initFirebase();
}

// Reset Firebase Config back to Local Storage mode
export function resetFirebaseConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
  return initFirebase();
}

// 2. Real-time Lead Listener (Works with Firestore OR LocalStorage fallback)
export function subscribeToLeads(onLeadsUpdated) {
  if (isFirebaseActive && db) {
    try {
      const leadsRef = collection(db, 'leads');
      const q = query(leadsRef, orderBy('createdAt', 'desc'));
      
      return onSnapshot(q, (snapshot) => {
        const leads = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));
        onLeadsUpdated(leads);
      }, (error) => {
        console.error('Error escuchando Firestore:', error);
        fallbackToLocalStorage(onLeadsUpdated);
      });
    } catch (err) {
      console.error('Error al suscribir a Firestore:', err);
      fallbackToLocalStorage(onLeadsUpdated);
    }
  } else {
    fallbackToLocalStorage(onLeadsUpdated);
    return () => {}; // No-op unsubscribe for local storage
  }
}

function fallbackToLocalStorage(onLeadsUpdated) {
  let localLeads = localStorage.getItem(LOCAL_LEADS_KEY);
  if (!localLeads) {
    localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(DEFAULT_INITIAL_LEADS));
    onLeadsUpdated(DEFAULT_INITIAL_LEADS);
  } else {
    try {
      onLeadsUpdated(JSON.parse(localLeads));
    } catch (e) {
      onLeadsUpdated(DEFAULT_INITIAL_LEADS);
    }
  }
}

// 3. Add New Lead
export async function addLead(leadData) {
  if (isFirebaseActive && db) {
    const leadsRef = collection(db, 'leads');
    await addDoc(leadsRef, {
      ...leadData,
      dealValue: Number(leadData.dealValue || 0),
      createdAt: serverTimestamp()
    });
  } else {
    const leads = getLocalLeads();
    const newLead = {
      id: 'lead-' + Date.now(),
      ...leadData,
      dealValue: Number(leadData.dealValue || 0),
      createdAt: new Date().toISOString()
    };
    leads.unshift(newLead);
    saveLocalLeads(leads);
    // Trigger local update manually
    window.dispatchEvent(new CustomEvent('local-leads-changed'));
  }
}

// 4. Update Existing Lead
export async function updateLead(leadId, updatedFields) {
  if (isFirebaseActive && db) {
    const leadRef = doc(db, 'leads', leadId);
    await updateDoc(leadRef, {
      ...updatedFields,
      dealValue: Number(updatedFields.dealValue || 0)
    });
  } else {
    const leads = getLocalLeads();
    const index = leads.findIndex(l => l.id === leadId);
    if (index !== -1) {
      leads[index] = { 
        ...leads[index], 
        ...updatedFields,
        dealValue: Number(updatedFields.dealValue || 0)
      };
      saveLocalLeads(leads);
      window.dispatchEvent(new CustomEvent('local-leads-changed'));
    }
  }
}

// 5. Delete Lead
export async function deleteLead(leadId) {
  if (isFirebaseActive && db) {
    const leadRef = doc(db, 'leads', leadId);
    await deleteDoc(leadRef);
  } else {
    let leads = getLocalLeads();
    leads = leads.filter(l => l.id !== leadId);
    saveLocalLeads(leads);
    window.dispatchEvent(new CustomEvent('local-leads-changed'));
  }
}

// Helper methods for LocalStorage
function getLocalLeads() {
  const data = localStorage.getItem(LOCAL_LEADS_KEY);
  if (!data) return DEFAULT_INITIAL_LEADS;
  try { return JSON.parse(data); } catch (e) { return DEFAULT_INITIAL_LEADS; }
}

function saveLocalLeads(leads) {
  localStorage.setItem(LOCAL_LEADS_KEY, JSON.stringify(leads));
}
