import React, { useState, useMemo } from 'react';
import { Salesperson, SalespersonStatus } from '../types';
import { PlusIcon, ArrowLeftIcon } from '../components/icons';
import SalespersonTable from '../components/SalespersonTable';
import SalespersonFormModal from '../components/SalespersonFormModal';

interface SalespersonManagementPageProps {
  token: string | null;
  salespersons: Salesperson[];
  onDataChange: () => void;
  onBack: () => void;
}

const SalespersonManagementPage: React.FC<SalespersonManagementPageProps> = ({ token, salespersons, onDataChange, onBack }) => {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | SalespersonStatus>('all');
  const [branchFilter, setBranchFilter] = useState<'all' | 'มหาสารคาม' | 'กาฬสินธุ์'>('all');

  const summary = useMemo(() => {
    let active = 0;
    let inactive = 0;
    let mahasarakham = 0;
    let kalasin = 0;

    for (const sp of salespersons) {
      if (sp.status === 'active') active++;
      else inactive++;

      if (sp.branch === 'มหาสารคาม') mahasarakham++;
      else if (sp.branch === 'กาฬสินธุ์') kalasin++;
    }

    return {
      total: salespersons.length,
      active,
      inactive,
      mahasarakham,
      kalasin,
    };
  }, [salespersons]);

  const filteredSalespersons = useMemo(() => {
    return salespersons.filter((sp) => {
      if (statusFilter !== 'all' && sp.status !== statusFilter) return false;
      if (branchFilter !== 'all' && sp.branch !== branchFilter) return false;
      return true;
    });
  }, [salespersons, statusFilter, branchFilter]);

  const handleOpenAddModal = () => {
    setEditingSalesperson(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (sp: Salesperson) => {
    setEditingSalesperson(sp);
    setIsFormModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsFormModalOpen(false);
    setEditingSalesperson(null);
  };

  const handleSave = async (sp: Salesperson) => {
    const isEditing = !!editingSalesperson;
    const url = isEditing ? `/api/salespersons/${sp.id}` : '/api/salespersons';
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(sp)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || 'Failed to save salesperson');
        }
        onDataChange(); // Trigger data refetch in parent
        handleCloseModal();
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
         <button onClick={onBack} className="flex items-center text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
            <ArrowLeftIcon />
            <span className="ml-2">Back to Settings</span>
        </button>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center rounded-md border border-transparent bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          <PlusIcon /> <span className="ml-2 hidden sm:block">Add New Salesperson</span>
        </button>
      </div>

      {/* Summary Cards: Total / Active / Inactive */}
      <div className="mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`text-left p-4 rounded-xl border bg-white dark:bg-gray-800 shadow-sm transition-all ${
            statusFilter === 'all'
              ? 'border-sky-500 ring-2 ring-sky-200 dark:ring-sky-800'
              : 'border-gray-200 dark:border-gray-700 hover:border-sky-300'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">ทั้งหมด (Total)</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total} คน</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              มหาสารคาม {summary.mahasarakham} • กาฬสินธุ์ {summary.kalasin}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`text-left p-4 rounded-xl border bg-white dark:bg-gray-800 shadow-sm transition-all ${
            statusFilter === 'active'
              ? 'border-green-500 ring-2 ring-green-200 dark:ring-green-900'
              : 'border-gray-200 dark:border-gray-700 hover:border-green-300'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Active</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-green-700 dark:text-green-300">{summary.active} คน</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">คลิกเพื่อกรอง</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'inactive' ? 'all' : 'inactive')}
          className={`text-left p-4 rounded-xl border bg-white dark:bg-gray-800 shadow-sm transition-all ${
            statusFilter === 'inactive'
              ? 'border-gray-500 ring-2 ring-gray-200 dark:ring-gray-700'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Inactive</div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-gray-700 dark:text-gray-200">{summary.inactive} คน</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">คลิกเพื่อกรอง</span>
          </div>
        </button>
      </div>

      {/* Branch Filter Pills */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">สังกัด:</span>
          {(['all', 'มหาสารคาม', 'กาฬสินธุ์'] as const).map((branch) => (
            <button
              key={branch}
              type="button"
              onClick={() => setBranchFilter(branch)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                branchFilter === branch
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {branch === 'all' ? 'ทุกสังกัด' : branch}
            </button>
          ))}
        </div>
        {(statusFilter !== 'all' || branchFilter !== 'all') && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            แสดงผล {filteredSalespersons.length} จาก {summary.total} คน
          </span>
        )}
      </div>

      <SalespersonTable 
        salespersons={filteredSalespersons} 
        onEdit={handleOpenEditModal} 
      />
      <SalespersonFormModal 
        isOpen={isFormModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        salespersonToEdit={editingSalesperson}
      />
    </>
  );
};

export default SalespersonManagementPage;