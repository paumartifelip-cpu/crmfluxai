/**
 * ============================================================================
 * FLUX.AI CRM — GOOGLE APPS SCRIPT WEB APP BACKEND SCRIPT
 * ============================================================================
 * Instructions:
 * 1. Open Google Sheets -> Extensiones -> Apps Script
 * 2. Select all existing text (Cmd+A / Ctrl+A) and paste the code below
 * 3. Save (Disk Icon)
 * 4. Click Implementar -> Nueva implementación -> Tipo: Aplicación Web
 *    - Ejecutar como: Yo
 *    - Quién tiene acceso: Cualquier persona
 * 5. Deploy & copy the Web App URL into the CRM Sheets settings.
 * ============================================================================
 */

export const GOOGLE_APPS_SCRIPT_CODE = `
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return ContentService.createTextOutput(JSON.stringify([])).setMimeType(ContentService.MimeType.JSON);

  var leads = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    leads.push({
      id: String(row[0]),
      companyName: String(row[1] || ''),
      contactName: String(row[2] || ''),
      contactPhone: String(row[3] || ''),
      contactEmail: String(row[4] || ''),
      assignedFounder: String(row[5] || 'Pau Martí'),
      serviceType: String(row[6] || 'Automatización Make/n8n'),
      dealStage: String(row[7] || 'Nuevo Lead'),
      dealValue: Number(row[8] || 0),
      nextActionDate: row[9] ? String(row[9]) : '',
      leadNotes: String(row[10] || ''),
      createdAt: row[11] ? String(row[11]) : new Date().toISOString()
    });
  }
  return ContentService.createTextOutput(JSON.stringify(leads)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["id", "companyName", "contactName", "contactPhone", "contactEmail", "assignedFounder", "serviceType", "dealStage", "dealValue", "nextActionDate", "leadNotes", "createdAt"]);
    }

    if (action === "addLead" || action === "updateLead") {
      var l = body.lead;
      var data = sheet.getDataRange().getValues();
      var rowIndex = -1;

      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(l.id)) {
          rowIndex = i + 1;
          break;
        }
      }

      var rowValues = [
        l.id, l.companyName, l.contactName, l.contactPhone, l.contactEmail,
        l.assignedFounder, l.serviceType, l.dealStage, l.dealValue,
        l.nextActionDate, l.leadNotes, l.createdAt || new Date().toISOString()
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    } else if (action === "deleteLead") {
      var leadId = body.leadId;
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(leadId)) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
`;
