// ================================================
// BUDŻET DOMOWY — Google Apps Script v4
// Dwa PINy — Mąż i Żona
// ================================================

const SPREADSHEET_ID = "1Sjld5OYO-K4qYEfi-78Xgx-aWYi77C4R1ifem_9kMio";
const WYDATKI_SHEET  = "📋 Wydatki";
const WPLYWY_SHEET   = "💰 Wpływy";
const BUDZET_SHEET   = "🎯 Budżet";

// ⬇️ ZMIEŃ NA SWOJE PINY
const PIN_MAZ  = "1234";   // <- Twój PIN
const PIN_ZONA = "5678";   // <- PIN żony

// Zwraca "Mąż", "Żona" lub null
function checkPin(pin) {
  if (String(pin) === String(PIN_MAZ))  return "Mąż";
  if (String(pin) === String(PIN_ZONA)) return "Żona";
  return null;
}

function doPost(e) {
  try {
    const data  = JSON.parse(e.postData.contents);
    const osoba = checkPin(data.pin);

    if (!osoba) {
      return respond({ status: "error", code: "WRONG_PIN", message: "Nieprawidłowy PIN" });
    }

    const action = data.action;
    if      (action === "dodajWydatek") return zapisz(WYDATKI_SHEET, data);
    else if (action === "dodajWplyw")   return zapisz(WPLYWY_SHEET,  data);
    else if (action === "usunWydatek")  return usunWiersz(WYDATKI_SHEET, data.rowIndex);
    else if (action === "usunWplyw")    return usunWiersz(WPLYWY_SHEET,  data.rowIndex);
    else return respond({ status: "error", message: "Nieznana akcja" });
  } catch (err) {
    return respond({ status: "error", message: err.toString() });
  }
}

function doGet(e) {
  try {
    const pin    = e.parameter.pin;
    const action = e.parameter.action;

    if (action === "ping") return respond({ status: "ok" });

    // Przy logowaniu — zwróć kim jest użytkownik
    if (action === "login") {
      const osoba = checkPin(pin);
      if (!osoba) return respond({ status: "error", code: "WRONG_PIN", message: "Nieprawidłowy PIN" });
      return respond({ status: "ok", osoba });
    }

    const osoba = checkPin(pin);
    if (!osoba) return respond({ status: "error", code: "WRONG_PIN", message: "Nieprawidłowy PIN" });

    if      (action === "pobierzWydatki") return pobierzDane(WYDATKI_SHEET);
    else if (action === "pobierzWplywy")  return pobierzDane(WPLYWY_SHEET);
    else if (action === "pobierzBudzet")  return pobierzBudzet(e);
    else return respond({ status: "error", message: "Nieznana akcja GET" });
  } catch (err) {
    return respond({ status: "error", message: err.toString() });
  }
}

function zapisz(sheetName, data) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return respond({ status: "error", message: "Nie znaleziono: " + sheetName });

  const newRow  = Math.max(sheet.getLastRow(), 2) + 1;
  const date    = new Date(data.data);
  const miesiac = formatMiesiac(date);
  const rok     = date.getFullYear();

  sheet.getRange(newRow, 1, 1, 8).setValues([[
    date, data.opis||"", data.kategoria||"", data.kto||"",
    parseFloat(data.kwota)||0, miesiac, rok, data.uwagi||""
  ]]);
  sheet.getRange(newRow, 1).setNumberFormat("DD.MM.YYYY");
  sheet.getRange(newRow, 5).setNumberFormat('#,##0.00 "zł"');
  return respond({ status: "ok", message: "Zapisano!", wiersz: newRow });
}

function usunWiersz(sheetName, rowIndex) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return respond({ status: "error", message: "Nie znaleziono: " + sheetName });
  const row = parseInt(rowIndex);
  if (row < 3) return respond({ status: "error", message: "Nieprawidłowy wiersz" });
  sheet.deleteRow(row);
  return respond({ status: "ok", message: "Usunięto" });
}

