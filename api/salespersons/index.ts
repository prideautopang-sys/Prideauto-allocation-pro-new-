import { VercelResponse } from '@vercel/node';
import { sql } from '../../lib/db.js';
import { withAuth, AuthenticatedRequest } from '../middleware/withAuth.js';
import { Salesperson } from '../../types.js';

let branchColumnEnsured = false;

async function ensureBranchColumn() {
  if (branchColumnEnsured) return;
  await sql('ALTER TABLE salespersons ADD COLUMN IF NOT EXISTS branch VARCHAR(255)');
  branchColumnEnsured = true;
}

const handler = async (req: AuthenticatedRequest, res: VercelResponse) => {
  await ensureBranchColumn();

  // GET salespersons
  if (req.method === 'GET') {
    const { status } = req.query;
    try {
      let query = 'SELECT id, name, status, branch, created_at as "createdAt" FROM salespersons ORDER BY created_at ASC, name ASC';
      const params: string[] = [];
      
      if (status === 'active') {
        query = 'SELECT id, name, status, branch, created_at as "createdAt" FROM salespersons WHERE status = $1 ORDER BY name ASC';
        params.push('active');
      }
      
      const { rows } = await sql(query, params);
      return res.status(200).json(rows);
    } catch (error) {
      console.error('Error fetching salespersons:', error);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  }
  
  // POST a new salesperson
  if (req.method === 'POST') {
     const userRole = req.user?.role;
     if (userRole !== 'executive') {
        return res.status(403).json({ message: 'Forbidden: Insufficient permissions.' });
     }
     try {
        const { name, status, branch } = req.body as Salesperson;
        if (!name || !name.trim()) {
            return res.status(400).json({ message: 'Name is required' });
        }
        const safeStatus = status === 'inactive' ? 'inactive' : 'active';
        const safeBranch = branch === 'มหาสารคาม' || branch === 'กาฬสินธุ์' ? branch : null;

        const { rows } = await sql(
            'INSERT INTO salespersons (name, status, branch) VALUES ($1, $2, $3) RETURNING id, name, status, branch, created_at as "createdAt"',
            [name.trim(), safeStatus, safeBranch]
        );
        return res.status(201).json(rows[0]);
     } catch (error: any) {
        console.error('Error creating salesperson:', error);
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: `A salesperson with the name '${req.body.name}' already exists.` });
        }
        return res.status(500).json({ message: 'Internal Server Error' });
     }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
};

// All authenticated users can GET, but only executive can POST.
export default withAuth(handler);