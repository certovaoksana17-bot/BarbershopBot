/**
 * Google Apps Script — single endpoint for all Sheets operations.
 * Sync logic handled here: one "book" POST writes to "Заказы" AND marks master grid.
 *
 * Deploy: Web app, Execute as Me, Who has access: Anyone
 */

const SHEET_ID = 'ВАШ_ID_ТАБЛИЦЫ';
const ORDERS_SHEET = 'Заказы';
const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const MASTER_SHEET_PREFIX = 'Мастер_';

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'health';
  const params = e.parameter || {};

  if (action === 'health') return json({ ok: true, message: 'Barbershop Sheets API is running' });
  if (action === 'get_slots') return getSlots(params.masterName);
  if (action === 'get_schedule') return getSchedule(params.masterName);
  if (action === 'get_today_bookings') return getTodayBookings(params.masterName);

  return json({ ok: false, message: 'Unknown action' });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, message: 'Invalid JSON' });
  }

  if (payload.action === 'book') return bookSlot(payload);
  if (payload.action === 'mark_vacation') return markVacation(payload);
  if (payload.action === 'get_slots') return getSlots(payload.masterName);
  if (payload.action === 'get_schedule') return getSchedule(payload.masterName);
  if (payload.action === 'get_today_bookings') return getTodayBookings(payload.masterName);

  return json({ ok: false, message: 'Unknown action' });
}

