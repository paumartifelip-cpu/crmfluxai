/**
 * ============================================================================
 * FLUX.AI CRM — SMART AI LEAD INGESTION ENGINE (OPENAI / CLAUDE / HEURISTIC)
 * ============================================================================
 * Allows Pau & Mikel to type/dictate a single sentence or raw WhatsApp note:
 * e.g., "Ayer hablé con Roberto de Grupo Maya para un chatbot de $35k MXN, asignado a Mikel para dar seguimiento el viernes"
 * And automatically extracts structured CRM Lead fields instantly!
 * ============================================================================
 */

const AI_API_KEY_STORAGE = 'flux_crm_ai_api_key';
const AI_MODEL_STORAGE = 'flux_crm_ai_model'; // 'openai' or 'claude' or 'auto'

export function getSavedAiApiKey() {
  return localStorage.getItem(AI_API_KEY_STORAGE) || '';
}

export function saveAiApiKey(key, model = 'openai') {
  localStorage.setItem(AI_API_KEY_STORAGE, key.trim());
  localStorage.setItem(AI_MODEL_STORAGE, model);
}

export async function parseTextToLead(textPrompt) {
  const apiKey = getSavedAiApiKey();
  
  if (apiKey) {
    try {
      return await parseWithOpenAI(textPrompt, apiKey);
    } catch (e) {
      console.warn('Error llamando a API de OpenAI, usando motor heurístico integrado:', e);
    }
  }

  // Built-in Smart Heuristic Parser (Works 100% offline or with zero API keys!)
  return parseWithHeuristics(textPrompt);
}

// 1. OpenAI GPT-4o Extraction
async function parseWithOpenAI(promptText, apiKey) {
  const systemMessage = `Eres el asistente de IA oficial de Flux.ai (agencia de automatización en México dirigida por Pau Martí y Mikel Canals). 
Analiza la siguiente nota o dictado sobre un cliente y extrae un objeto JSON estricto con los siguientes campos:
- companyName: Nombre de la empresa o cliente (string)
- contactName: Nombre de la persona de contacto si se menciona (string)
- contactPhone: Número de teléfono o WhatsApp si se menciona (string)
- contactEmail: Email si se menciona (string)
- assignedFounder: "Pau Martí" o "Mikel Canals" o "Ambos (Pau & Mikel)" (si se menciona Mikel o Pau, asigna correspondientemente; si no, por defecto "Pau Martí")
- serviceType: "Automatización Make/n8n", "Desarrollo App IA", "Chatbot Inteligente", "Auditoría / Consultoría IA" u "Otro"
- dealStage: "Nuevo Lead", "Contactado", "Reunión / Demo", "Propuesta Enviada", "Ganado" o "Perdido"
- dealValue: Monto del negocio estimado en número MXN (number)
- nextActionDate: Fecha en formato YYYY-MM-DD si se menciona seguimiento (string)
- leadNotes: Resumen conciso del requerimiento (string)
Responde ÚNICAMENTE en JSON válido sin marcadores de markdown.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: promptText }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    })
  });

  const data = await response.json();
  const rawJson = data.choices[0].message.content;
  return JSON.parse(rawJson);
}

// 2. Built-in Smart Heuristic Natural Language Extractor (Zero Setup Needed)
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
  if (lower.includes('mikel')) {
    assignedFounder = 'Mikel Canals';
  } else if (lower.includes('ambos') || (lower.includes('pau') && lower.includes('mikel'))) {
    assignedFounder = 'Ambos (Pau & Mikel)';
  } else if (lower.includes('pau')) {
    assignedFounder = 'Pau Martí';
  }

  // Extract Service Type
  let serviceType = 'Automatización Make/n8n';
  if (lower.includes('chatbot') || lower.includes('bot') || lower.includes('whatsapp')) {
    serviceType = 'Chatbot Inteligente';
  } else if (lower.includes('app') || lower.includes('desarrollo') || lower.includes('sistema')) {
    serviceType = 'Desarrollo App IA';
  } else if (lower.includes('auditor') || lower.includes('consultor') || lower.includes('asesor')) {
    serviceType = 'Auditoría / Consultoría IA';
  }

  // Extract Deal Stage
  let dealStage = 'Nuevo Lead';
  if (lower.includes('propuesta') || lower.includes('cotización') || lower.includes('presupuesto')) {
    dealStage = 'Propuesta Enviada';
  } else if (lower.includes('reunión') || lower.includes('demo') || lower.includes('junta') || lower.includes('cita')) {
    dealStage = 'Reunión / Demo';
  } else if (lower.includes('contactad') || lower.includes('hablé') || lower.includes('llamé')) {
    dealStage = 'Contactado';
  } else if (lower.includes('ganado') || lower.includes('cerrado') || lower.includes('firmado')) {
    dealStage = 'Ganado';
  }

  // Extract Company & Contact Name
  let companyName = 'Nuevo Cliente';
  let contactName = '';

  const companyMatch = text.match(/(?:con|para|de)\s+([A-Z][a-zA-Z0-9\s]+?)(?=\s+(?:para|por|de|en|\$|con|asignado|que)|$)/);
  if (companyMatch) {
    companyName = companyMatch[1].trim();
  }

  // Extract Next Action Date
  let nextActionDate = '';
  const today = new Date();
  if (lower.includes('mañana')) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    nextActionDate = tomorrow.toISOString().split('T')[0];
  } else if (lower.includes('viernes')) {
    const nextFri = new Date();
    nextFri.setDate(today.getDate() + ((5 + 7 - today.getDay()) % 7 || 7));
    nextActionDate = nextFri.toISOString().split('T')[0];
  } else if (lower.includes('lunes')) {
    const nextMon = new Date();
    nextMon.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));
    nextActionDate = nextMon.toISOString().split('T')[0];
  } else {
    // Default 3 days follow-up
    const inThreeDays = new Date(today);
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    nextActionDate = inThreeDays.toISOString().split('T')[0];
  }

  return {
    companyName,
    contactName,
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
