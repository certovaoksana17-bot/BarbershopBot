/**
 * Google Apps Script — single endpoint for all Sheets operations.
 * Deploy: Web app, Execute as Me, Who has access: Anyone
 */

const SHEET_ID = 'ВАШ_ID_ТАБЛИЦЫ';
const ORDERS_SHEET = 'Заказы';
const SERVICES_SHEET = 'Услуги';
const KNOWLEDGE_SHEET = 'База_знаний';
const ANALYTICS_SHEET = 'Аналитика';
const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
const MASTER_SHEET_PREFIX = 'Мастер_';
const ORDER_HEADERS = [
  'Дата_создания', 'Имя', 'Фамилия', 'Телефон', 'Услуга', 'Цена', 'Время', 'Мастер', 'Дата',
  'userId', 'bookingId', 'status', 'remindedAt', 'confirmedAt',
];
const SERVICE_HEADERS = ['masterName', 'serviceId', 'name', 'price', 'active'];
const KNOWLEDGE_HEADERS = ['section', 'content', 'active', 'sortOrder'];
const ANALYTICS_HEADERS = ['createdAt', 'eventType', 'userId', 'language', 'message', 'reply', 'intent', 'result', 'meta'];
const DEFAULT_SERVICES = [
  { id: 'haircut_m', name: 'Мужская стрижка', price: 1200 },
  { id: 'haircut_f', name: 'Женская стрижка', price: 1800 },
  { id: 'coloring', name: 'Окрашивание', price: 3500 },
  { id: 'beard', name: 'Моделирование бороды', price: 800 },
  { id: 'styling', name: 'Укладка', price: 1000 },
];
const DEFAULT_MASTERS = ['Анна', 'Иван', 'Оксана'];
const DEFAULT_KNOWLEDGE_ROWS = [
  ['О салоне', 'Наш салон помогает быстро записаться на популярные услуги по волосам и уходу за образом. Основной фокус — аккуратные мужские и женские стрижки, окрашивание, моделирование бороды, укладки и прически.', 'true', 10],
  ['Как мы работаем', 'Запись проходит в несколько шагов: клиент выбирает мастера, затем услугу, оставляет имя и телефон, после чего выбирает свободное время. После подтверждения запись попадает в расписание мастера.', 'true', 20],
  ['График работы', 'График работы и свободные окна лучше всего смотреть через запись в боте: он показывает актуальные доступные слоты по мастерам.', 'true', 30],
  ['Оплата', 'Стоимость зависит от выбранной услуги и может уточняться до визита. Если нужен более точный расчёт по сложной услуге, лучше уточнить детали заранее.', 'true', 40],
  ['FAQ', 'Какие услуги есть в салоне? В салоне доступны мужские и женские стрижки, окрашивание, моделирование бороды, укладки и прически.', 'true', 50],
  ['FAQ', 'Как записаться? Записаться можно через бота: выбрать мастера, услугу, оставить имя и телефон, а потом подтвердить удобное время.', 'true', 60],
  ['FAQ', 'Можно ли отменить запись? Да, отмена доступна заранее через бот. Отменить запись можно не позднее чем за 2 часа до начала услуги.', 'true', 70],
  ['FAQ', 'Придёт ли напоминание о записи? Да, перед визитом клиенту может приходить напоминание с просьбой подтвердить запись.', 'true', 80],
  ['FAQ', 'Что будет, если не подтвердить запись? Если запись не подтверждена вовремя, слот может быть освобождён.', 'true', 90],
  ['FAQ', 'Почему бот просит телефон? Телефон нужен для подтверждения записи и удобной связи по визиту.', 'true', 100],
];

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'health';
  const params = e.parameter || {};
  return routeAction_(action, params);
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, message: 'Invalid JSON' });
  }
  return routeAction_(payload.action, payload);
}