function pobierzDane(sheetName) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return respond({ status: "error", message: "Nie znaleziono arkusza" });
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return respond({ status: "ok", data: [] });
  const rows = sheet.getRange(3, 1, lastRow - 2, 8).getValues();
  const result = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    result.push({
      sheetRow:  i + 3,
      data:      Utilities.formatDate(new Date(row[0]), "Europe/Warsaw", "dd.MM.yyyy"),
      opis:      row[1], kategoria: row[2], kto: row[3],
      kwota:     row[4], miesiac:   row[5], rok: row[6], uwagi: row[7]
    });
  }
  return respond({ status: "ok", data: result.reverse().slice(0, 100) });
}

function pobierzBudzet(e) {
  const ss           = SpreadsheetApp.openById(SPREADSHEET_ID);
  const budzetSheet  = ss.getSheetByName(BUDZET_SHEET);
  const wydatkiSheet = ss.getSheetByName(WYDATKI_SHEET);
  if (!budzetSheet || !wydatkiSheet) return respond({ status: "error", message: "Nie znaleziono arkuszy" });

  const MIESIACE = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  const teraz    = new Date();
  const domyslnyMiesiac = formatMiesiac(teraz);
  const domyslnyRok     = teraz.getFullYear();

  // Zakres Od–Do (lub pojedynczy miesiąc dla wstecznej kompatybilności)
  const miesiacOd = (e && e.parameter.miesiacOd) || (e && e.parameter.miesiac) || domyslnyMiesiac;
  const rokOd     = parseInt((e && e.parameter.rokOd)  || (e && e.parameter.rok) || domyslnyRok);
  const miesiacDo = (e && e.parameter.miesiacDo) || miesiacOd;
  const rokDo     = parseInt((e && e.parameter.rokDo)  || rokOd);

  const idxOd = MIESIACE.indexOf(miesiacOd);
  const idxDo = MIESIACE.indexOf(miesiacDo);

  // Plany budżetowe z zakładki Budżet (kolumna A = kategoria, kolumna B = limit)
  const budzetRows = budzetSheet.getRange(11, 1, 13, 2).getValues();
  const plany = {};
  const kolejnosc = [];
  for (const row of budzetRows) {
    if (!row[0]) continue;
    plany[row[0]] = parseFloat(row[1]) || 0;
    kolejnosc.push(row[0]);
  }

  // Stały przelew dla Weroniki (z B7)
  const przelew = parseFloat(budzetSheet.getRange("B7").getValue()) || 0;

  // Rzeczywiste wydatki z zakładki Wydatki
  const lastRow = wydatkiSheet.getLastRow();
  const wiersze = lastRow >= 3 ? wydatkiSheet.getRange(3, 1, lastRow - 2, 8).getValues() : [];

  const mazWyd  = {};
  const zonaWyd = {};
  for (const row of wiersze) {
    if (!row[0]) continue;
    const rowMiesiacIdx = MIESIACE.indexOf(row[5]);
    const rowRok        = parseInt(row[6]);
    // Sprawdź czy wiersz mieści się w zakresie
    const odOk = rowRok > rokOd || (rowRok === rokOd && rowMiesiacIdx >= idxOd);
    const doOk = rowRok < rokDo || (rowRok === rokDo && rowMiesiacIdx <= idxDo);
    if (!odOk || !doOk) continue;
    const kat   = row[2];
    const kto   = row[3];
    const kwota = parseFloat(row[4]) || 0;
    if (kto === "Mąż")  mazWyd[kat]  = (mazWyd[kat]  || 0) + kwota;
    if (kto === "Żona") zonaWyd[kat] = (zonaWyd[kat] || 0) + kwota;
  }

  // Buduj listę kategorii
  const kategorie = [];
  for (const nazwa of kolejnosc) {
    const budzet    = plany[nazwa];
    const maz       = mazWyd[nazwa]  || 0;
    const zona      = zonaWyd[nazwa] || 0;
    const razem     = maz + zona;
    const pozostalo = budzet - razem;
    if (budzet > 0 || razem > 0) {
      kategorie.push({ nazwa, budzet, maz, zona, razem, pozostalo });
    }
  }

  const zonaWydala = Object.values(zonaWyd).reduce((s, v) => s + v, 0);
  return respond({ status: "ok", miesiacOd, rokOd, miesiacDo, rokDo, przelew, zonaWydala, kategorie });
}

function formatMiesiac(date) {
  return ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"][date.getMonth()];
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
