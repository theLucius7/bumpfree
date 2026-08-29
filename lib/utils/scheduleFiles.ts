import "server-only";

import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { inflateRawSync } from "node:zlib";

export const MAX_SCHEDULE_FILE_SIZE = 5 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_LENGTH = 100_000;
const MAX_WORKSHEETS = 20;
const MAX_SPREADSHEET_CELLS = 200_000;
const MAX_ZIP_ENTRIES = 2_000;
const MAX_ZIP_ENTRY_SIZE = 20 * 1024 * 1024;
const MAX_ZIP_TOTAL_SIZE = 25 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([".txt", ".html", ".htm", ".csv"]);

export async function extractScheduleFileText(file: File): Promise<string> {
    if (file.size <= 0) throw new Error("文件为空");
    if (file.size > MAX_SCHEDULE_FILE_SIZE) throw new Error("文件不能超过 5MB");

    const fileName = file.name.toLowerCase();
    const extension = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (extension === ".pdf" || file.type === "application/pdf") {
        throw new Error("暂不支持直接解析 PDF；请先在本地或可信 AI 工具中转为 UTF-8 文本，再粘贴或上传 TXT");
    } else if (
        extension === ".docx" ||
        file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
        if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
            throw new Error("文件内容不是有效的 DOCX");
        }
        assertSafeZipContainer(buffer);
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
    } else if (
        extension === ".xlsx" ||
        extension === ".xls" ||
        file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "application/vnd.ms-excel"
    ) {
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
        const isOle = buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
        if (!isZip && !isOle) throw new Error("文件内容不是有效的 Excel 工作簿");
        if (isZip) assertSafeZipContainer(buffer);
        text = extractSpreadsheetText(buffer);
    } else if (TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
        if (buffer.includes(0)) throw new Error("文本文件包含不支持的二进制内容");
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
        } catch {
            throw new Error("文本文件必须使用 UTF-8 编码");
        }
    } else {
        throw new Error("只支持 DOCX、XLSX、XLS、CSV、HTML 和 TXT 文件");
    }

    const normalized = text.replace(/^\uFEFF/, "").trim();
    if (!normalized) throw new Error("文件中没有可读取的文本");
    if (normalized.length > MAX_EXTRACTED_TEXT_LENGTH) {
        throw new Error("抽取后的文本超过 100,000 字符，请缩小文件后重试");
    }
    return normalized;
}

function assertSafeZipContainer(buffer: Buffer) {
    const minimumEocdSize = 22;
    const searchStart = Math.max(0, buffer.length - 65_557);
    let eocdOffset = -1;
    for (let offset = buffer.length - minimumEocdSize; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }
    if (eocdOffset < 0) throw new Error("压缩文件目录无效");

    const commentLength = buffer.readUInt16LE(eocdOffset + 20);
    if (eocdOffset + minimumEocdSize + commentLength !== buffer.length) {
        throw new Error("压缩文件结尾无效");
    }

    const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
    const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
    const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
        throw new Error("不支持分卷压缩的课表文件");
    }
    if (entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
        throw new Error("不支持 ZIP64 格式的课表文件");
    }
    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
    if (entryCount > MAX_ZIP_ENTRIES || centralDirectoryEnd > eocdOffset) {
        throw new Error("压缩文件目录过大或已损坏");
    }

    let position = centralDirectoryOffset;
    let totalUncompressedSize = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== 0x02014b50) {
            throw new Error("压缩文件目录已损坏");
        }
        const flags = buffer.readUInt16LE(position + 8);
        if ((flags & 0x1) !== 0) throw new Error("不支持加密的课表文件");
        const compressionMethod = buffer.readUInt16LE(position + 10);
        if (compressionMethod !== 0 && compressionMethod !== 8) throw new Error("压缩文件使用了不支持的压缩算法");

        const compressedSize = buffer.readUInt32LE(position + 20);
        const declaredUncompressedSize = buffer.readUInt32LE(position + 24);
        const localHeaderOffset = buffer.readUInt32LE(position + 42);
        if (compressedSize === 0xffffffff || declaredUncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
            throw new Error("不支持 ZIP64 格式的课表文件");
        }
        if (declaredUncompressedSize > MAX_ZIP_ENTRY_SIZE
            || totalUncompressedSize + declaredUncompressedSize > MAX_ZIP_TOTAL_SIZE) {
            throw new Error("压缩文件解压后过大");
        }

        const fileNameLength = buffer.readUInt16LE(position + 28);
        const extraLength = buffer.readUInt16LE(position + 30);
        const commentLength = buffer.readUInt16LE(position + 32);
        const nextPosition = position + 46 + fileNameLength + extraLength + commentLength;
        if (nextPosition > centralDirectoryEnd) throw new Error("压缩文件目录已损坏");

        const actualUncompressedSize = inflateAndMeasureZipEntry(
            buffer,
            localHeaderOffset,
            compressedSize,
            compressionMethod,
            Math.min(MAX_ZIP_ENTRY_SIZE, MAX_ZIP_TOTAL_SIZE - totalUncompressedSize),
        );
        if (actualUncompressedSize !== declaredUncompressedSize) {
            throw new Error("压缩文件声明的解压大小不正确");
        }
        totalUncompressedSize += actualUncompressedSize;
        if (actualUncompressedSize > MAX_ZIP_ENTRY_SIZE || totalUncompressedSize > MAX_ZIP_TOTAL_SIZE) {
            throw new Error("压缩文件解压后过大");
        }

        position = nextPosition;
    }
}