function routeAction_(action, params) {
  if (action === 'health') return json({ ok: true, message: 'Barbershop Sheets API is running' });
  if (action === 'get_slots') return getSlots(params.masterName);
  if (action === 'get_schedule') return getSchedule(params.masterName);
  if (action === 'get_today_bookings') return getTodayBookings(params.masterName);
  if (action === 'get_services') return getServices(params.masterName);
  if (action === 'get_knowledge') return getKnowledge();
  if (action === 'get_client_bookings') return getClientBookings(params.userId);
  if (action === 'get_reminder_bookings') return getReminderBookings();
  if (action === 'get_unconfirmed_bookings') return getUnconfirmedBookings();
  if (action === 'book') return bookSlot(params);
  if (action === 'mark_vacation') return markVacation(params);
  if (action === 'save_service') return saveService(params);
  if (action === 'delete_service') return deleteService(params);
  if (action === 'cancel_booking') return cancelBooking(params);
  if (action === 'confirm_booking') return confirmBooking(params);
  if (action === 'release_booking') return releaseBooking(params);
  if (action === 'mark_reminder_sent') return markReminderSentAction_(params);
  if (action === 'log_assistant_event') return logAssistantEvent(params);
  return json({ ok: false, message: 'Unknown action' });
}

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

    const cellCol = timeCol + 1;
    const current = String(grid[dateRow][cellCol] || '').trim();
    if (!isCellFree_(current)) {
      return json({ ok: false, message: 'Slot is already booked' });
    }

    const bookingId = payload.bookingId || generateBookingId_();
    const status = 'Занято (' + payload.name + ' ' + payload.surname + ')';
    masterSheet.getRange(dateRow + 1, cellCol + 1).setValue(status);

    const rowObj = {
      'Дата_создания': new Date(),
      'Имя': payload.name,
      'Фамилия': payload.surname,
      'Телефон': payload.phone,
      'Услуга': payload.service,
      'Цена': payload.price || '',
      'Время': payload.time,
      'Мастер': payload.masterName,
      'Дата': payload.date,
      'userId': payload.userId || '',
      'bookingId': bookingId,
      'status': 'booked',
      'remindedAt': '',
      'confirmedAt': '',
    };
    appendOrderRow_(orders, rowObj);

    return json({ ok: true, message: 'Record added', bookingId: bookingId });
  } catch (err) {
    return json({ ok: false, message: 'Error: ' + err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function cancelBooking(payload) {
  if (!payload.bookingId) return json({ ok: false, message: 'Missing bookingId' });
  const booking = findBookingById_(payload.bookingId);
  if (!booking) return json({ ok: false, message: 'Booking not found' });
  if (payload.userId && String(booking.row['userId']) !== String(payload.userId)) {
    return json({ ok: false, message: 'Not allowed' });
  }
  if (!['booked', 'confirmed'].includes(String(booking.row.status || 'booked'))) {
    return json({ ok: false, message: 'Booking already cancelled or released' });
  }
  if (!canModifyBooking_(booking.row, 2)) {
    return json({ ok: false, message: 'Отмена возможна не позднее чем за 2 часа до записи' });
  }
  return finalizeBookingRelease_(booking, 'cancelled');
}

function confirmBooking(payload) {
  if (!payload.bookingId) return json({ ok: false, message: 'Missing bookingId' });
  const booking = findBookingById_(payload.bookingId);
  if (!booking) return json({ ok: false, message: 'Booking not found' });
  if (payload.userId && String(booking.row['userId']) !== String(payload.userId)) {
    return json({ ok: false, message: 'Not allowed' });
  }
  if (String(booking.row.status) === 'cancelled' || String(booking.row.status) === 'released') {
    return json({ ok: false, message: 'Booking is no longer active' });
  }
  updateOrderFields_(booking.sheet, booking.index, {
    status: 'confirmed',
    confirmedAt: new Date(),
  });
  return json({ ok: true, message: 'Booking confirmed' });
}

function releaseBooking(payload) {
  if (!payload.bookingId) return json({ ok: false, message: 'Missing bookingId' });
  const booking = findBookingById_(payload.bookingId);
  if (!booking) return json({ ok: false, message: 'Booking not found' });
  if (String(booking.row.status) !== 'booked') {
    return json({ ok: true, message: 'Already handled', skipped: true });
  }
  return finalizeBookingRelease_(booking, 'released');
}

function finalizeBookingRelease_(booking, status) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const masterSheet = getMasterSheet(ss, booking.row['Мастер']);
    if (!masterSheet) return json({ ok: false, message: 'Master sheet not found' });

    const grid = masterSheet.getDataRange().getValues();
    const timeHeaders = getTimeHeaders_(grid[0]);
    const timeCol = timeHeaders.indexOf(formatTimeHeader_(booking.row['Время']));
    const dateRow = findDateRow(grid, formatDate_(booking.row['Дата']));
    if (dateRow >= 0 && timeCol >= 0) {
      masterSheet.getRange(dateRow + 1, timeCol + 2).setValue('');
    }
    updateOrderFields_(booking.sheet, booking.index, { status: status });
    return json({ ok: true, message: 'Booking ' + status });
  } catch (err) {
    return json({ ok: false, message: 'Error: ' + err.message });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function getServices(masterName) {
  if (!masterName) return json({ ok: false, message: 'Missing masterName' });
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateServicesSheet(ss);
  seedDefaultServicesIfEmpty_(sheet, masterName);
  const rows = sheet.getDataRange().getValues();
  const services = [];
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== String(masterName)) continue;
    if (String(rows[i][4]).toLowerCase() === 'false') continue;
    services.push({
      id: String(rows[i][1]),
      name: String(rows[i][2]),
      price: Number(rows[i][3]) || 0,
    });
  }
  return json({ ok: true, services: services });
}

function getKnowledge() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateKnowledgeSheet(ss);
  seedDefaultKnowledgeIfEmpty_(sheet);
  const rows = sheet.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const active = String(rows[i][2] || 'true').toLowerCase() !== 'false';
    if (!active) continue;
    items.push({
      section: String(rows[i][0] || '').trim(),
      content: String(rows[i][1] || '').trim(),
      sortOrder: Number(rows[i][3]) || i,
    });
  }
  items.sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  const knowledge = items
    .map(function(item) {
      return item.section ? '## ' + item.section + '\n' + item.content : item.content;
    })
    .filter(String)
    .join('\n\n');
  return json({ ok: true, knowledge: knowledge, items: items });
}

