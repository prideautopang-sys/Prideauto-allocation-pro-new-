import React, { useState, useRef, useEffect } from 'react';
import { Car, CarStatus } from '../types';
import { XIcon, DocumentDownloadIcon, ArchiveInIcon, ExclamationIcon } from './icons';

// Declare XLSX global from the CDN script
declare var XLSX: any;

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCars?: Car[];
}

interface ParsedRowItem {
  rowNumber: number;
  car: Car;
}

interface DuplicateRowItem {
  rowNumber: number;
  car: Car;
  reasons: string[];
}

interface ValidationErrorItem {
  rowNumber: number;
  message: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad2 = (n: number) => String(n).padStart(2, '0');

const cleanOptional = (val: unknown): string => {
  if (val === undefined || val === null) return '';
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '-' || trimmed.toUpperCase() === 'N/A') return '';
  return trimmed;
};

const normalizeKey = (val: unknown): string => {
  const cleaned = cleanOptional(val);
  return cleaned ? cleaned.toUpperCase() : '';
};

const normalizeHeader = (val: unknown): string => {
  return String(val ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, '');
};

const formatDateParts = (year: number, month: number, day: number): string | null => {
  if (year > 2400) year -= 543; // Handle Thai Buddhist Era year if provided
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() + 1 !== month ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

// Parse Excel serial dates, MM/DD/YY, DD/MM/YYYY, YYYY-MM-DD, DD-MMM-YY without timezone shifts
const parseExcelDate = (rawValue: unknown): string | null => {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return formatDateParts(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
  }

  if (typeof rawValue === 'number' && !isNaN(rawValue)) {
    const utcDays = Math.floor(rawValue - 25569);
    const dateInfo = new Date(utcDays * 86400 * 1000);
    return `${dateInfo.getUTCFullYear()}-${pad2(dateInfo.getUTCMonth() + 1)}-${pad2(dateInfo.getUTCDate())}`;
  }

  if (rawValue instanceof Date && !isNaN(rawValue.getTime())) {
    return `${rawValue.getFullYear()}-${pad2(rawValue.getMonth() + 1)}-${pad2(rawValue.getDate())}`;
  }

  const str = String(rawValue).trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // MM/DD/YY, MM/DD/YYYY, DD/MM/YY, DD/MM/YYYY
  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);
    if (year < 100) year += 2000;

    // BYD Excel export uses MM/DD/YY (e.g. 11/18/26). If first part > 12, treat as DD/MM.
    const month = p1 > 12 ? p2 : p1;
    const day = p1 > 12 ? p1 : p2;
    return formatDateParts(year, month, day);
  }

  // DD-MMM-YY or DD-MMM-YYYY (e.g. 18-Nov-26)
  const textMonthMatch = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (textMonthMatch) {
    const day = Number(textMonthMatch[1]);
    const month = MONTH_MAP[textMonthMatch[2].toLowerCase()];
    let year = Number(textMonthMatch[3]);
    if (year < 100) year += 2000;
    if (month) {
      return formatDateParts(year, month, day);
    }
  }

  // Fallback
  const fallback = new Date(str);
  if (!isNaN(fallback.getTime())) {
    return formatDateParts(fallback.getFullYear(), fallback.getMonth() + 1, fallback.getDate());
  }

  return null;
};

type ColumnMap = {
  no?: number;
  dealerCode?: number;
  dealerName?: number;
  model?: number;
  vin?: number;
  frontMotorNo?: number;
  rearMotorNo1?: number;
  rearMotorNo2?: number;
  batteryNo?: number;
  engineNo?: number;
  color?: number;
  carType?: number;
  allocationDate?: number;
  poType?: number;
  price?: number;
};

const HEADER_ALIASES: Record<string, keyof ColumnMap> = {
  no: 'no',
  dealercode: 'dealerCode',
  dealername: 'dealerName',
  model: 'model',
  vinno: 'vin',
  vin: 'vin',
  frontmotorno: 'frontMotorNo',
  frontmotor: 'frontMotorNo',
  rearmotorno1: 'rearMotorNo1',
  rearmotorno: 'rearMotorNo1',
  rearmotor: 'rearMotorNo1',
  rearmotorno2: 'rearMotorNo2',
  batteryno: 'batteryNo',
  battery: 'batteryNo',
  engineno: 'engineNo',
  engine: 'engineNo',
  color: 'color',
  cartype: 'carType',
  allocationdate: 'allocationDate',
  allocdate: 'allocationDate',
  potype: 'poType',
  price: 'price',
  sumofprice: 'price',
};

