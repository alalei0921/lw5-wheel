// Prepared adapter only: no demo import, localStorage access, UI, or automatic
// state migration. The database name/version/store/key remain compatible with v57.
export const dimensions = ['景色', '交通便利程度', '美食', '服务', '海水', '海洋生物', '酒店设施', '性价比'];
export const BACKUP_VERSION = 2;
export const MIGRATION_BACKUP_KEY = 'pre-3d-v1-backup';
const DATABASE = 'lw5-island-journal', STORE = 'journal', STATE_KEY = 'state';
const FORMAT = 'lw5-island-journal', MAX_IMPORT_RECORDS = 2000;
let databasePromise;

const failure = (code, message) => Object.assign(new Error(message), { code });
const emptyState = () => ({ revision: 0, records: [] });
const copy = value => structuredClone(value);

export const blankSubject = (kind = 'island') => ({
  id: crypto.randomUUID(), kind, name: '', ratings: Array(8).fill(null), note: ''
});

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DATABASE, 1);
    const fail = error => {
      if (settled) return;
      settled = true;
      databasePromise = undefined;
      reject(error);
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(failure('DATABASE_BLOCKED', '本地存档正被其他窗口占用，请关闭旧窗口后重试。'));
    request.onsuccess = () => {
      const database = request.result;
      if (settled) { database.close(); return; }
      if (!database.objectStoreNames.contains(STORE)) {
        database.close();
        fail(failure('INVALID_DATABASE', '本地存档结构异常，未修改任何记录。'));
        return;
      }
      settled = true;
      database.onversionchange = () => { database.close(); databasePromise = undefined; };
      database.onclose = () => { databasePromise = undefined; };
      resolve(database);
    };
  });
  return databasePromise;
}

// Read without normalization, validation, UUID generation, or backup creation.
// Even fields unknown to this version are returned exactly as stored by IDB.
export async function read() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readonly');
    const request = transaction.objectStore(STORE).get(STATE_KEY);
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result === undefined ? emptyState() : result);
    transaction.onabort = () => reject(transaction.error || failure('READ_FAILED', '本地存档读取失败。'));
    transaction.onerror = () => {};
  });
}

function validDate(value) {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateRecord(record, { minimum = 0 } = {}) {
  if (!record || typeof record.id !== 'string' || typeof record.island !== 'string' ||
      !record.island.trim() || record.island.length > 120 ||
      !validDate(record.start) || !validDate(record.end) ||
      (record.start && record.end && record.start > record.end) ||
      typeof record.note !== 'string' || record.note.length > 10000 ||
      !Array.isArray(record.subjects) || record.subjects.length < 1 || record.subjects.length > 50) {
    throw failure('INVALID_RECORD', '记录格式或旅行日期无效');
  }
  for (const subject of record.subjects) {
    if (!subject || !['island', 'hotel'].includes(subject.kind) ||
        typeof subject.name !== 'string' || subject.name.length > 120 ||
        (subject.kind === 'hotel' && !subject.name.trim()) ||
        typeof subject.note !== 'string' || subject.note.length > 10000 ||
        !Array.isArray(subject.ratings) || subject.ratings.length !== 8 ||
        Array.from(subject.ratings).some(value => value !== null &&
          (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > 5 || !Number.isInteger(value * 2)))) {
      throw failure('INVALID_RATING', '酒店名称或评分无效');
    }
    // v57 did not validate subject.id. Missing, repeated, or non-UUID legacy
    // values remain opaque and unchanged through every operation. New subjects
    // receive randomUUID() in blankSubject; existing subjects are never re-keyed.
  }
  for (const key of ['createdAt', 'updatedAt']) {
    if (typeof record[key] !== 'string' || !Number.isFinite(Date.parse(record[key]))) {
      throw failure('INVALID_TIMESTAMP', '记录时间无效');
    }
  }
  return record;
}

// Kept compatible with validate(record): returns the original record and does
// not strip unknown fields, trim strings, fill missing IDs, or change dates.
export function validate(record) { return validateRecord(record); }

function validateRecords(records, options) {
  if (!Array.isArray(records)) throw failure('INVALID_RECORDS', '记录列表格式无效');
  const ids = new Set();
  for (const record of records) {
    validateRecord(record, options);
    if (ids.has(record.id)) throw failure('DUPLICATE_RECORD_ID', '记录列表包含重复记录');
    ids.add(record.id);
  }
  return records;
}

function checkRevision(expected) {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER) {
    throw failure('INVALID_REVISION', '保存版本无效，未修改任何记录。');
  }
}

