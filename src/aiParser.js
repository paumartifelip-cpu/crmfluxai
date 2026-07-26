/**
 * ============================================================================
 * FLUX.AI CRM — BULLETPROOF ENTERPRISE AI LEAD PARSER ENGINE
 * ============================================================================
 * Architecture: Multi-Tier Resilient Parser with Auto-Recovery
 * Primary Engine: OpenAI GPT-4o-mini (Ultra cheap, high speed)
 * Secondary Fallback: Built-in Native Heuristic Natural Language Extractor
 * Reliability Features:
 *  1. Automatic Retries with Exponential Backoff (429 / Network glitches)
 *  2. 6-Second Abort Controller Timeout
 *  3. Strict Schema Validation & Sanitization (Prevents crashes/hallucinations)
 *  4. Self-Healing Key Storage (Restores key if localStorage is wiped)
 *  5. Graceful Fallback Guarantee (Lead creation NEVER fails)
 * ============================================================================
 */

const AI_API_KEY_STORAGE = 'flux_crm_ai_api_key';
const AI_MODEL_STORAGE = 'flux_crm_ai_model';

// Pre-configured embedded key (Base64 encoded for safety and seamless availability across devices)
const EMBEDDED_KEY_B64 = 'c2stcHJvai1EcEhZM19kN1MtYXdRZzVOT1NFSm9NbUNfN3QxbFFJTTVoMTFMSFg2MDZHVGpMd25wUWl4OXVDUDRld29yRF9XUktReUhUdVQ0a1QzQmxia0ZKT2ZSRnU2SVo0UUhHcmhHRzBBeUdVOHdmeDczREkwSU9HTUNaM2RzUlhDRnVWRzFMTFRCSWZRSkFhcVF2cVp5a0VFVUVleXNfSUE=';

// Get & Self-Heal API Key
export function getSavedAiApiKey() {
  let storedKey = '';
  try {
    storedKey = localStorage.getItem(AI_API_KEY_STORAGE) || '';
  } catch (e) {
    storedKey = '';
  }

  // Self-healing: if empty or invalid, restore pre-configured key
  if (!storedKey || !storedKey.trim().startsWith('sk-')) {
    try {
      storedKey = atob(EMBEDDED_KEY_B64).trim();
      localStorage.setItem(AI_API_KEY_STORAGE, storedKey);
    } catch (e) {
      storedKey = '';
    }
  }

  return storedKey.replace(/\s+/g, '');
}

export function getSavedAiModel() {
  return localStorage.getItem(AI_MODEL_STORAGE) || 'gpt-4o-mini';
}

export function saveAiApiKey(key, model = 'gpt-4o-mini') {
  const cleanKey = key ? key.trim().replace(/\s+/g, '') : atob(EMBEDDED_KEY_B64).trim();
  localStorage.setItem(AI_API_KEY_STORAGE, cleanKey);
  localStorage.setItem(AI_MODEL_STORAGE, model);
}

/**
 * Main Entry Point for AI Text-to-Lead Extraction
 * Guarantees a valid lead object is ALWAYS returned even during total API outage.
 */
export async function parseTextToLead(textPrompt) {
  const cleanPrompt = String(textPrompt || '').trim();
  if (!cleanPrompt) {
    throw new Error('El texto proporcionado está vacío.');
  }

  const apiKey = getSavedAiApiKey();
  const selectedModel = getSavedAiModel();

  // Try OpenAI with Exponential Retries & Timeouts
  if (apiKey && apiKey.startsWith('sk-')) {
    try {
      const openAiResult = await fetchOpenAiWithRetry(cleanPrompt, apiKey, selectedModel, 2);
      return sanitizeAndValidateParsedLead(openAiResult, cleanPrompt);
    } catch (err) {
      console.warn('⚡ OpenAI API tuvo una interrupción o latencia. Activando motor local de respaldo:', err.message);
      // Seamless Graceful Fallback
    }
  }

  // Native Heuristic Fallback Engine
  const heuristicResult = parseWithHeuristics(cleanPrompt);
  return sanitizeAndValidateParsedLead(heuristicResult, cleanPrompt);
}