const detectHeaderRow = (rows: any[][]): { headerRowIndex: number; colMap: ColumnMap } | null => {
  const maxScan = Math.min(rows.length, 25);
  for (let r = 0; r < maxScan; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const colMap: ColumnMap = {};
    let matchedCount = 0;

    for (let c = 0; c < row.length; c++) {
      const normalized = normalizeHeader(row[c]);
      if (!normalized) continue;
      const field = HEADER_ALIASES[normalized];
      if (field && colMap[field] === undefined) {
        colMap[field] = c;
        matchedCount++;
      }
    }

    if (colMap.vin !== undefined && matchedCount >= 3) {
      return { headerRowIndex: r, colMap };
    }
  }
  return null;
};

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onSuccess, existingCars = [] }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  const [validRows, setValidRows] = useState<ParsedRowItem[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<DuplicateRowItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationErrorItem[]>([]);
  const [parseFatalError, setParseFatalError] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ type: 'success' | 'error'; message: string }[]>([]);

  const resetModalState = () => {
    setFile(null);
    setIsParsing(false);
    setIsUploading(false);
    setProgress(0);
    setUploadDone(false);
    setValidRows([]);
    setDuplicateRows([]);
    setValidationErrors([]);
    setParseFatalError(null);
    setLogs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!isOpen) {
      resetModalState();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const parseAndValidateFile = async (selectedFile: File) => {
    setIsParsing(true);
    setParseFatalError(null);
    setValidRows([]);
    setDuplicateRows([]);
    setValidationErrors([]);
    setLogs([]);
    setProgress(0);
    setUploadDone(false);

    try {
      // Fetch latest cars from API so duplicate checking against DB is always up-to-date
      let latestCars: Car[] = existingCars;
      try {
        const token = localStorage.getItem('authToken');
        if (token) {
          const res = await fetch('/api/cars', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            latestCars = await res.json();
          }
        }
      } catch {
        // Fallback to existingCars prop if network fetch fails
      }

      const dbVinSet = new Set<string>();
      const dbFrontMotorSet = new Set<string>();
      const dbRearMotorSet = new Set<string>();
      const dbBatterySet = new Set<string>();
      const dbEngineSet = new Set<string>();

      for (const c of latestCars) {
        const v = normalizeKey(c.vin);
        const fm = normalizeKey(c.frontMotorNo);
        const rm = normalizeKey(c.rearMotorNo);
        const bt = normalizeKey(c.batteryNo);
        const en = normalizeKey(c.engineNo);
        if (v) dbVinSet.add(v);
        if (fm) dbFrontMotorSet.add(fm);
        if (rm) dbRearMotorSet.add(rm);
        if (bt) dbBatterySet.add(bt);
        if (en) dbEngineSet.add(en);
      }

      const buffer = await selectedFile.arrayBuffer();
      const data = new Uint8Array(buffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setParseFatalError('ไม่พบชีตข้อมูลในไฟล์ Excel');
        setIsParsing(false);
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const detected = detectHeaderRow(jsonData);
      if (!detected) {
        setParseFatalError('ไม่พบหัวตารางที่รองรับในไฟล์ Excel (ต้องมีคอลัมน์ Dealer Code, Model, VIN No. เป็นต้น)');
        setIsParsing(false);
        return;
      }

      const { headerRowIndex, colMap } = detected;

      const fileVinMap = new Map<string, number>();
      const fileFrontMotorMap = new Map<string, number>();
      const fileRearMotorMap = new Map<string, number>();
      const fileBatteryMap = new Map<string, number>();
      const fileEngineMap = new Map<string, number>();

      const nextValidRows: ParsedRowItem[] = [];
      const nextDuplicateRows: DuplicateRowItem[] = [];
      const nextValidationErrors: ValidationErrorItem[] = [];

      const getCell = (row: any[], colIdx?: number): unknown => {
        if (colIdx === undefined) return '';
        return row[colIdx];
      };

      for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!Array.isArray(row)) continue;

        const hasAnyValue = row.some((cell) => String(cell ?? '').trim() !== '');
        if (!hasAnyValue) continue;

        const rawNo = String(getCell(row, colMap.no) ?? '').trim();
        const dealerCode = String(getCell(row, colMap.dealerCode) ?? '').trim();
        const dealerName = String(getCell(row, colMap.dealerName) ?? '').trim();
        const model = String(getCell(row, colMap.model) ?? '').trim();
        const vin = String(getCell(row, colMap.vin) ?? '').trim();

        // Skip summary rows such as TOTAL / รวม
        const summaryMarker = [rawNo, dealerCode, dealerName, vin].some((val) =>
          /^(total|grand total|รวม)$/i.test(val)
        );
        if (summaryMarker && !vin) continue;
        if (!dealerCode && !dealerName && !model && !vin) continue;

        const rowNumber = i + 1;

        const frontMotorNo = cleanOptional(getCell(row, colMap.frontMotorNo));
        const rm1 = cleanOptional(getCell(row, colMap.rearMotorNo1));
        const rm2 = cleanOptional(getCell(row, colMap.rearMotorNo2));
        const rearMotorNo = rm1 && rm2 && rm1 !== rm2 ? `${rm1} / ${rm2}` : rm1 || rm2 || '';
        const batteryNo = cleanOptional(getCell(row, colMap.batteryNo));
        const engineNo = cleanOptional(getCell(row, colMap.engineNo));
        const color = String(getCell(row, colMap.color) ?? '').trim();
        const carType = cleanOptional(getCell(row, colMap.carType));
        const rawAllocDate = getCell(row, colMap.allocationDate);
        const poType = cleanOptional(getCell(row, colMap.poType));
        const rawPrice = getCell(row, colMap.price);

        const missingFields: string[] = [];
        if (!dealerCode) missingFields.push('Dealer Code');
        if (!dealerName) missingFields.push('Dealer Name');
        if (!model) missingFields.push('Model');
        if (!vin) missingFields.push('VIN No.');
        if (!color) missingFields.push('COLOR');

        if (missingFields.length > 0) {
          nextValidationErrors.push({
            rowNumber,
            message: `ข้อมูลไม่ครบ (${missingFields.join(', ')})`,
          });
          continue;
        }

        const allocationDate = parseExcelDate(rawAllocDate);
        if (!allocationDate) {
          nextValidationErrors.push({
            rowNumber,
            message: `รูปแบบวันที่ไม่ถูกต้อง (${String(rawAllocDate)})`,
          });
          continue;
        }

        const numericPrice =
          typeof rawPrice === 'number'
            ? rawPrice
            : parseFloat(String(rawPrice ?? '0').replace(/[,\s฿]/g, '') || '0');
        const price = isNaN(numericPrice) ? 0 : numericPrice;

        const car: Car = {
          dealerCode,
          dealerName,
          model,
          vin,
          frontMotorNo,
          rearMotorNo,
          batteryNo,
          engineNo,
          color,
          carType,
          allocationDate,
          poType,
          price,
          status: CarStatus.WAITING_FOR_TRAILER,
        };

        // Check duplicates against system DB & earlier rows in the same Excel file
        const dupReasons: string[] = [];
        const vinKey = normalizeKey(vin);
        const fmKey = normalizeKey(frontMotorNo);
        const rmKey = normalizeKey(rearMotorNo);
        const btKey = normalizeKey(batteryNo);
        const enKey = normalizeKey(engineNo);

        if (vinKey) {
          if (dbVinSet.has(vinKey)) {
            dupReasons.push(`VIN (${vin}) มีอยู่ในระบบแล้ว`);
          } else if (fileVinMap.has(vinKey)) {
            dupReasons.push(`VIN (${vin}) ซ้ำกับแถวที่ ${fileVinMap.get(vinKey)} ในไฟล์เดียวกัน`);
          }
        }

        if (enKey) {
          if (dbEngineSet.has(enKey)) {
            dupReasons.push(`Engine No. (${engineNo}) มีอยู่ในระบบแล้ว`);
          } else if (fileEngineMap.has(enKey)) {
            dupReasons.push(`Engine No. (${engineNo}) ซ้ำกับแถวที่ ${fileEngineMap.get(enKey)} ในไฟล์เดียวกัน`);
          }
        }

        if (btKey) {
          if (dbBatterySet.has(btKey)) {
            dupReasons.push(`Battery No. (${batteryNo}) มีอยู่ในระบบแล้ว`);
          } else if (fileBatteryMap.has(btKey)) {
            dupReasons.push(`Battery No. (${batteryNo}) ซ้ำกับแถวที่ ${fileBatteryMap.get(btKey)} ในไฟล์เดียวกัน`);
          }
        }

        if (fmKey) {
          if (dbFrontMotorSet.has(fmKey)) {
            dupReasons.push(`Front Motor No. (${frontMotorNo}) มีอยู่ในระบบแล้ว`);
          } else if (fileFrontMotorMap.has(fmKey)) {
            dupReasons.push(`Front Motor No. (${frontMotorNo}) ซ้ำกับแถวที่ ${fileFrontMotorMap.get(fmKey)} ในไฟล์เดียวกัน`);
          }
        }

        if (rmKey) {
          if (dbRearMotorSet.has(rmKey)) {
            dupReasons.push(`Rear Motor No. (${rearMotorNo}) มีอยู่ในระบบแล้ว`);
          } else if (fileRearMotorMap.has(rmKey)) {
            dupReasons.push(`Rear Motor No. (${rearMotorNo}) ซ้ำกับแถวที่ ${fileRearMotorMap.get(rmKey)} ในไฟล์เดียวกัน`);
          }
        }

        if (dupReasons.length > 0) {
          nextDuplicateRows.push({ rowNumber, car, reasons: dupReasons });
          continue;
        }

        if (vinKey) fileVinMap.set(vinKey, rowNumber);
        if (fmKey) fileFrontMotorMap.set(fmKey, rowNumber);
        if (rmKey) fileRearMotorMap.set(rmKey, rowNumber);
        if (btKey) fileBatteryMap.set(btKey, rowNumber);
        if (enKey) fileEngineMap.set(enKey, rowNumber);

        nextValidRows.push({ rowNumber, car });
      }

      if (nextValidRows.length === 0 && nextDuplicateRows.length === 0 && nextValidationErrors.length === 0) {
        setParseFatalError('ไม่พบข้อมูลรถยนต์ในไฟล์ Excel ที่เลือก');
      }

      setValidRows(nextValidRows);
      setDuplicateRows(nextDuplicateRows);
      setValidationErrors(nextValidationErrors);
    } catch (error: any) {
      console.error('Parse error', error);
      setParseFatalError(`เกิดข้อผิดพลาดในการอ่านไฟล์: ${error.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      parseAndValidateFile(selected);
    }
  };

  const handleProcessAndUpload = async () => {
    if (!file || validRows.length === 0) return;
    setIsUploading(true);
    setLogs([]);
    setProgress(0);

    const carsToImport = validRows.map((item) => item.car);
    const BATCH_SIZE = 20;
    const totalCars = carsToImport.length;
    let successCount = 0;
    let failCount = 0;

    const token = localStorage.getItem('authToken');

    for (let i = 0; i < totalCars; i += BATCH_SIZE) {
      const batch = carsToImport.slice(i, i + BATCH_SIZE);

      try {
        const response = await fetch('/api/cars', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(batch),
        });

        const result = await response.json();

        if (response.ok) {
          const batchFailures = result.errors ? result.errors.length : 0;
          const batchSuccess = batch.length - batchFailures;

          successCount += batchSuccess;
          failCount += batchFailures;

          if (result.errors && result.errors.length > 0) {
            result.errors.forEach((err: any) => {
              setLogs((prev) => [...prev, { type: 'error', message: `VIN ${err.vin}: ${err.error}` }]);
            });
          }
        } else {
          failCount += batch.length;
          setLogs((prev) => [...prev, { type: 'error', message: `นำเข้าไม่สำเร็จ: ${result.message}` }]);
        }
      } catch (error: any) {
        failCount += batch.length;
        setLogs((prev) => [...prev, { type: 'error', message: `Network error: ${error.message}` }]);
      }

      const currentProgress = Math.min(100, Math.round(((i + batch.length) / totalCars) * 100));
      setProgress(currentProgress);
    }

    setLogs((prev) => [
      ...prev,
      { type: 'success', message: `----------------------------------------` },
      { type: 'success', message: `นำเข้าข้อมูลสำเร็จ ${successCount} คัน` },
      ...(duplicateRows.length > 0
        ? [{ type: 'error' as const, message: `ข้ามข้อมูลซ้ำ ${duplicateRows.length} คัน (ไม่ถูกบันทึกซ้ำลงระบบ)` }]
        : []),
      ...(failCount > 0
        ? [{ type: 'error' as const, message: `ล้มเหลว ${failCount} คัน (ดูรายละเอียดด้านบน)` }]
        : []),
    ]);

    setIsUploading(false);
    setUploadDone(true);
    if (successCount > 0) {
      onSuccess();
    }
  };

  const totalParsed = validRows.length + duplicateRows.length + validationErrors.length;
  const hasAnalyzedFile = !!file && !isParsing && !parseFatalError;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 transition-opacity">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-700">
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">นำเข้าข้อมูล Allocation (Excel)</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              ระบบจะอ่านหัวตารางและตรวจสอบข้อมูลซ้ำกับในระบบให้อัตโนมัติก่อนนำเข้า
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50 p-2 rounded-full bg-gray-50 dark:bg-gray-700"
          >
            <XIcon />
          </button>
        </div>

        <div className="p-6 flex-grow overflow-y-auto space-y-5">
          {/* Instructions */}
          <div className="p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800 rounded-xl">
            <div className="flex items-start">
              <div className="p-2 bg-sky-100 dark:bg-sky-800 rounded-lg text-sky-600 dark:text-sky-300 shrink-0">
                <DocumentDownloadIcon />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-bold text-sky-900 dark:text-sky-200">รูปแบบไฟล์ Excel ที่รองรับ</h3>
                <p className="text-xs sm:text-sm text-sky-800 dark:text-sky-300 mt-1 leading-relaxed">
                  รองรับไฟล์ <strong>.xlsx / .xls</strong> ที่มีคอลัมน์: <span className="font-mono text-xs">No, Dealer Code, Dealer Name, Short Name, Model, VIN No., Front Motor no., Rear Motor no. 1, Rear Motor no. 2, BATTERY No., Engine No., COLOR, Car Type, Allocation Date, PO type, Package, Price</span><br />
                  ระบบจะตรวจจับแถวหัวตาราง ตัดแถว <strong>TOTAL</strong> และตรวจสอบเลข <strong>VIN / Engine / Battery / Motor</strong> ซ้ำกับในระบบให้อัตโนมัติ
                </p>
              </div>
            </div>
          </div>

          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เลือกไฟล์ Excel</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              disabled={isUploading || isParsing}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-sky-50 file:text-sky-700
                  dark:file:bg-sky-900/50 dark:file:text-sky-300
                  hover:file:bg-sky-100 dark:hover:file:bg-sky-800
                  cursor-pointer border border-gray-200 dark:border-gray-600 rounded-lg"
            />
          </div>

          {isParsing && (
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-sky-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>กำลังอ่านไฟล์และตรวจสอบข้อมูลซ้ำกับฐานข้อมูล...</span>
            </div>
          )}

          {parseFatalError && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-start gap-3">
              <ExclamationIcon />
              <div>
                <div className="font-bold">ไม่สามารถอ่านไฟล์ได้</div>
                <div className="mt-0.5">{parseFatalError}</div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          {hasAnalyzedFile && totalParsed > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">พบข้อมูลทั้งหมด</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{totalParsed} คัน</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                <div className="text-xs text-emerald-700 dark:text-emerald-300">พร้อมนำเข้า (ไม่ซ้ำ)</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{validRows.length} คัน</div>
              </div>
              <div className={`p-3 rounded-xl border ${duplicateRows.length > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700' : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700'}`}>
                <div className={`text-xs ${duplicateRows.length > 0 ? 'text-amber-800 dark:text-amber-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>พบข้อมูลซ้ำ</div>
                <div className={`text-xl font-bold mt-0.5 ${duplicateRows.length > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>{duplicateRows.length} คัน</div>
              </div>
              <div className={`p-3 rounded-xl border ${validationErrors.length > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700'}`}>
                <div className={`text-xs ${validationErrors.length > 0 ? 'text-red-700 dark:text-red-300 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>ข้อมูลไม่สมบูรณ์</div>
                <div className={`text-xl font-bold mt-0.5 ${validationErrors.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-gray-700 dark:text-gray-300'}`}>{validationErrors.length} แถว</div>
              </div>
            </div>
          )}

          {/* Duplicate Alert Section */}
          {hasAnalyzedFile && duplicateRows.length > 0 && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/80 dark:bg-amber-900/20 overflow-hidden">
              <div className="px-4 py-3 bg-amber-100/80 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-700 flex items-center gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  แจ้งเตือนพบข้อมูลซ้ำ {duplicateRows.length} รายการ (รายการเหล่านี้จะไม่ถูกนำเข้าสู่ระบบ)
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">แถว</th>
                      <th className="px-3 py-2 text-left font-semibold">VIN No.</th>
                      <th className="px-3 py-2 text-left font-semibold">Model</th>
                      <th className="px-3 py-2 text-left font-semibold">รายละเอียดข้อมูลซ้ำ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/70 dark:divide-amber-800/50">
                    {duplicateRows.map((dup) => (
                      <tr key={`${dup.rowNumber}-${dup.car.vin}`} className="text-amber-950 dark:text-amber-100">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">#{dup.rowNumber}</td>
                        <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">{dup.car.vin}</td>
                        <td className="px-3 py-2">{dup.car.model}</td>
                        <td className="px-3 py-2 text-red-700 dark:text-red-300 font-medium">
                          {dup.reasons.join(' | ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Validation Errors Section */}
          {hasAnalyzedFile && validationErrors.length > 0 && (
            <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <div className="text-sm font-bold text-red-800 dark:text-red-300 mb-2">
                พบข้อมูลไม่สมบูรณ์ ({validationErrors.length} แถว)
              </div>
              <ul className="space-y-1 max-h-32 overflow-y-auto text-xs text-red-700 dark:text-red-300">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>แถวที่ {err.rowNumber}: {err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview of Valid Rows */}
          {hasAnalyzedFile && validRows.length > 0 && !uploadDone && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">
                  ตัวอย่างข้อมูลที่จะนำเข้า ({validRows.length} คัน)
                </span>
                {duplicateRows.length === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>ไม่พบข้อมูลซ้ำ</span>
                  </span>
                )}
              </div>
              <div className="max-h-52 overflow-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">แถว</th>
                      <th className="px-3 py-2 text-left font-semibold">Dealer</th>
                      <th className="px-3 py-2 text-left font-semibold">Model</th>
                      <th className="px-3 py-2 text-left font-semibold">VIN No.</th>
                      <th className="px-3 py-2 text-left font-semibold">Color</th>
                      <th className="px-3 py-2 text-left font-semibold">Allocation Date</th>
                      <th className="px-3 py-2 text-right font-semibold">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-gray-700 dark:text-gray-200">
                    {validRows.map(({ rowNumber, car }) => (
                      <tr key={`${rowNumber}-${car.vin}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="px-3 py-2 font-mono text-gray-400">#{rowNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{car.dealerCode}</td>
                        <td className="px-3 py-2">{car.model}</td>
                        <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">{car.vin}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{car.color}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{car.allocationDate}</td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          {car.price.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {progress > 0 && (
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-sky-700 dark:text-sky-300">กำลังอัพโหลด...</span>
                <span className="text-sm font-bold text-sky-700 dark:text-sky-300">{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 dark:bg-gray-700">
                <div className="bg-sky-500 h-3 rounded-full transition-all duration-300 shadow-sm" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
          )}

          {/* Logs Area */}
          {logs.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 max-h-48 overflow-y-auto">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 sticky top-0 bg-gray-50 dark:bg-gray-900/90 pb-1">
                สถานะการทำงาน
              </h4>
              <ul className="space-y-2">
                {logs.map((log, idx) => (
                  <li
                    key={idx}
                    className={`text-sm flex items-start ${
                      log.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    <span className={`mr-2 mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${log.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
                    <span>{log.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 sm:flex sm:flex-row-reverse rounded-b-2xl border-t border-gray-100 dark:border-gray-700 gap-3">
          {!uploadDone && (
            <button
              type="button"
              onClick={handleProcessAndUpload}
              disabled={!file || isParsing || isUploading || validRows.length === 0}
              className="w-full inline-flex justify-center items-center rounded-lg border border-transparent shadow-sm px-6 py-2.5 bg-sky-600 text-base font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 sm:w-auto sm:text-sm disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              {isUploading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  กำลังนำเข้า...
                </>
              ) : (
                <>
                  <ArchiveInIcon />
                  <span className="ml-2">
                    {validRows.length > 0
                      ? duplicateRows.length > 0
                        ? `นำเข้าเฉพาะรายการที่ไม่ซ้ำ (${validRows.length} คัน)`
                        : `เริ่มนำเข้า (${validRows.length} คัน)`
                      : 'ไม่มีข้อมูลใหม่สำหรับนำเข้า'}
                  </span>
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-lg border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2.5 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 sm:w-auto sm:text-sm disabled:opacity-50 transition-colors"
          >
            {uploadDone ? 'ปิดหน้าต่าง' : 'ยกเลิก'}
          </button>
          {(uploadDone || file) && (
            <button
              type="button"
              onClick={resetModalState}
              disabled={isUploading || isParsing}
              className="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-lg border border-sky-300 dark:border-sky-700 shadow-sm px-4 py-2.5 bg-sky-50 dark:bg-sky-900/30 text-base font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 sm:w-auto sm:text-sm disabled:opacity-50 transition-colors"
            >
              {uploadDone ? 'นำเข้าไฟล์อื่น' : 'ล้างไฟล์ / เลือกใหม่'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
