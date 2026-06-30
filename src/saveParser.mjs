const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
const utf8Encoder = new TextEncoder();

export class SaveParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SaveParseError';
  }
}

function asBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError('Expected bytes.');
}

function viewOf(bytes) {
  const b = asBytes(bytes);
  return new DataView(b.buffer, b.byteOffset, b.byteLength);
}

function readI32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getInt32(offset, true);
}

function readU32(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return view.getUint32(offset, true);
}

function printable(text) {
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    if (code < 32 && char !== '\n' && char !== '\r' && char !== '\t') return false;
  }
  return true;
}

function readFString(bytes, offset, options = {}) {
  const b = asBytes(bytes);
  const view = viewOf(b);
  const allowEmpty = options.allowEmpty ?? true;
  const maxBytes = options.maxBytes ?? 4096;
  const length = readI32(view, offset);

  if (length === null) return null;
  if (length === 0) {
    if (!allowEmpty) return null;
    return {
      offset,
      text: '',
      textOffset: offset + 4,
      endOffset: offset + 4,
      encoding: 'empty',
      rawByteLength: 0,
    };
  }

  if (length < 0 || length > maxBytes) return null;
  const start = offset + 4;
  const end = start + length;
  if (end > b.length || length < 1 || b[end - 1] !== 0) return null;

  const raw = b.slice(start, end - 1);
  const text = utf8Decoder.decode(raw);
  if (!allowEmpty && !text) return null;
  if (!printable(text)) return null;

  return {
    offset,
    text,
    textOffset: start,
    endOffset: end,
    encoding: 'utf8',
    rawByteLength: raw.length,
  };
}

function readProperty(bytes, offset) {
  const b = asBytes(bytes);
  const view = viewOf(b);
  const name = readFString(b, offset, { allowEmpty: false, maxBytes: 512 });
  if (!name) return null;

  const type = readFString(b, name.endOffset, { allowEmpty: false, maxBytes: 128 });
  if (!type) return null;

  const sizeOffset = type.endOffset + 4;
  const size = readU32(view, sizeOffset);
  if (size === null || size > 65536) return null;

  const valueOffset = sizeOffset + 5;
  if (valueOffset + size > b.length) return null;

  if (type.text === 'IntProperty') {
    if (size !== 4) return null;
    return {
      propertyName: name.text,
      propertyType: type.text,
      value: view.getInt32(valueOffset, true),
      valueOffset,
      nextOffset: valueOffset + 4,
    };
  }

  if (type.text === 'DoubleProperty') {
    if (size !== 8) return null;
    return {
      propertyName: name.text,
      propertyType: type.text,
      value: view.getFloat64(valueOffset, true),
      valueOffset,
      nextOffset: valueOffset + 8,
    };
  }

  if (type.text === 'StrProperty') {
    const str = readFString(b, valueOffset, { allowEmpty: true, maxBytes: size + 8 });
    if (!str || str.endOffset !== valueOffset + size) return null;
    return {
      propertyName: name.text,
      propertyType: type.text,
      value: str.text,
      valueOffset,
      stringTextOffset: str.textOffset,
      stringByteLength: str.rawByteLength,
      stringEncoding: str.encoding,
      nextOffset: str.endOffset,
    };
  }

  return null;
}

function readNone(bytes, offset) {
  const value = readFString(bytes, offset, { allowEmpty: false, maxBytes: 32 });
  return value?.text === 'None' ? value : null;
}

function readRecord(bytes, offset) {
  const key = readFString(bytes, offset, { allowEmpty: false, maxBytes: 512 });
  if (!key) return null;
  if (key.text.startsWith('AsInt_') || key.text.startsWith('AsFloat_') || key.text.startsWith('AsString_')) return null;

  const int = readProperty(bytes, key.endOffset);
  if (!int || int.propertyType !== 'IntProperty' || !int.propertyName.startsWith('AsInt_')) return null;

  const double = readProperty(bytes, int.nextOffset);
  if (!double || double.propertyType !== 'DoubleProperty' || !double.propertyName.startsWith('AsFloat_')) return null;

  const string = readProperty(bytes, double.nextOffset);
  if (!string || string.propertyType !== 'StrProperty' || !string.propertyName.startsWith('AsString_')) return null;

  const none = readNone(bytes, string.nextOffset);
  if (!none) return null;

  return {
    key: key.text,
    startOffset: offset,
    endOffset: none.endOffset,
    int,
    double,
    string,
  };
}

export function parseMecchaSave(input) {
  const bytes = asBytes(input);
  if (bytes.length < 4 || bytes[0] !== 0x47 || bytes[1] !== 0x56 || bytes[2] !== 0x41 || bytes[3] !== 0x53) {
    throw new SaveParseError('This is not a valid Meccha Chameleon save file.');
  }

  const records = [];
  const seen = new Set();

  for (let offset = 0; offset < bytes.length - 16; offset += 1) {
    const record = readRecord(bytes, offset);
    if (!record) continue;

    const key = `${record.startOffset}:${record.endOffset}`;
    if (!seen.has(key)) {
      seen.add(key);
      records.push(record);
    }

    offset = record.endOffset - 1;
  }

  if (!records.length) {
    throw new SaveParseError('No editable save values were found.');
  }

  return { byteLength: bytes.length, records };
}

export function canWriteStringSameSize(record, value) {
  const encoded = utf8Encoder.encode(String(value));
  if (record.string.stringEncoding === 'empty') return encoded.length === 0;
  return record.string.stringEncoding === 'utf8' && encoded.length === record.string.stringByteLength;
}

function copyBytes(input) {
  return new Uint8Array(asBytes(input));
}

export function applyRecordEdits(originalBytes, parsed, edits) {
  const output = copyBytes(originalBytes);
  const view = viewOf(output);
  const byKey = new Map(parsed.records.map((record) => [record.key, record]));

  for (const edit of edits) {
    const record = byKey.get(edit.key);
    if (!record) throw new SaveParseError(`Missing save value: ${edit.key}.`);

    if (Object.prototype.hasOwnProperty.call(edit, 'int')) {
      const value = Number(edit.int);
      if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
        throw new SaveParseError(`${edit.key} must be a valid whole number.`);
      }
      view.setInt32(record.int.valueOffset, value, true);
    }

    if (Object.prototype.hasOwnProperty.call(edit, 'string')) {
      const encoded = utf8Encoder.encode(String(edit.string));
      if (!canWriteStringSameSize(record, edit.string)) {
        throw new SaveParseError(`${edit.key} must stay the same length.`);
      }
      output.set(encoded, record.string.stringTextOffset);
      if (record.string.stringEncoding === 'utf8') {
        output[record.string.stringTextOffset + encoded.length] = 0;
      }
    }
  }

  return { bytes: output };
}
