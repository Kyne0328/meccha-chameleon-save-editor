import {
  SaveParseError,
  applyRecordEdits,
  parseMecchaSave,
} from './saveParser.mjs';

const FIELD_KEYS = {
  likes: 'eeyan',
  playersFound: 'ME',
};

const supportsFileSystemAccess = 'showOpenFilePicker' in window;

const state = {
  loadId: 0,
  fileName: '',
  fileHandle: null,
  originalBytes: null,
  parsed: null,
  fields: null,
  draft: {
    likes: '',
    playersFound: '',
  },
};

const el = {
  fileInput: document.querySelector('#fileInput'),
  dropzone: document.querySelector('#dropzone'),
  openDirectButton: document.querySelector('#openDirectButton'),
  directSupportHint: document.querySelector('#directSupportHint'),
  copyPathButton: document.querySelector('#copyPathButton'),
  saveFolderPath: document.querySelector('#saveFolderPath'),
  status: document.querySelector('#status'),
  editorPanel: document.querySelector('#editorPanel'),
  fileName: document.querySelector('#fileName'),
  likesInput: document.querySelector('#likesInput'),
  playersFoundInput: document.querySelector('#playersFoundInput'),
  fieldProblems: document.querySelector('#fieldProblems'),
  backupButton: document.querySelector('#backupButton'),
  resetButton: document.querySelector('#resetButton'),
  downloadButton: document.querySelector('#downloadButton'),
  saveDirectButton: document.querySelector('#saveDirectButton'),
};

el.openDirectButton.addEventListener('click', openSaveDirectly);
el.fileInput.addEventListener('change', loadSelectedFile);
el.dropzone.addEventListener('dragover', onDragOver);
el.dropzone.addEventListener('dragleave', onDragLeave);
el.dropzone.addEventListener('drop', onDrop);
el.copyPathButton.addEventListener('click', copySaveFolderPath);
el.likesInput.addEventListener('input', updateDraftFromInputs);
el.playersFoundInput.addEventListener('input', updateDraftFromInputs);
el.backupButton.addEventListener('click', downloadBackup);
el.resetButton.addEventListener('click', resetDrafts);
el.downloadButton.addEventListener('click', downloadEditedFile);
el.saveDirectButton.addEventListener('click', saveDirectly);

renderFileSystemSupport();

function renderFileSystemSupport() {
  if (supportsFileSystemAccess) {
    el.directSupportHint.textContent = 'Recommended: writes back into the same save file. No copy/replace needed.';
    return;
  }

  el.openDirectButton.disabled = true;
  el.directSupportHint.textContent = 'Direct save is only supported in Chrome or Edge. Use the fallback upload/download method in this browser.';
}

async function openSaveDirectly() {
  if (!supportsFileSystemAccess) return;

  try {
    const [handle] = await window.showOpenFilePicker({
      multiple: false,
      types: [
        {
          description: 'Meccha Chameleon save file',
          accept: {
            'application/octet-stream': ['.sav'],
          },
        },
      ],
    });

    const file = await handle.getFile();
    await loadFile(file, handle);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  }
}

async function loadSelectedFile() {
  const file = el.fileInput.files?.[0];
  if (!file) return;
  await loadFile(file, null);
}

async function loadFile(file, fileHandle) {
  const loadId = state.loadId + 1;
  state.loadId = loadId;
  setStatus(`Loading ${file.name}...`, 'muted');

  try {
    validateSaveFileName(file.name);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (loadId !== state.loadId) return;

    const parsed = parseMecchaSave(bytes);
    const fields = getRequiredFields(parsed);

    state.fileName = file.name;
    state.fileHandle = fileHandle;
    state.originalBytes = bytes;
    state.parsed = parsed;
    state.fields = fields;
    state.draft.likes = String(fields.likes.int.value);
    state.draft.playersFound = String(fields.playersFound.int.value);

    renderEditor();
    setStatus(
      fileHandle
        ? `Loaded ${file.name}. Direct save is available.`
        : `Loaded ${file.name}. Fallback mode: download the edited file and replace it manually.`,
      'success',
    );
  } catch (error) {
    if (loadId !== state.loadId) return;
    resetState();
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  } finally {
    el.fileInput.value = '';
  }
}

function validateSaveFileName(name) {
  if (!name.startsWith('cLeon_Default_') || !name.toLowerCase().endsWith('.sav')) {
    throw new SaveParseError('Select the save file that starts with cLeon_Default_ and ends with .sav.');
  }
}

function onDragOver(event) {
  event.preventDefault();
  el.dropzone.classList.add('dragging');
}

function onDragLeave(event) {
  event.preventDefault();
  el.dropzone.classList.remove('dragging');
}

async function onDrop(event) {
  event.preventDefault();
  el.dropzone.classList.remove('dragging');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  await loadFile(file, null);
}

async function copySaveFolderPath() {
  const path = el.saveFolderPath.textContent.trim();
  try {
    await navigator.clipboard.writeText(path);
    setStatus('Save folder path copied.', 'success');
  } catch {
    setStatus(`Copy this path manually: ${path}`, 'muted');
  }
}