function logAssistantEvent(payload) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateAnalyticsSheet(ss);
  appendAnalyticsRow_(sheet, {
    createdAt: new Date(),
    eventType: payload.eventType || 'assistant_message',
    userId: payload.userId || '',
    language: payload.language || '',
    message: payload.message || '',
    reply: payload.reply || '',
    intent: payload.intent || '',
    result: payload.result || '',
    meta: payload.meta || '',
  });
  return json({ ok: true });
}

function saveService(payload) {
  if (!payload.masterName || !payload.name || payload.price === undefined) {
    return json({ ok: false, message: 'Missing masterName, name or price' });
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateServicesSheet(ss);
  const serviceId = payload.serviceId || ('svc_' + Date.now());
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(payload.masterName) && String(rows[i][1]) === String(serviceId)) {
      sheet.getRange(i + 1, 3).setValue(payload.name);
      sheet.getRange(i + 1, 4).setValue(Number(payload.price) || 0);
      sheet.getRange(i + 1, 5).setValue('true');
      return json({ ok: true, serviceId: serviceId });
    }
  }
  sheet.appendRow([payload.masterName, serviceId, payload.name, Number(payload.price) || 0, 'true']);
  return json({ ok: true, serviceId: serviceId });
}

function deleteService(payload) {
  if (!payload.masterName || !payload.serviceId) {
    return json({ ok: false, message: 'Missing masterName or serviceId' });
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateServicesSheet(ss);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(payload.masterName) && String(rows[i][1]) === String(payload.serviceId)) {
      sheet.getRange(i + 1, 5).setValue('false');
      return json({ ok: true });
    }
  }
  return json({ ok: false, message: 'Service not found' });
}

function getClientBookings(userId) {
  if (!userId) return json({ ok: false, message: 'Missing userId' });
  const bookings = listActiveBookings_().filter((b) => String(b.userId) === String(userId));
  return json({ ok: true, bookings: bookings });
}

function getReminderBookings() {
  const tz = Session.getScriptTimeZone();
  const tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz, 'yyyy-MM-dd');
  const bookings = listActiveBookings_().filter((b) => {
    if (String(b.status) !== 'booked') return false;
    if (b.remindedAt) return false;
    return b.date === tomorrow;
  });
  return json({ ok: true, bookings: bookings });
}

function getUnconfirmedBookings() {
  const now = Date.now();
  const bookings = listActiveBookings_().filter((b) => {
    if (String(b.status) !== 'booked') return false;
    if (!b.remindedAt) return false;
    const slotMs = bookingDateTimeMs_(b.date, b.time);
    const diffHours = (slotMs - now) / 3600000;
    return diffHours <= 2 && diffHours > -24;
  });
  return json({ ok: true, bookings: bookings });
}

function markReminderSentAction_(payload) {
  if (!payload.bookingId) return json({ ok: false, message: 'Missing bookingId' });
  markReminderSent_(payload.bookingId);
  return json({ ok: true });
}