// --- book: ONE call → Orders sheet + master grid ---
function bookSlot(payload) {
  const required = ['masterName', 'name', 'surname', 'phone', 'service', 'time', 'date'];
  const missing = required.filter((k) => !payload[k]);
  if (missing.length) return json({ ok: false, message: 'Missing fields: ' + missing.join(', ') });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const orders = getOrCreateOrdersSheet(ss);
    const masterSheet = getMasterSheet(ss, payload.masterName);
    if (!masterSheet) return json({ ok: false, message: 'Master sheet not found' });

    const grid = masterSheet.getDataRange().getValues();
    const timeHeaders = getTimeHeaders_(grid[0]);
    const timeCol = timeHeaders.indexOf(formatTimeHeader_(payload.time));
    if (timeCol < 0) return json({ ok: false, message: 'Time slot not found in master grid' });

    const dateRow = findDateRow(grid, payload.date);
    if (dateRow < 0) return json({ ok: false, message: 'Date not found in master schedule' });

    const cellCol = timeCol + 1; // column 0 = date, time slots start at 1
    const current = String(grid[dateRow][cellCol] || '').trim();
    if (!isCellFree_(current)) {
      return json({ ok: false, message: 'Slot is already booked' });
    }

    const status = 'Занято (' + payload.name + ' ' + payload.surname + ')';
    masterSheet.getRange(dateRow + 1, cellCol + 1).setValue(status);

    orders.appendRow([
      new Date(),
      payload.name,
      payload.surname,
      payload.phone,
      payload.service,
      payload.time,
      payload.masterName,
      payload.date,
      payload.userId || '',
    ]);

    return json({ ok: true, message: 'Record added' });
  } catch (err) {
    return json({ ok: false, message: 'Error: ' + err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function markVacation(payload) {
  if (!payload.masterName || !payload.date) {
    return json({ ok: false, message: 'Missing masterName or date' });
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const masterSheet = getMasterSheet(ss, payload.masterName);
  if (!masterSheet) return json({ ok: false, message: 'Master sheet not found' });

  const grid = masterSheet.getDataRange().getValues();
  const dateRow = findDateRow(grid, payload.date);
  if (dateRow < 0) return json({ ok: false, message: 'Date not found' });

  for (let col = 1; col < grid[0].length; col++) {
    masterSheet.getRange(dateRow + 1, col + 1).setValue('Выходной');
  }

  return json({ ok: true, message: 'Vacation marked' });
}

function isCellFree_(value) {
  const cell = String(value || '').trim();
  if (!cell) return true;
  if (/^свободно$/i.test(cell)) return true;
  return false;
}

function isSlotInPast_(date, time) {
  const tz = Session.getScriptTimeZone();
  try {
    const slot = Utilities.parseDate(date + ' ' + time, tz, 'yyyy-MM-dd HH:mm');
    return slot.getTime() <= Date.now();
  } catch (e) {
    return false;
  }
}

function getSlots(masterName) {
  if (!masterName) return json({ ok: false, message: 'Missing masterName' });

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const masterSheet = getMasterSheet(ss, masterName);
  if (!masterSheet) return json({ ok: false, message: 'Master sheet not found' });

  const grid = masterSheet.getDataRange().getValues();
  const timeHeaders = getTimeHeaders_(grid[0]);
  const slots = [];

  for (let r = 1; r < grid.length; r++) {
    const date = formatDate_(grid[r][0]);
    if (!date) continue;

    for (let c = 0; c < timeHeaders.length; c++) {
      const time = timeHeaders[c];
      const cellCol = c + 1; // column index in sheet (0 = date)
      const cell = String(grid[r][cellCol] || '').trim();
      if (isCellFree_(cell) && !isSlotInPast_(date, time)) {
        slots.push({
          date: date,
          time: time,
          label: formatLabel_(date, time),
        });
      }
    }
  }

  return json({ ok: true, slots: slots });
}

function getSchedule(masterName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const masterSheet = getMasterSheet(ss, masterName);
  if (!masterSheet) return json({ ok: false, message: 'Master sheet not found' });

  const grid = masterSheet.getDataRange().getValues();
  const timeHeaders = getTimeHeaders_(grid[0]);
  const schedule = [];

  for (let r = 1; r < grid.length; r++) {
    const date = formatDate_(grid[r][0]);
    if (!date) continue;
    const slots = [];
    for (let c = 0; c < timeHeaders.length; c++) {
      const cellCol = c + 1;
      slots.push({
        time: timeHeaders[c],
        status: String(grid[r][cellCol] || '').trim() || 'свободно',
      });
    }
    schedule.push({ date: date, slots: slots });
  }

  return json({ ok: true, schedule: schedule });
}

function getTodayBookings(masterName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = getOrCreateOrdersSheet(ss);
  const rows = orders.getDataRange().getValues();
  if (rows.length < 2) return json({ ok: true, bookings: [] });

  const headers = rows[0].map(String);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const bookings = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rowToObj_(headers, rows[i]);
    const rowDate = formatDate_(row['Дата'] || row.date || '');
    if (String(row['Мастер'] || row.master) !== String(masterName)) continue;
    if (rowDate !== today) continue;
    bookings.push({
      name: row['Имя'] || row.name,
      surname: row['Фамилия'] || row.surname,
      phone: row['Телефон'] || row.phone,
      service: row['Услуга'] || row.service,
      time: row['Время'] || row.time,
    });
  }

  return json({ ok: true, bookings: bookings });
}

// --- helpers ---

function getOrCreateOrdersSheet(ss) {
  let sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    sheet.appendRow(['Дата_создания', 'Имя', 'Фамилия', 'Телефон', 'Услуга', 'Время', 'Мастер', 'Дата', 'userId']);
  }
  return sheet;
}

function getMasterSheet(ss, masterName) {
  return ss.getSheetByName(MASTER_SHEET_PREFIX + masterName);
}

function findDateRow(grid, targetDate) {
  const normalized = String(targetDate);
  for (let r = 1; r < grid.length; r++) {
    if (formatDate_(grid[r][0]) === normalized) return r;
  }
  return -1;
}

function formatDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function formatLabel_(date, time) {
  const parts = date.split('-');
  return parts[2] + '.' + parts[1] + ' в ' + time;
}

/** Normalize time header/cell values to HH:mm (Sheets may return Date objects for time columns). */
function formatTimeHeader_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }
  const s = String(value).trim();
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hh = match[1].length === 1 ? '0' + match[1] : match[1];
    return hh + ':' + match[2];
  }
  return s;
}

function getTimeHeaders_(headerRow) {
  const headers = [];
  for (let c = 1; c < headerRow.length; c++) {
    headers.push(formatTimeHeader_(headerRow[c]));
  }
  return headers;
}

function rowToObj_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once to create master sheets with time grid.
 * Extensions → Apps Script → select createMasterSheets → Run
 */
function createMasterSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const masters = ['Анна', 'Иван', 'Оксана'];
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  }

  masters.forEach((name) => {
    const sheetName = MASTER_SHEET_PREFIX + name;
    let sheet = ss.getSheetByName(sheetName);
    if (sheet) ss.deleteSheet(sheet);
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Дата'].concat(TIME_SLOTS));
    // Keep time headers as text (09:00) so they are not parsed as Date objects.
    for (let i = 0; i < TIME_SLOTS.length; i++) {
      sheet.getRange(1, i + 2).setValue(TIME_SLOTS[i]).setNumberFormat('@');
    }
    dates.forEach((date) => sheet.appendRow([date].concat(TIME_SLOTS.map(() => ''))));
  });

  getOrCreateOrdersSheet(ss);
}