function getRequiredFields(parsed) {
  const byKey = new Map(parsed.records.map((record) => [record.key, record]));
  const likes = byKey.get(FIELD_KEYS.likes);
  const playersFound = byKey.get(FIELD_KEYS.playersFound);

  const missing = [];
  if (!likes) missing.push('likes received');
  if (!playersFound) missing.push('players found');

  if (missing.length) {
    throw new SaveParseError(`This save is missing: ${missing.join(', ')}.`);
  }

  return { likes, playersFound };
}

function renderEditor() {
  el.editorPanel.classList.remove('hidden');
  el.fileName.textContent = state.fileHandle
    ? `${state.fileName} · direct save enabled`
    : `${state.fileName} · fallback download mode`;
  el.likesInput.value = state.draft.likes;
  el.playersFoundInput.value = state.draft.playersFound;
  updateActions();
}

function updateDraftFromInputs() {
  state.draft.likes = el.likesInput.value;
  state.draft.playersFound = el.playersFoundInput.value;
  updateActions();
}

function collectValidation() {
  if (!state.fields) return { ok: false, errors: ['No save loaded.'] };

  const errors = [];
  validateWholeNumber(state.draft.likes, 'Likes received', errors);
  validateWholeNumber(state.draft.playersFound, 'Players found', errors);

  return { ok: errors.length === 0, errors };
}

function validateWholeNumber(value, label, errors) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 2147483647) {
    errors.push(`${label} must be a whole number from 0 to 2147483647.`);
  }
}

function updateActions() {
  const loaded = Boolean(state.fields && state.originalBytes && state.parsed);
  const validation = collectValidation();
  const canSave = loaded && validation.ok;

  el.backupButton.disabled = !loaded;
  el.resetButton.disabled = !loaded;
  el.downloadButton.disabled = !canSave;
  el.saveDirectButton.disabled = !canSave || !state.fileHandle;
  el.fieldProblems.innerHTML = validation.ok
    ? ''
    : validation.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join('');
}

function collectEdits() {
  const edits = [];

  const likes = Number(state.draft.likes);
  if (likes !== state.fields.likes.int.value) {
    edits.push({ key: FIELD_KEYS.likes, int: likes });
  }

  const playersFound = Number(state.draft.playersFound);
  if (playersFound !== state.fields.playersFound.int.value) {
    edits.push({ key: FIELD_KEYS.playersFound, int: playersFound });
  }

  return edits;
}

function buildEditedBytes() {
  const validation = collectValidation();
  if (!validation.ok) throw new SaveParseError(validation.errors.join('\n'));
  return applyRecordEdits(state.originalBytes, state.parsed, collectEdits()).bytes;
}

async function saveDirectly() {
  if (!state.fileHandle || !state.originalBytes || !state.parsed || !state.fileName) return;

  try {
    const editedBytes = buildEditedBytes();
    const hasPermission = await verifyWritePermission(state.fileHandle);
    if (!hasPermission) {
      throw new SaveParseError('Browser permission was denied. Use Download edited save instead.');
    }

    const writable = await state.fileHandle.createWritable();
    await writable.write(editedBytes);
    await writable.close();
    acceptEditedBytes(editedBytes);
    setStatus(
      `Saved directly to ${state.fileName}. Go back to the game, join as hunter, and find at least one hider so the game saves the patched values.`,
      'success',
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  }
}

function downloadEditedFile() {
  if (!state.originalBytes || !state.parsed || !state.fileName) return;

  try {
    const editedBytes = buildEditedBytes();
    downloadBytes(editedBytes, state.fileName, 'application/octet-stream');
    setStatus(
      `Downloaded ${state.fileName}. Replace the file in SaveGames, then join as hunter and find at least one hider so the game saves the patched values.`,
      'success',
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  }
}

async function verifyWritePermission(fileHandle) {
  const options = { mode: 'readwrite' };
  if ((await fileHandle.queryPermission(options)) === 'granted') return true;
  return (await fileHandle.requestPermission(options)) === 'granted';
}

function acceptEditedBytes(bytes) {
  const reparsed = parseMecchaSave(bytes);
  const fields = getRequiredFields(reparsed);

  state.originalBytes = bytes;
  state.parsed = reparsed;
  state.fields = fields;
  state.draft.likes = String(fields.likes.int.value);
  state.draft.playersFound = String(fields.playersFound.int.value);
  renderEditor();
}

function downloadBackup() {
  if (!state.originalBytes || !state.fileName) return;
  downloadBytes(state.originalBytes, `${state.fileName}.bak`, 'application/octet-stream');
  setStatus('Backup downloaded.', 'success');
}

function resetDrafts() {
  if (!state.fields) return;

  state.draft.likes = String(state.fields.likes.int.value);
  state.draft.playersFound = String(state.fields.playersFound.int.value);
  renderEditor();
  setStatus('Changes reset.', 'muted');
}

function resetState() {
  state.fileName = '';
  state.fileHandle = null;
  state.originalBytes = null;
  state.parsed = null;
  state.fields = null;
  state.draft.likes = '';
  state.draft.playersFound = '';
  el.editorPanel.classList.add('hidden');
  updateActions();
}

function downloadBytes(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setStatus(message, kind) {
  el.status.textContent = message;
  el.status.className = `status ${kind}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