function markReminderSent_(bookingId) {
  const booking = findBookingById_(bookingId);
  if (!booking) return;
  updateOrderFields_(booking.sheet, booking.index, { remindedAt: new Date() });
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
      const cell = String(grid[r][c + 1] || '').trim();
      if (isCellFree_(cell) && !isSlotInPast_(date, time)) {
        slots.push({ date: date, time: time, label: formatLabel_(date, time) });
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
      slots.push({
        time: timeHeaders[c],
        status: String(grid[r][c + 1] || '').trim() || 'свободно',
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

function listActiveBookings_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = getOrCreateOrdersSheet(ss);
  const rows = orders.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(String);
  const bookings = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rowToObj_(headers, rows[i]);
    const status = String(row.status || 'booked');
    if (['cancelled', 'released'].includes(status)) continue;
    const date = formatDate_(row['Дата']);
    const time = formatTimeHeader_(row['Время']);
    if (!date || !time || isSlotInPast_(date, time)) continue;
    bookings.push({
      bookingId: String(row.bookingId || ''),
      name: row['Имя'],
      surname: row['Фамилия'],
      phone: row['Телефон'],
      service: row['Услуга'],
      price: row['Цена'],
      time: time,
      masterName: row['Мастер'],
      date: date,
      userId: row.userId,
      status: status,
      remindedAt: row.remindedAt || '',
      confirmedAt: row.confirmedAt || '',
      label: formatLabel_(date, time),
    });
  }
  return bookings.filter((b) => b.bookingId);
}

function findBookingById_(bookingId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = getOrCreateOrdersSheet(ss);
  const rows = orders.getDataRange().getValues();
  const headers = rows[0].map(String);
  for (let i = 1; i < rows.length; i++) {
    const row = rowToObj_(headers, rows[i]);
    if (String(row.bookingId) === String(bookingId)) {
      return { sheet: orders, index: i, row: row };
    }
  }
  return null;
}

function canModifyBooking_(row, minHours) {
  const date = formatDate_(row['Дата']);
  const time = formatTimeHeader_(row['Время']);
  const slotMs = bookingDateTimeMs_(date, time);
  return slotMs - Date.now() >= minHours * 3600000;
}

function bookingDateTimeMs_(date, time) {
  const tz = Session.getScriptTimeZone();
  return Utilities.parseDate(date + ' ' + time, tz, 'yyyy-MM-dd HH:mm').getTime();
}

function generateBookingId_() {
  return 'b_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function getOrCreateOrdersSheet(ss) {
  let sheet = ss.getSheetByName(ORDERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ORDERS_SHEET);
    sheet.appendRow(ORDER_HEADERS);
    return sheet;
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  ORDER_HEADERS.forEach((header) => {
    if (headers.indexOf(header) < 0) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });
  return sheet;
}

function appendOrderRow_(sheet, rowObj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = headers.map((h) => (rowObj[h] !== undefined ? rowObj[h] : ''));
  sheet.appendRow(row);
}

function updateOrderFields_(sheet, rowIndex, fields) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  Object.keys(fields).forEach((field) => {
    const col = headers.indexOf(field);
    if (col >= 0) sheet.getRange(rowIndex + 1, col + 1).setValue(fields[field]);
  });
}

function getOrCreateServicesSheet(ss) {
  let sheet = ss.getSheetByName(SERVICES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SERVICES_SHEET);
    sheet.appendRow(SERVICE_HEADERS);
  }
  return sheet;
}

function getOrCreateKnowledgeSheet(ss) {
  let sheet = ss.getSheetByName(KNOWLEDGE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(KNOWLEDGE_SHEET);
    sheet.appendRow(KNOWLEDGE_HEADERS);
  }
  return sheet;
}

function getOrCreateAnalyticsSheet(ss) {
  let sheet = ss.getSheetByName(ANALYTICS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ANALYTICS_SHEET);
    sheet.appendRow(ANALYTICS_HEADERS);
  }
  return sheet;
}

function seedDefaultServicesIfEmpty_(sheet, masterName) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(masterName)) return;
  }
  DEFAULT_SERVICES.forEach((service) => {
    sheet.appendRow([masterName, service.id, service.name, service.price, 'true']);
  });
}

function seedDefaultKnowledgeIfEmpty_(sheet) {
  if (sheet.getLastRow() > 1) return;
  DEFAULT_KNOWLEDGE_ROWS.forEach(function(row) {
    sheet.appendRow(row);
  });
}

function appendAnalyticsRow_(sheet, rowObj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(function(header) {
    return rowObj[header] !== undefined ? rowObj[header] : '';
  });
  sheet.appendRow(row);
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

function createMasterSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  }
  DEFAULT_MASTERS.forEach((name) => {
    const sheetName = MASTER_SHEET_PREFIX + name;
    let sheet = ss.getSheetByName(sheetName);
    if (sheet) ss.deleteSheet(sheet);
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(['Дата'].concat(TIME_SLOTS));
    for (let i = 0; i < TIME_SLOTS.length; i++) {
      sheet.getRange(1, i + 2).setValue(TIME_SLOTS[i]).setNumberFormat('@');
    }
    dates.forEach((date) => sheet.appendRow([date].concat(TIME_SLOTS.map(() => ''))));
  });
  getOrCreateOrdersSheet(ss);
  const services = getOrCreateServicesSheet(ss);
  const knowledge = getOrCreateKnowledgeSheet(ss);
  getOrCreateAnalyticsSheet(ss);
  DEFAULT_MASTERS.forEach((name) => seedDefaultServicesIfEmpty_(services, name));
  seedDefaultKnowledgeIfEmpty_(knowledge);
}

function initServicesSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateServicesSheet(ss);
  DEFAULT_MASTERS.forEach((name) => seedDefaultServicesIfEmpty_(sheet, name));
}

function initKnowledgeSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = getOrCreateKnowledgeSheet(ss);
  seedDefaultKnowledgeIfEmpty_(sheet);
}