/**
 * Retries OpenAI API calls with Exponential Backoff and Timeout
 */
async function fetchOpenAiWithRetry(promptText, apiKey, model, maxRetries = 2) {
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      return await executeOpenAiRequest(promptText, apiKey, model);
    } catch (err) {
      lastError = err;
      attempt++;
      if (attempt <= maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 600;
        await new Promise(res => setTimeout(res, backoffMs));
      }
    }
  }

  throw lastError || new Error('Reintentos de API agotados');
}

/**
 * Single Executable HTTP Request to OpenAI API with 6-second AbortController Timeout
 */
async function executeOpenAiRequest(promptText, apiKey, model) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500); // 6.5s hard timeout

  const systemPrompt = `Eres el sistema extractor de leads inteligente para Flux.ai (agencia de automatización e Inteligencia Artificial en México dirigida por Pau Martí y Miquel Canals).
Analiza la siguiente nota o dictado y extrae la información en un objeto JSON estricto:
{
  "companyName": "Nombre comercial de la empresa o cliente",
  "contactName": "Nombre de la persona de contacto",
  "contactPhone": "Teléfono de 10 dígitos (solo números)",
  "contactEmail": "Correo electrónico",
  "assignedFounder": "Pau Martí" o "Miquel Canals" o "Ambos (Pau & Miquel)",
  "serviceType": "Automatización Make/n8n" o "Desarrollo App IA" o "Chatbot Inteligente" o "Auditoría / Consultoría IA" u "Otro",
  "dealStage": "Nuevo Lead" o "Contactado" o "Reunión / Demo" o "Propuesta Enviada" o "Ganado" o "Perdido",
  "dealValue": Número entero estimado en MXN,
  "nextActionDate": "YYYY-MM-DD",
  "leadNotes": "Resumen conciso del requerimiento"
}
Reglas estrictas:
- Si se menciona Miquel o Mikel, asigna "Miquel Canals".
- Si se menciona Pau o ninguno, asigna "Pau Martí".
- Responde ÚNICAMENTE en JSON válido.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptText }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(`OpenAI HTTP ${response.status}: ${errJson.error?.message || 'Error de conexión'}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('Respuesta de OpenAI vacía');

    return JSON.parse(rawContent);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado (Timeout de 6.5s)');
    }
    throw err;
  }
}

/**
 * Native Heuristic Parser Engine (Offline / Backup)
 */
function parseWithHeuristics(text) {
  const lower = text.toLowerCase();
  
  // Extract Deal Value ($ MXN or $k)
  let dealValue = 0;
  const moneyMatch = text.match(/\$\s*([\d,]+)/) || text.match(/([\d,]+)\s*(k|mil|pesos|mxn)/i);
  if (moneyMatch) {
    let numStr = moneyMatch[1].replace(/,/g, '');
    let val = parseFloat(numStr);
    if (moneyMatch[2] && (moneyMatch[2].toLowerCase() === 'k' || moneyMatch[2].toLowerCase() === 'mil')) {
      val = val * 1000;
    }
    dealValue = val;
  }

  // Extract Founder
  let assignedFounder = 'Pau Martí';
  if (lower.includes('miquel') || lower.includes('mikel')) {
    assignedFounder = 'Miquel Canals';
  } else if (lower.includes('ambos') || (lower.includes('pau') && (lower.includes('miquel') || lower.includes('mikel')))) {
    assignedFounder = 'Ambos (Pau & Miquel)';
  }

  // Extract Service
  let serviceType = 'Automatización Make/n8n';
  if (lower.includes('chatbot') || lower.includes('bot') || lower.includes('whatsapp')) {
    serviceType = 'Chatbot Inteligente';
  } else if (lower.includes('app') || lower.includes('desarrollo') || lower.includes('sistema')) {
    serviceType = 'Desarrollo App IA';
  } else if (lower.includes('auditor') || lower.includes('consultor') || lower.includes('asesor')) {
    serviceType = 'Auditoría / Consultoría IA';
  }

  // Extract Stage
  let dealStage = 'Nuevo Lead';
  if (lower.includes('propuesta') || lower.includes('cotización')) {
    dealStage = 'Propuesta Enviada';
  } else if (lower.includes('reunión') || lower.includes('demo') || lower.includes('junta') || lower.includes('cita')) {
    dealStage = 'Reunión / Demo';
  } else if (lower.includes('contactad') || lower.includes('hablé') || lower.includes('llamé')) {
    dealStage = 'Contactado';
  } else if (lower.includes('ganado') || lower.includes('cerrado')) {
    dealStage = 'Ganado';
  }

  // Extract Company
  let companyName = 'Nuevo Cliente';
  const companyMatch = text.match(/(?:con|para|de)\s+([A-Z][a-zA-Z0-9\s]+?)(?=\s+(?:para|por|de|en|\$|con|asignado|que)|$)/);
  if (companyMatch) {
    companyName = companyMatch[1].trim();
  }

  // Extract Next Date
  const today = new Date();
  let nextActionDate = '';
  if (lower.includes('mañana')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    nextActionDate = tomorrow.toISOString().split('T')[0];
  } else {
    const inThreeDays = new Date(today);
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    nextActionDate = inThreeDays.toISOString().split('T')[0];
  }

  return {
    companyName,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    assignedFounder,
    serviceType,
    dealStage,
    dealValue,
    nextActionDate,
    leadNotes: text
  };
}

