import {
  SaveParseError,
  applyRecordEdits,
  canWriteStringSameSize,
  parseMecchaSave,
} from './saveParser.mjs';

const FIELD_KEYS = {
  playerName: 'CustomPlayerName',
  likes: 'eeyan',
  playersFound: 'ME',
};

const state = {
  fileName: '',
  originalBytes: null,
  parsed: null,
  fields: null,
  draft: {
    playerName: '',
    likes: '',
    playersFound: '',
  },
};

const el = {
  fileInput: document.querySelector('#fileInput'),
  status: document.querySelector('#status'),
  editorPanel: document.querySelector('#editorPanel'),
  fileName: document.querySelector('#fileName'),
  playerNameInput: document.querySelector('#playerNameInput'),
  playerNameHint: document.querySelector('#playerNameHint'),
  likesInput: document.querySelector('#likesInput'),
  playersFoundInput: document.querySelector('#playersFoundInput'),
  fieldProblems: document.querySelector('#fieldProblems'),
  backupButton: document.querySelector('#backupButton'),
  resetButton: document.querySelector('#resetButton'),
  saveButton: document.querySelector('#saveButton'),
};

el.fileInput.addEventListener('change', loadSelectedFile);
el.playerNameInput.addEventListener('input', updateDraftFromInputs);
el.likesInput.addEventListener('input', updateDraftFromInputs);
el.playersFoundInput.addEventListener('input', updateDraftFromInputs);
el.backupButton.addEventListener('click', downloadBackup);
el.resetButton.addEventListener('click', resetDrafts);
el.saveButton.addEventListener('click', saveEditedFile);

async function loadSelectedFile() {
  const file = el.fileInput.files?.[0];
  if (!file) return;

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseMecchaSave(bytes);
    const fields = getRequiredFields(parsed);

    state.fileName = file.name;
    state.originalBytes = bytes;
    state.parsed = parsed;
    state.fields = fields;
    state.draft.playerName = fields.playerName.string.value;
    state.draft.likes = String(fields.likes.int.value);
    state.draft.playersFound = String(fields.playersFound.int.value);

    renderEditor();
    setStatus(`Loaded ${file.name}.`, 'success');
  } catch (error) {
    resetState();
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  }
}

function getRequiredFields(parsed) {
  const byKey = new Map(parsed.records.map((record) => [record.key, record]));
  const playerName = byKey.get(FIELD_KEYS.playerName);
  const likes = byKey.get(FIELD_KEYS.likes);
  const playersFound = byKey.get(FIELD_KEYS.playersFound);

  const missing = [];
  if (!playerName) missing.push('player name');
  if (!likes) missing.push('likes received');
  if (!playersFound) missing.push('players found');

  if (missing.length) {
    throw new SaveParseError(`This save is missing: ${missing.join(', ')}.`);
  }

  return { playerName, likes, playersFound };
}

function renderEditor() {
  el.editorPanel.classList.remove('hidden');
  el.fileName.textContent = state.fileName;
  el.playerNameInput.value = state.draft.playerName;
  el.likesInput.value = state.draft.likes;
  el.playersFoundInput.value = state.draft.playersFound;

  const length = state.fields.playerName.string.stringByteLength;
  el.playerNameHint.textContent = `Must stay ${length} characters.`;
  updateActions();
}

function updateDraftFromInputs() {
  state.draft.playerName = el.playerNameInput.value;
  state.draft.likes = el.likesInput.value;
  state.draft.playersFound = el.playersFoundInput.value;
  updateActions();
}

function collectValidation() {
  if (!state.fields) return { ok: false, errors: ['No save loaded.'] };

  const errors = [];
  const nameLength = state.fields.playerName.string.stringByteLength;

  if (!canWriteStringSameSize(state.fields.playerName, state.draft.playerName)) {
    errors.push(`Player name must be exactly ${nameLength} characters.`);
  }

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

  el.backupButton.disabled = !loaded;
  el.resetButton.disabled = !loaded;
  el.saveButton.disabled = !loaded || !validation.ok;
  el.fieldProblems.innerHTML = validation.ok
    ? ''
    : validation.errors.map((error) => `<div>${escapeHtml(error)}</div>`).join('');
}

function collectEdits() {
  const edits = [];

  if (state.draft.playerName !== state.fields.playerName.string.value) {
    edits.push({ key: FIELD_KEYS.playerName, string: state.draft.playerName });
  }

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

function saveEditedFile() {
  if (!state.originalBytes || !state.parsed || !state.fileName) return;

  try {
    const validation = collectValidation();
    if (!validation.ok) throw new SaveParseError(validation.errors.join('\n'));

    const result = applyRecordEdits(state.originalBytes, state.parsed, collectEdits());
    const name = state.fileName.replace(/\.sav$/i, '') + '.edited.sav';
    downloadBytes(result.bytes, name, 'application/octet-stream');
    setStatus(`Downloaded ${name}.`, 'success');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error), 'danger');
  }
}

function downloadBackup() {
  if (!state.originalBytes || !state.fileName) return;
  downloadBytes(state.originalBytes, `${state.fileName}.bak`, 'application/octet-stream');
  setStatus('Backup downloaded.', 'success');
}

function resetDrafts() {
  if (!state.fields) return;

  state.draft.playerName = state.fields.playerName.string.value;
  state.draft.likes = String(state.fields.likes.int.value);
  state.draft.playersFound = String(state.fields.playersFound.int.value);
  renderEditor();
  setStatus('Changes reset.', 'muted');
}

function resetState() {
  state.fileName = '';
  state.originalBytes = null;
  state.parsed = null;
  state.fields = null;
  state.draft.playerName = '';
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
