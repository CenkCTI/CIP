const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function findEndOfCentralDirectory(view: DataView) {
  const minimum = Math.max(0, view.byteLength - 65557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error("DOCX ZIP directory not found.");
}

async function inflateRaw(bytes: Uint8Array) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress DOCX content.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function extractZipEntry(buffer: ArrayBuffer, wantedName: string) {
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(view);
  const entries = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();

  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== ZIP_CENTRAL_SIGNATURE) {
      throw new Error("DOCX central directory is invalid.");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameBytes = new Uint8Array(buffer, cursor + 46, nameLength);
    const name = decoder.decode(nameBytes);

    if (name === wantedName) {
      if (view.getUint32(localOffset, true) !== ZIP_LOCAL_SIGNATURE) {
        throw new Error("DOCX local entry is invalid.");
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = new Uint8Array(buffer, dataOffset, compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRaw(compressed);
      throw new Error("DOCX compression method is not supported.");
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("word/document.xml was not found.");
}

export async function extractDocxPlainText(buffer: ArrayBuffer) {
  const xmlBytes = await extractZipEntry(buffer, "word/document.xml");
  const xmlText = new TextDecoder("utf-8").decode(xmlBytes);
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) {
    throw new Error("DOCX document XML could not be parsed.");
  }

  const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD_NS, "p")).map(
    (paragraph) => {
      const texts = Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t")).map(
        (node) => node.textContent ?? "",
      );
      return texts.join("");
    },
  );

  return paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function isDocxFile(mimeType: string, fileName: string) {
  return (
    mimeType.toLowerCase() ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  );
}
