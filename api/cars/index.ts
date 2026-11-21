
import { VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';
import { withAuth, AuthenticatedRequest } from '../middleware/withAuth.js';
import { Car, CarStatus } from '../../types.js';

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  const userRole = req.user?.role;

  // GET all cars
  if (req.method === 'GET') {
    try {
      const { rows } = await sql(`
        SELECT 
          id, dealer_code as "dealerCode", dealer_name as "dealerName", model, vin, 
          front_motor_no as "frontMotorNo", rear_motor_no as "rearMotorNo", 
          battery_no as "batteryNo", engine_no as "engineNo", color, car_type as "carType", 
          allocation_date as "allocationDate", po_type as "poType", price, status, 
          stock_in_date as "stockInDate", stock_location as "stockLocation",
          stock_no as "stockNo"
        FROM cars ORDER BY allocation_date DESC
      `);
      return res.status(200).json(rows);
    } catch (error) {
      console.error('Error fetching cars:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  // POST: Create Single Car OR Batch Import
  if (req.method === 'POST') {
    if (userRole !== 'executive' && userRole !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
    }

    const normalizeOptional = (val: unknown): string | null => {
        if (val === undefined || val === null) return null;
        const trimmed = String(val).trim();
        if (!trimmed || trimmed === '-' || trimmed.toUpperCase() === 'N/A') return null;
        return trimmed;
    };

    const normalizeKey = (val: unknown): string | null => {
        const cleaned = normalizeOptional(val);
        return cleaned ? cleaned.toUpperCase() : null;
    };
    
    try {
      // BATCH IMPORT (Array)
      if (Array.isArray(req.body)) {
          const carsToImport = req.body as Car[];
          if (carsToImport.length === 0) {
              return res.status(400).json({ message: 'No cars to import.' });
          }

          // Load existing unique identifiers from DB to prevent duplicates reliably
          const { rows: existingRows } = await sql(`
            SELECT vin, front_motor_no, rear_motor_no, battery_no, engine_no FROM cars
          `);

          const existingVins = new Set<string>();
          const existingFrontMotors = new Set<string>();
          const existingRearMotors = new Set<string>();
          const existingBatteries = new Set<string>();
          const existingEngines = new Set<string>();

          for (const r of existingRows) {
              const v = normalizeKey(r.vin);
              const fm = normalizeKey(r.front_motor_no);
              const rm = normalizeKey(r.rear_motor_no);
              const bt = normalizeKey(r.battery_no);
              const en = normalizeKey(r.engine_no);
              if (v) existingVins.add(v);
              if (fm) existingFrontMotors.add(fm);
              if (rm) existingRearMotors.add(rm);
              if (bt) existingBatteries.add(bt);
              if (en) existingEngines.add(en);
          }

          const batchVins = new Set<string>();
          const batchFrontMotors = new Set<string>();
          const batchRearMotors = new Set<string>();
          const batchBatteries = new Set<string>();
          const batchEngines = new Set<string>();

          const results: string[] = [];
          const errors: { vin: string, error: string }[] = [];
          const nonDuplicateCars: Car[] = [];

          for (const car of carsToImport) {
              const vinKey = normalizeKey(car.vin);
              const fmKey = normalizeKey(car.frontMotorNo);
              const rmKey = normalizeKey(car.rearMotorNo);
              const btKey = normalizeKey(car.batteryNo);
              const enKey = normalizeKey(car.engineNo);

              if (!vinKey || !car.dealerCode || !car.dealerName || !car.model) {
                  errors.push({ vin: car.vin || 'Unknown', error: 'ข้อมูลไม่ครบถ้วน (Dealer, Model, หรือ VIN)' });
                  continue;
              }

              const dupReasons: string[] = [];
              if (existingVins.has(vinKey)) dupReasons.push('เลขตัวถัง (VIN) ซ้ำในระบบ');
              else if (batchVins.has(vinKey)) dupReasons.push('เลขตัวถัง (VIN) ซ้ำในไฟล์ที่นำเข้า');

              if (fmKey) {
                  if (existingFrontMotors.has(fmKey)) dupReasons.push('เลขมอเตอร์หน้าซ้ำในระบบ');
                  else if (batchFrontMotors.has(fmKey)) dupReasons.push('เลขมอเตอร์หน้าซ้ำในไฟล์ที่นำเข้า');
              }
              if (rmKey) {
                  if (existingRearMotors.has(rmKey)) dupReasons.push('เลขมอเตอร์หลังซ้ำในระบบ');
                  else if (batchRearMotors.has(rmKey)) dupReasons.push('เลขมอเตอร์หลังซ้ำในไฟล์ที่นำเข้า');
              }
              if (btKey) {
                  if (existingBatteries.has(btKey)) dupReasons.push('เลขแบตเตอรี่ซ้ำในระบบ');
                  else if (batchBatteries.has(btKey)) dupReasons.push('เลขแบตเตอรี่ซ้ำในไฟล์ที่นำเข้า');
              }
              if (enKey) {
                  if (existingEngines.has(enKey)) dupReasons.push('เลขเครื่องยนต์ซ้ำในระบบ');
                  else if (batchEngines.has(enKey)) dupReasons.push('เลขเครื่องยนต์ซ้ำในไฟล์ที่นำเข้า');
              }

              if (dupReasons.length > 0) {
                  errors.push({ vin: car.vin, error: dupReasons.join(', ') });
                  continue;
              }

              batchVins.add(vinKey);
              if (fmKey) batchFrontMotors.add(fmKey);
              if (rmKey) batchRearMotors.add(rmKey);
              if (btKey) batchBatteries.add(btKey);
              if (enKey) batchEngines.add(enKey);

              nonDuplicateCars.push(car);
          }

          // Function to insert a single car (reused in batch)
          const insertCar = async (car: Car) => {
              try {
                  const { 
                    dealerCode, dealerName, model, vin, frontMotorNo, rearMotorNo,
                    batteryNo, engineNo, color, carType, allocationDate, poType,
                    price, status 
                  } = car;
                  
                   const query = `
                    INSERT INTO cars (
                        dealer_code, dealer_name, model, vin, front_motor_no, rear_motor_no, 
                        battery_no, engine_no, color, car_type, allocation_date, po_type, 
                        price, status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    RETURNING id;
                  `;
                  // Sanitize params
                  const params = [
                      String(dealerCode).trim(),
                      String(dealerName).trim(),
                      String(model).trim(),
                      String(vin).trim(),
                      normalizeOptional(frontMotorNo),
                      normalizeOptional(rearMotorNo),
                      normalizeOptional(batteryNo),
                      normalizeOptional(engineNo),
                      String(color || '').trim(),
                      normalizeOptional(carType),
                      allocationDate,
                      normalizeOptional(poType),
                      price,
                      status || 'รอขึ้นเทรลเลอร์'
                  ];
                  
                  await sql(query, params);
                  return { success: true, vin };
              } catch (err: any) {
                  console.error(`Failed to import VIN ${car.vin}:`, err);
                  let errorMessage = err.message;
                  
                  // Handle Unique Violations more gracefully
                  if (err.code === '23505') {
                      const detail = err.detail || '';
                      if (detail.includes('vin')) errorMessage = 'เลขตัวถัง (VIN) ซ้ำในระบบ';
                      else if (detail.includes('front_motor_no')) errorMessage = 'เลขมอเตอร์หน้าซ้ำในระบบ';
                      else if (detail.includes('rear_motor_no')) errorMessage = 'เลขมอเตอร์หลังซ้ำในระบบ';
                      else if (detail.includes('battery_no')) errorMessage = 'เลขแบตเตอรี่ซ้ำในระบบ';
                      else if (detail.includes('engine_no')) errorMessage = 'เลขเครื่องยนต์ซ้ำในระบบ';
                      else errorMessage = 'ข้อมูลซ้ำในระบบ (Unique Constraint)';
                  }

                  return { success: false, vin: car.vin, error: errorMessage };
              }
          };

          // Process in chunks to avoid overwhelming the DB connection pool but still be fast
          const BATCH_SIZE = 20;
          for (let i = 0; i < nonDuplicateCars.length; i += BATCH_SIZE) {
              const chunk = nonDuplicateCars.slice(i, i + BATCH_SIZE);
              const chunkResults = await Promise.all(chunk.map(car => insertCar(car)));
              
              for (const res of chunkResults) {
                  if (res.success) {
                      results.push(res.vin as string);
                  } else {
                      errors.push({ vin: res.vin as string, error: res.error as string });
                  }
              }
          }

          return res.status(201).json({ 
              message: `Imported ${results.length} cars.`, 
              importedCount: results.length,
              errors: errors.length > 0 ? errors : undefined 
          });
      }

      // SINGLE CREATE
      const { 
          dealerCode, dealerName, model, vin, frontMotorNo, rearMotorNo,
          batteryNo, engineNo, color, carType, allocationDate, poType,
          price, status 
      } = req.body as Car;

      if (!model || !vin || price === undefined || price === null) {
          return res.status(400).json({ message: 'Missing required fields' });
      }

      const query = `
        INSERT INTO cars (
            dealer_code, dealer_name, model, vin, front_motor_no, rear_motor_no, 
            battery_no, engine_no, color, car_type, allocation_date, po_type, 
            price, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *;
      `;
      
      const params = [
          String(dealerCode || '').trim(),
          String(dealerName || '').trim(),
          String(model).trim(),
          String(vin).trim(), 
          normalizeOptional(frontMotorNo),
          normalizeOptional(rearMotorNo),
          normalizeOptional(batteryNo),
          normalizeOptional(engineNo), 
          String(color || '').trim(),
          normalizeOptional(carType),
          allocationDate,
          normalizeOptional(poType),
          price,
          status
      ];

      const { rows } = await sql(query, params);
      return res.status(201).json(rows[0]);

    } catch (error: any) {
        console.error('Error creating car:', error);
        if (error.code === '23505') {
            return res.status(409).json({ message: `A car with this VIN/Motor/Battery number already exists.` });
        }
        return res.status(500).json({ message: 'Internal Server Error' });
    }
  }

  // PUT: Batch Stock Update (when sending carIds)
  if (req.method === 'PUT') {
      if (userRole !== 'executive' && userRole !== 'admin') {
          return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
      }

      // Check if this is a batch request
      if (req.body.carIds && Array.isArray(req.body.carIds)) {
          try {
              const { carIds, stockInDate, stockLocation, stockNo, status } = req.body;
              
              if (!stockInDate) {
                   return res.status(400).json({ message: 'Stock In Date is required.' });
              }

              // Update multiple cars
              // Using = ANY($1) for array matching
              const query = `
                  UPDATE cars SET 
                      status = $1, 
                      stock_in_date = $2, 
                      stock_location = $3, 
                      stock_no = $4, 
                      updated_at = NOW()
                  WHERE id = ANY($5)
                  RETURNING id;
              `;
              
              const params = [
                  status || CarStatus.IN_STOCK, 
                  stockInDate, 
                  stockLocation ?? null, 
                  stockNo ?? null, 
                  carIds
              ];

              const { rowCount } = await sql(query, params);
              return res.status(200).json({ message: 'Cars updated successfully', count: rowCount });

          } catch (error: any) {
              console.error('Error in batch update:', error);
              return res.status(500).json({ 
                  message: 'Internal Server Error', 
                  error: error.message,
                  code: error.code 
              });
          }
      }
      
      // If not batch, this endpoint does not handle single ID PUTs (that's handled by [id].ts)
      return res.status(400).json({ message: 'Invalid request format for bulk update.' });
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

export default withAuth(handler);
