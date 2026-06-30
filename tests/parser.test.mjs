import assert from 'node:assert/strict';
import {
  applyRecordEdits,
  canWriteStringSameSize,
  parseMecchaSave,
} from '../src/saveParser.mjs';

const encoder = new TextEncoder();

function u32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return [...bytes];
}

function i32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setInt32(0, value, true);
  return [...bytes];
}

function f64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, true);
  return [...bytes];
}

function fstring(value) {
  const raw = encoder.encode(value);
  return [...i32(raw.length + 1), ...raw, 0];
}

function property(name, type, data) {
  return [
    ...fstring(name),
    ...fstring(type),
    ...u32(0),
    ...u32(data.length),
    0,
    ...data,
  ];
}

function record(key, intValue, stringValue) {
  return [
    ...fstring(key),
    ...property('AsInt_8_A640FFCE409AFCC01329F7A55D53F9A3', 'IntProperty', i32(intValue)),
    ...property('AsFloat_9_77D022674D66921387AFF694BE681EAE', 'DoubleProperty', f64(0)),
    ...property('AsString_6_62B18A534B77387E6EDDE9962094506B', 'StrProperty', stringValue === '' ? i32(0) : fstring(stringValue)),
    ...fstring('None'),
  ];
}

function saveFixture() {
  return new Uint8Array([
    0x47, 0x56, 0x41, 0x53,
    ...u32(3), ...u32(522), ...u32(1017), ...u32(0),
    ...record('CustomPlayerName', 0, 'KyneKuni'),
    ...record('eeyan', 12, ''),
    ...record('ME', 5, ''),
  ]);
}

const original = saveFixture();
const parsed = parseMecchaSave(original);

assert.equal(parsed.records.length, 3);
assert.equal(parsed.records.find((item) => item.key === 'CustomPlayerName').string.value, 'KyneKuni');
assert.equal(parsed.records.find((item) => item.key === 'eeyan').int.value, 12);
assert.equal(parsed.records.find((item) => item.key === 'ME').int.value, 5);

const name = parsed.records.find((item) => item.key === 'CustomPlayerName');
assert.equal(canWriteStringSameSize(name, 'TestName'), true);
assert.equal(canWriteStringSameSize(name, 'TooLongName'), false);

const edited = applyRecordEdits(original, parsed, [
  { key: 'CustomPlayerName', string: 'TestName' },
  { key: 'eeyan', int: 999 },
  { key: 'ME', int: 77 },
]);

const reparsed = parseMecchaSave(edited.bytes);
assert.equal(reparsed.records.find((item) => item.key === 'CustomPlayerName').string.value, 'TestName');
assert.equal(reparsed.records.find((item) => item.key === 'eeyan').int.value, 999);
assert.equal(reparsed.records.find((item) => item.key === 'ME').int.value, 77);
assert.equal(edited.bytes.length, original.length);

assert.throws(() => parseMecchaSave(new Uint8Array([1, 2, 3, 4])), /valid Meccha/);

console.log('parser tests passed');