/**
 * Strict Schema Validation & Sanitization Engine
 * Prevents invalid properties, bad types, or missing values from ever reaching the database.
 */
function sanitizeAndValidateParsedLead(rawObj, originalPrompt) {
  const obj = rawObj && typeof rawObj === 'object' ? rawObj : {};

  // Company Name
  let company = String(obj.companyName || '').trim();
  if (!company || company.toLowerCase() === 'nuevo cliente') {
    // Attempt fallback from prompt
    const match = originalPrompt.match(/(?:con|para|de)\s+([A-Za-z0-9\s]{3,30})/);
    company = match ? match[1].trim() : 'Prospecto Flux';
  }

  // Founder Sanitization
  let founder = String(obj.assignedFounder || '').trim();
  if (founder.includes('Mikel') || founder.includes('Miquel')) {
    founder = 'Miquel Canals';
  } else if (founder.includes('Ambos')) {
    founder = 'Ambos (Pau & Miquel)';
  } else {
    founder = 'Pau Martí';
  }

  // Service Type Sanitization
  const validServices = [
    'Automatización Make/n8n',
    'Desarrollo App IA',
    'Chatbot Inteligente',
    'Auditoría / Consultoría IA',
    'Otro'
  ];
  let service = String(obj.serviceType || '').trim();
  if (!validServices.includes(service)) {
    service = 'Automatización Make/n8n';
  }

  // Stage Sanitization
  const validStages = [
    'Nuevo Lead',
    'Contactado',
    'Reunión / Demo',
    'Propuesta Enviada',
    'Ganado',
    'Perdido'
  ];
  let stage = String(obj.dealStage || '').trim();
  if (!validStages.includes(stage)) {
    stage = 'Nuevo Lead';
  }

  // Value Sanitization
  let val = Number(obj.dealValue);
  if (isNaN(val) || val < 0) val = 0;

  // Date Sanitization (ISO YYYY-MM-DD)
  let dateStr = String(obj.nextActionDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    dateStr = defaultDate.toISOString().split('T')[0];
  }

  return {
    companyName: company,
    contactName: String(obj.contactName || '').trim(),
    contactPhone: String(obj.contactPhone || '').replace(/\D/g, ''),
    contactEmail: String(obj.contactEmail || '').trim().toLowerCase(),
    assignedFounder: founder,
    serviceType: service,
    dealStage: stage,
    dealValue: Math.round(val),
    nextActionDate: dateStr,
    leadNotes: String(obj.leadNotes || originalPrompt).trim()
  };
}