function inflateAndMeasureZipEntry(
    archive: Buffer,
    localHeaderOffset: number,
    compressedSize: number,
    expectedMethod: number,
    maxOutputLength: number,
): number {
    if (localHeaderOffset + 30 > archive.length || archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("压缩文件本地目录已损坏");
    }

    const localFlags = archive.readUInt16LE(localHeaderOffset + 6);
    const localMethod = archive.readUInt16LE(localHeaderOffset + 8);
    if ((localFlags & 0x1) !== 0 || localMethod !== expectedMethod) {
        throw new Error("压缩文件目录信息不一致");
    }

    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedSize;
    if (dataOffset > archive.length || dataEnd > archive.length) {
        throw new Error("压缩文件数据已损坏");
    }

    const compressed = archive.subarray(dataOffset, dataEnd);
    if (expectedMethod === 0) return compressed.length;

    try {
        return inflateRawSync(compressed, { maxOutputLength: Math.max(1, maxOutputLength) }).length;
    } catch {
        throw new Error("压缩文件解压后过大或已损坏");
    }
}

function extractSpreadsheetText(buffer: Buffer): string {
    let workbook: XLSX.WorkBook;
    try {
        workbook = XLSX.read(buffer, {
            type: "buffer",
            dense: true,
            sheetRows: 2_000,
            cellFormula: false,
            cellHTML: false,
            cellNF: false,
            cellStyles: false,
        });
    } catch {
        throw new Error("无法解析 Excel 工作簿");
    }

    if (workbook.SheetNames.length === 0) throw new Error("Excel 工作簿没有可读取的工作表");
    if (workbook.SheetNames.length > MAX_WORKSHEETS) throw new Error(`Excel 工作表不能超过 ${MAX_WORKSHEETS} 个`);

    let cellCount = 0;
    const chunks: string[] = [];
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet?.["!ref"]) continue;

        const range = XLSX.utils.decode_range(sheet["!ref"]);
        cellCount += (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1);
        if (cellCount > MAX_SPREADSHEET_CELLS) {
            throw new Error(`Excel 有效单元格范围不能超过 ${MAX_SPREADSHEET_CELLS.toLocaleString("en-US")} 格`);
        }

        const rows = XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false }).trim();
        if (rows) chunks.push(`# Sheet: ${sheetName.slice(0, 80)}\n${rows}`);
        if (chunks.join("\n\n").length > MAX_EXTRACTED_TEXT_LENGTH) {
            throw new Error("抽取后的文本超过 100,000 字符，请缩小文件后重试");
        }
    }

    return chunks.join("\n\n");
}