async function commit(expected, records, { restore = false } = {}) {
  checkRevision(expected);
  // Capture a detached input before opening any transaction or awaiting a DB.
  const snapshot = validateRecords(copy(records));
  const restoreKey = restore ? `pre-restore-v2-${crypto.randomUUID()}` : null;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.get(STATE_KEY);
    let reason;
    const abort = error => {
      reason = error;
      try { transaction.abort(); } catch { /* The transaction may already be aborted. */ }
    };
    transaction.oncomplete = () => resolve({ revision: expected + 1, backupKey: restoreKey });
    transaction.onerror = event => { reason ||= event.target.error || transaction.error; };
    transaction.onabort = () => reject(reason || transaction.error || failure('WRITE_FAILED', '本地保存失败，草稿仍保留。'));
    request.onsuccess = () => {
      try {
        const state = request.result === undefined ? emptyState() : request.result;
        if (!state || typeof state !== 'object' || Array.isArray(state) ||
            !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.records)) {
          throw failure('INVALID_STATE', '本地存档结构异常，未修改任何记录。');
        }
        if (state.revision !== expected) {
          throw failure('REVISION_CONFLICT', '另一窗口已修改存档，请保留草稿并刷新后重试。');
        }
        const existingBackup = store.getKey(MIGRATION_BACKUP_KEY);
        existingBackup.onsuccess = () => {
          try {
            // add() never overwrites. Backup(s) and state are one transaction:
            // a failed put/add or abort rolls every operation back together.
            if (existingBackup.result === undefined) store.add(state, MIGRATION_BACKUP_KEY);
            if (restoreKey) store.add(state, restoreKey);
            store.put({ ...state, revision: expected + 1, records: snapshot }, STATE_KEY);
          } catch (error) { abort(error); }
        };
      } catch (error) { abort(error); }
    };
  });
}

// No persistence occurs during draft editing, validation, merge, export, or
// parse. This explicit revision-checked call is the ordinary write boundary.
export async function write(expectedRevision, records) {
  return (await commit(expectedRevision, records)).revision;
}

// Safety API only; no UI invokes this adapter by itself. Pass a record array
// (for example parseBackup(text)), not an unchecked state object. Restores use a
// monotonically increasing revision and retain the entire pre-restore state at
// a unique, non-overwriting journal key. The first-upgrade backup is untouched.
export async function restore(expectedRevision, records) {
  return commit(expectedRevision, records, { restore: true });
}

export function parseBackup(text) {
  const backup = JSON.parse(text);
  if (!backup || backup.format !== FORMAT || ![1, 2].includes(backup.version) ||
      !Array.isArray(backup.records) || backup.records.length > MAX_IMPORT_RECORDS) {
    throw failure('INVALID_BACKUP', '不支持的备份格式');
  }
  // Keep all v57 subject-ID shapes. Only the rating range differs by version.
  return validateRecords(backup.records, { minimum: backup.version === 1 ? .5 : 0 });
}

// The return value is an object for JSON.stringify / Blob creation in a caller.
// Version 2 preserves the semantic difference between null and explicit 0.
export function exportBackup(records) {
  const snapshot = validateRecords(copy(records));
  return { format: FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), records: snapshot };
}

function comparable(record) {
  // Preserve v57 conflict semantics; differences in IDs/import bookkeeping alone
  // do not create another copy. All other, including unknown, fields participate.
  return JSON.stringify({ ...record, id: undefined, conflictOf: undefined, importedAt: undefined });
}

export function merge(local, incoming) {
  validateRecords(local);
  validateRecords(incoming);
  const result = copy(local), imported = copy(incoming), ids = new Set(result.map(record => record.id));
  for (const record of imported) {
    const old = result.find(item => item.id === record.id);
    if (!old) {
      result.push({ ...record, importedAt: new Date().toISOString() });
      ids.add(record.id);
    } else if (comparable(old) !== comparable(record) &&
               !result.some(item => item.conflictOf === record.id && comparable(item) === comparable(record))) {
      let id;
      for (let attempts = 0; attempts < 100; attempts++) {
        id = crypto.randomUUID();
        if (!ids.has(id)) break;
        id = undefined;
      }
      if (!id) throw failure('UUID_COLLISION', '无法生成唯一冲突副本标识，未修改本地记录。');
      ids.add(id);
      result.push({ ...record, id, conflictOf: record.id, importedAt: new Date().toISOString() });
    }
  }
  return result;
}
