import React, { useState, useMemo, useCallback } from 'react';
import { Car, Match, CarStatus, MatchStatus } from '../types';
import { ArchiveIcon, BookmarkIcon, CheckCircleIcon, ClockIcon, CollectionIcon, DownloadIcon, TruckIcon, CarIcon, XIcon } from './icons';
import LineChart from './LineChart';
import BarChart from './BarChart';
import StatusBadge from './StatusBadge';

interface StatisticsPageProps {
  stats: Record<CarStatus | 'total', number>;
  cars: Car[];
  matches: Match[];
}

interface StatCardProps {
    title: string;
    value: number;
    icon: React.ReactNode;
    gradientClass: string;
    iconColor: string;
    onClick?: () => void;
}

interface DrilldownItem {
    car: Car;
    match?: Match;
}

interface DrilldownModalState {
    title: string;
    subtitle?: string;
    items: DrilldownItem[];
}

const toLocalDateInput = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateString?: string | null): string => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, gradientClass, iconColor, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className="text-left w-full relative overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-sky-200 dark:hover:border-sky-700 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-sky-500"
    >
        <div className={`absolute top-0 right-0 w-32 h-32 rounded-full transform translate-x-8 -translate-y-8 opacity-10 ${gradientClass}`}></div>
        <div className="flex justify-between items-start z-10 w-full">
            <div>
                 <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{title}</p>
                 <p className="text-3xl font-extrabold text-slate-800 dark:text-white mt-2">{value.toLocaleString()}</p>
                 <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                     คลิกเพื่อดูข้อมูลรถ →
                 </p>
            </div>
            <div className={`p-3 rounded-xl ${gradientClass} ${iconColor} bg-opacity-20`}>
                {icon}
            </div>
        </div>
    </button>
);

const StatisticsPage: React.FC<StatisticsPageProps> = ({ stats, cars, matches }) => {
  const [timeframe, setTimeframe] = useState<'monthly' | 'yearly'>('monthly');

  const [salesStartDate, setSalesStartDate] = useState<string>(() => {
    const now = new Date();
    return toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [salesEndDate, setSalesEndDate] = useState<string>(() => {
    const now = new Date();
    return toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  });

  const [drilldownModal, setDrilldownModal] = useState<DrilldownModalState | null>(null);
  const [modalSearchTerm, setModalSearchTerm] = useState('');

  const carsById = useMemo(() => new Map<string, Car>(cars.map(c => [c.id!, c])), [cars]);
  const matchesByCarId = useMemo(() => new Map<string, Match>(matches.map(m => [m.carId, m])), [matches]);

  const applyPreset = (preset: 'thisMonth' | 'lastMonth' | 'thisYear' | 'all') => {
    const now = new Date();
    if (preset === 'thisMonth') {
      setSalesStartDate(toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
      setSalesEndDate(toLocalDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
    } else if (preset === 'lastMonth') {
      setSalesStartDate(toLocalDateInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setSalesEndDate(toLocalDateInput(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (preset === 'thisYear') {
      setSalesStartDate(toLocalDateInput(new Date(now.getFullYear(), 0, 1)));
      setSalesEndDate(toLocalDateInput(new Date(now.getFullYear(), 11, 31)));
    } else {
      setSalesStartDate('');
      setSalesEndDate('');
    }
  };

  const lineChartData = useMemo(() => {
    const dataMap = new Map<string, { allocated: number; stocked: number; sold: number }>();
    const now = new Date();

    const labels = Array.from({ length: timeframe === 'monthly' ? 12 : 5 }).map((_, i) => {
      let label;
      if (timeframe === 'monthly') {
        const date = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
        label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      } else { // yearly
        label = String(now.getFullYear() - (4 - i));
      }
      dataMap.set(label, { allocated: 0, stocked: 0, sold: 0 });
      return label;
    });

    cars.forEach(car => {
      if (car.allocationDate) {
        const date = new Date(car.allocationDate);
        const label = timeframe === 'monthly'
          ? date.toLocaleString('default', { month: 'short', year: '2-digit' })
          : String(date.getFullYear());
        if (dataMap.has(label)) dataMap.get(label)!.allocated++;
      }
      if (car.stockInDate) {
        const date = new Date(car.stockInDate);
        const label = timeframe === 'monthly'
          ? date.toLocaleString('default', { month: 'short', year: '2-digit' })
          : String(date.getFullYear());
        if (dataMap.has(label)) dataMap.get(label)!.stocked++;
      }
    });

    matches
      .filter(match => match.status === MatchStatus.DELIVERED && match.saleDate)
      .forEach(match => {
        const date = new Date(match.saleDate!);
        const label = timeframe === 'monthly'
          ? date.toLocaleString('default', { month: 'short', year: '2-digit' })
          : String(date.getFullYear());
        if (dataMap.has(label)) dataMap.get(label)!.sold++;
      });

    const allocatedData = labels.map(label => dataMap.get(label)!.allocated);
    const stockedData = labels.map(label => dataMap.get(label)!.stocked);
    const soldData = labels.map(label => dataMap.get(label)!.sold);

    return {
      labels,
      datasets: [
        { label: 'Allocated', data: allocatedData, borderColor: 'rgb(59, 130, 246)', backgroundColor: 'rgba(59, 130, 246, 0.5)', tension: 0.1 },
        { label: 'Stocked', data: stockedData, borderColor: 'rgb(139, 92, 246)', backgroundColor: 'rgba(139, 92, 246, 0.5)', tension: 0.1 },
        { label: 'Sold', data: soldData, borderColor: 'rgb(22, 163, 74)', backgroundColor: 'rgba(22, 163, 74, 0.5)', tension: 0.1 },
      ],
    };
  }, [cars, matches, timeframe]);

  const dateRangeLabel = useMemo(() => {
    if (salesStartDate && salesEndDate) {
      return `ช่วงวันที่ ${formatDisplayDate(salesStartDate)} - ${formatDisplayDate(salesEndDate)}`;
    }
    if (salesStartDate) {
      return `ตั้งแต่วันที่ ${formatDisplayDate(salesStartDate)}`;
    }
    if (salesEndDate) {
      return `ถึงวันที่ ${formatDisplayDate(salesEndDate)}`;
    }
    return 'ทั้งหมดทุกช่วงเวลา';
  }, [salesStartDate, salesEndDate]);

  const salesPerformanceData = useMemo(() => {
    let start: Date | null = null;
    if (salesStartDate) {
      const [sy, sm, sd] = salesStartDate.split('-').map(Number);
      start = new Date(sy, sm - 1, sd, 0, 0, 0, 0);
    }

    let end: Date | null = null;
    if (salesEndDate) {
      const [ey, em, ed] = salesEndDate.split('-').map(Number);
      end = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    }

    const relevantMatches = matches.filter(match => {
      if (match.status !== MatchStatus.DELIVERED || !match.saleDate) return false;
      const saleDate = new Date(match.saleDate);
      if (isNaN(saleDate.getTime())) return false;
      if (start && saleDate < start) return false;
      if (end && saleDate > end) return false;
      return true;
    });

    const getModelPerformance = () => {
      const counts = new Map<string, number>();
      relevantMatches.forEach(match => {
        const itemKey = carsById.get(match.carId)?.model;
        if (itemKey) {
          counts.set(itemKey, (counts.get(itemKey) || 0) + 1);
        }
      });

      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

      return {
        labels: sorted.map(item => item[0]),
        datasets: [{
          label: 'Units Sold',
          data: sorted.map(item => item[1]),
          backgroundColor: 'rgba(14, 165, 233, 0.7)', // Sky-500
        }]
      };
    };

    const getSalespersonPerformance = () => {
      const counts = new Map<string, number>();
      relevantMatches.forEach(match => {
        const itemKey = match.salesperson;
        if (itemKey) {
          counts.set(itemKey, (counts.get(itemKey) || 0) + 1);
        }
      });
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      return {
        labels: sorted.map(item => item[0]),
        datasets: [{
          label: 'Units Sold',
          data: sorted.map(item => item[1]),
          backgroundColor: 'rgba(99, 102, 241, 0.7)', // Indigo-500
        }]
      };
    };

    return {
      relevantMatches,
      modelsBarChart: getModelPerformance(),
      salespersonsBarChart: getSalespersonPerformance(),
      totalSoldInPeriod: relevantMatches.length,
    };
  }, [carsById, matches, salesStartDate, salesEndDate]);

  const stockByModelData = useMemo(() => {
    const stockCars = cars.filter(car => car.status === CarStatus.IN_STOCK);

    const counts = new Map<string, number>();
    stockCars.forEach(car => {
      const model = car.model;
      if (model) {
        counts.set(model, (counts.get(model) || 0) + 1);
      }
    });

    const sorted = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    return {
      labels: sorted.map(item => item[0]),
      datasets: [{
        label: 'Cars in Stock',
        data: sorted.map(item => item[1]),
        backgroundColor: 'rgba(54, 162, 235, 0.7)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      }],
    };
  }, [cars]);

  const openModalWithItems = useCallback((title: string, subtitle: string | undefined, items: DrilldownItem[]) => {
    setModalSearchTerm('');
    setDrilldownModal({ title, subtitle, items });
  }, []);

  const handleOpenTotalCars = useCallback(() => {
    const items = cars.map(car => ({ car, match: matchesByCarId.get(car.id!) }));
    openModalWithItems('รถยนต์ทั้งหมดในระบบ', undefined, items);
  }, [cars, matchesByCarId, openModalWithItems]);

  const handleOpenStatusCars = useCallback((status: CarStatus) => {
    const items = cars
      .filter(car => car.status === status)
      .map(car => ({ car, match: matchesByCarId.get(car.id!) }));
    openModalWithItems(`รถสถานะ: ${status}`, undefined, items);
  }, [cars, matchesByCarId, openModalWithItems]);

  const handleStockModelClick = useCallback((modelLabel: string) => {
    const items = cars
      .filter(car => car.status === CarStatus.IN_STOCK && car.model === modelLabel)
      .map(car => ({ car, match: matchesByCarId.get(car.id!) }));
    openModalWithItems(`รถในสต็อกรุ่น: ${modelLabel}`, 'สถานะ In Stock', items);
  }, [cars, matchesByCarId, openModalWithItems]);

  const handleOpenAllSoldInPeriod = useCallback(() => {
    const items: DrilldownItem[] = [];
    salesPerformanceData.relevantMatches.forEach(match => {
      const car = carsById.get(match.carId);
      if (car) items.push({ car, match });
    });
    openModalWithItems('ยอดขายรวมในช่วงเวลาที่เลือก', dateRangeLabel, items);
  }, [salesPerformanceData.relevantMatches, carsById, dateRangeLabel, openModalWithItems]);

  const handleSalesModelClick = useCallback((modelLabel: string) => {
    const items: DrilldownItem[] = [];
    salesPerformanceData.relevantMatches.forEach(match => {
      const car = carsById.get(match.carId);
      if (car && car.model === modelLabel) {
        items.push({ car, match });
      }
    });
    openModalWithItems(`ยอดขายรุ่น: ${modelLabel}`, dateRangeLabel, items);
  }, [salesPerformanceData.relevantMatches, carsById, dateRangeLabel, openModalWithItems]);

  const handleSalespersonClick = useCallback((salespersonLabel: string) => {
    const items: DrilldownItem[] = [];
    salesPerformanceData.relevantMatches.forEach(match => {
      if (match.salesperson === salespersonLabel) {
        const car = carsById.get(match.carId);
        if (car) {
          items.push({ car, match });
        }
      }
    });
    openModalWithItems(`ยอดขายของเซลล์: ${salespersonLabel}`, dateRangeLabel, items);
  }, [salesPerformanceData.relevantMatches, carsById, dateRangeLabel, openModalWithItems]);

  const filteredModalItems = useMemo(() => {
    if (!drilldownModal) return [];
    const term = modalSearchTerm.trim().toLowerCase();
    if (!term) return drilldownModal.items;
    return drilldownModal.items.filter(({ car, match }) => {
      const fields = [
        car.vin,
        car.model,
        car.color,
        car.dealerCode,
        car.dealerName,
        car.engineNo,
        car.stockLocation,
        car.stockNo,
        match?.customerName,
        match?.salesperson,
        match?.licensePlate,
      ];
      return fields.some(val => val && String(val).toLowerCase().includes(term));
    });
  }, [drilldownModal, modalSearchTerm]);

  const modalTotalPrice = useMemo(() => {
    return filteredModalItems.reduce((sum, item) => sum + Number(item.car.price || 0), 0);
  }, [filteredModalItems]);

  const statCardsData: Array<StatCardProps & { status: CarStatus }> = [
    { status: CarStatus.WAITING_FOR_TRAILER, title: CarStatus.WAITING_FOR_TRAILER, value: stats[CarStatus.WAITING_FOR_TRAILER] || 0, icon: <ClockIcon />, gradientClass: "bg-yellow-500", iconColor: "text-yellow-600" },
    { status: CarStatus.ON_TRAILER, title: CarStatus.ON_TRAILER, value: stats[CarStatus.ON_TRAILER] || 0, icon: <TruckIcon />, gradientClass: "bg-orange-500", iconColor: "text-orange-600" },
    { status: CarStatus.UNLOADED, title: CarStatus.UNLOADED, value: stats[CarStatus.UNLOADED] || 0, icon: <DownloadIcon />, gradientClass: "bg-cyan-500", iconColor: "text-cyan-600" },
    { status: CarStatus.IN_STOCK, title: CarStatus.IN_STOCK, value: stats[CarStatus.IN_STOCK] || 0, icon: <ArchiveIcon />, gradientClass: "bg-blue-500", iconColor: "text-blue-600" },
    { status: CarStatus.TEST_DRIVE, title: CarStatus.TEST_DRIVE, value: stats[CarStatus.TEST_DRIVE] || 0, icon: <CarIcon />, gradientClass: "bg-rose-500", iconColor: "text-rose-600" },
    { status: CarStatus.RESERVED, title: CarStatus.RESERVED, value: stats[CarStatus.RESERVED] || 0, icon: <BookmarkIcon />, gradientClass: "bg-purple-500", iconColor: "text-purple-600" },
    { status: CarStatus.SOLD, title: CarStatus.SOLD, value: stats[CarStatus.SOLD] || 0, icon: <CheckCircleIcon />, gradientClass: "bg-green-500", iconColor: "text-green-600" },
  ];

  return (
    <div className="p-4 sm:p-0 space-y-8">
        <button
            type="button"
            onClick={handleOpenTotalCars}
            className="w-full text-left bg-gradient-to-r from-sky-500 to-indigo-600 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-0.5 cursor-pointer group focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
             <div className="relative z-10 flex items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm">
                        <CollectionIcon className="h-10 w-10 text-white" />
                    </div>
                    <div>
                        <p className="text-sky-100 font-medium text-lg">รถยนต์ทั้งหมดในระบบ</p>
                        <p className="text-5xl font-extrabold mt-1 tracking-tight">{(stats.total || 0).toLocaleString()}</p>
                    </div>
                </div>
                <span className="hidden sm:inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/15 text-white backdrop-blur-sm group-hover:bg-white/25 transition-colors">
                    คลิกเพื่อดูข้อมูลรถทั้งหมด →
                </span>
            </div>
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-10 rounded-full transform translate-x-16 -translate-y-16"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black opacity-10 rounded-full transform -translate-x-8 translate-y-8"></div>
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {statCardsData.map(({ status, ...data }) => (
                <StatCard key={data.title} {...data} onClick={() => handleOpenStatusCars(status)} />
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6 gap-4">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Trend Analysis</h3>
                     <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-xl flex">
                        <button type="button" onClick={() => setTimeframe('monthly')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${timeframe === 'monthly' ? 'bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Monthly</button>
                        <button type="button" onClick={() => setTimeframe('yearly')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${timeframe === 'yearly' ? 'bg-white dark:bg-gray-600 text-sky-600 dark:text-sky-300 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>Yearly</button>
                     </div>
                </div>
                <div className="h-80 w-full"> <LineChart chartData={lineChartData} /> </div>
            </div>

             <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex justify-between items-center mb-6 gap-2">
                     <h3 className="text-lg font-bold text-gray-900 dark:text-white">Current Stock by Model</h3>
                     <span className="text-xs text-gray-400 dark:text-gray-500">คลิกที่กราฟเพื่อดูข้อมูลรถ</span>
                </div>
                <div className="h-[450px] w-full relative">
                   {stockByModelData.labels.length > 0 ? (
                        <BarChart chartData={stockByModelData} onBarClick={(label) => handleStockModelClick(label)} />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-400">No cars currently in stock.</div>
                    )}
                </div>
            </div>
        </div>
        
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex flex-col xl:flex-row justify-between xl:items-center mb-6 gap-4 border-b border-gray-100 dark:border-gray-700 pb-5">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sales Performance Analysis</h3>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                        <button
                            type="button"
                            onClick={handleOpenAllSoldInPeriod}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/30 hover:bg-sky-100 dark:hover:bg-sky-900/50 px-3 py-1 rounded-lg border border-sky-200 dark:border-sky-800 transition-colors cursor-pointer"
                        >
                            <span>ยอดขายรวม: {salesPerformanceData.totalSoldInPeriod.toLocaleString()} คัน</span>
                            <span className="text-xs font-normal opacity-80">(คลิกดูรายการรถ)</span>
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{dateRangeLabel}</span>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            onClick={() => applyPreset('thisMonth')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-300 transition-colors"
                        >
                            เดือนนี้
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('lastMonth')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-300 transition-colors"
                        >
                            เดือนที่แล้ว
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('thisYear')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-300 transition-colors"
                        >
                            ปีนี้
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset('all')}
                            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200 dark:hover:bg-sky-900/30 dark:hover:text-sky-300 transition-colors"
                        >
                            ทั้งหมด
                        </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div>
                            <label htmlFor="salesStartDate" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">จากวันที่</label>
                            <input
                                id="salesStartDate"
                                type="date"
                                value={salesStartDate}
                                max={salesEndDate || undefined}
                                onChange={(e) => setSalesStartDate(e.target.value)}
                                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                        </div>
                        <span className="text-gray-400 mt-5">-</span>
                        <div>
                            <label htmlFor="salesEndDate" className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">ถึงวันที่</label>
                            <input
                                id="salesEndDate"
                                type="date"
                                value={salesEndDate}
                                min={salesStartDate || undefined}
                                onChange={(e) => setSalesEndDate(e.target.value)}
                                className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mt-4">
                <div>
                    <div className="flex items-center justify-between mb-6 gap-2">
                        <h4 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sales by Model (Ranking)</h4>
                        {salesPerformanceData.modelsBarChart.labels.length > 0 && (
                            <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">คลิกที่แท่งกราฟเพื่อดูข้อมูลรถ</span>
                        )}
                    </div>
                    <div className="h-[450px] w-full relative">
                        {salesPerformanceData.modelsBarChart.labels.length > 0 ? (
                            <BarChart chartData={salesPerformanceData.modelsBarChart} onBarClick={(label) => handleSalesModelClick(label)} />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm italic">ไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก</div>
                        )}
                    </div>
                </div>
                <div>
                    <div className="flex items-center justify-between mb-6 gap-2">
                        <h4 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sales by Salesperson (Ranking)</h4>
                        {salesPerformanceData.salespersonsBarChart.labels.length > 0 && (
                            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">คลิกที่แท่งกราฟเพื่อดูข้อมูลรถ</span>
                        )}
                    </div>
                    <div className="h-[450px] w-full relative">
                        {salesPerformanceData.salespersonsBarChart.labels.length > 0 ? (
                            <BarChart chartData={salesPerformanceData.salespersonsBarChart} onBarClick={(label) => handleSalespersonClick(label)} />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm italic">ไม่มีข้อมูลยอดขายในช่วงเวลาที่เลือก</div>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Drill-down Car Details Modal */}
        {drilldownModal && (
            <div
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-center items-center p-4 transition-opacity"
                onClick={() => setDrilldownModal(null)}
            >
                <div
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-700"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{drilldownModal.title}</h3>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                {drilldownModal.subtitle && (
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{drilldownModal.subtitle}</span>
                                )}
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                                    {filteredModalItems.length.toLocaleString()} คัน
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    มูลค่ารวม {modalTotalPrice.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setDrilldownModal(null)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-full bg-gray-50 dark:bg-gray-700 transition-colors"
                        >
                            <XIcon />
                        </button>
                    </div>

                    <div className="px-6 pt-4 pb-2">
                        <input
                            type="text"
                            value={modalSearchTerm}
                            onChange={(e) => setModalSearchTerm(e.target.value)}
                            placeholder="ค้นหาในรายการนี้ (VIN, รุ่น, สี, ชื่อลูกค้า, เซลล์, ทะเบียน, สาขา)..."
                            className="block w-full border border-gray-200 dark:border-gray-600 rounded-lg py-2 px-3.5 text-sm bg-gray-50 dark:bg-gray-700/50 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                    </div>

                    <div className="p-6 pt-3 flex-grow overflow-y-auto space-y-3">
                        {filteredModalItems.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                                ไม่พบข้อมูลรถยนต์ที่ตรงกับเงื่อนไข
                            </div>
                        ) : (
                            filteredModalItems.map(({ car, match }, idx) => (
                                <div
                                    key={car.id || `${car.vin}-${idx}`}
                                    className="bg-gray-50/70 dark:bg-gray-900/40 border border-gray-200/80 dark:border-gray-700 rounded-xl p-4 hover:border-sky-300 dark:hover:border-sky-700 transition-colors"
                                >
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-gray-900 dark:text-white">{car.model}</span>
                                                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                                        {car.color}
                                                    </span>
                                                    <StatusBadge status={car.status} />
                                                </div>
                                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
                                                    <div>
                                                        <span className="text-gray-400">VIN: </span>
                                                        <span className="font-mono font-semibold text-gray-800 dark:text-gray-100">{car.vin}</span>
                                                    </div>
                                                    {car.engineNo && (
                                                        <div>
                                                            <span className="text-gray-400">Engine: </span>
                                                            <span className="font-mono">{car.engineNo}</span>
                                                        </div>
                                                    )}
                                                    {car.frontMotorNo && (
                                                        <div>
                                                            <span className="text-gray-400">F.Motor: </span>
                                                            <span className="font-mono">{car.frontMotorNo}</span>
                                                        </div>
                                                    )}
                                                    {car.batteryNo && (
                                                        <div>
                                                            <span className="text-gray-400">Battery: </span>
                                                            <span className="font-mono">{car.batteryNo}</span>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="text-gray-400">Dealer: </span>
                                                        <span>{car.dealerCode} ({car.dealerName})</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-gray-400">Allocation: </span>
                                                        <span>{formatDisplayDate(car.allocationDate)}</span>
                                                    </div>
                                                    {car.stockLocation && (
                                                        <div>
                                                            <span className="text-gray-400">สาขา: </span>
                                                            <span>{car.stockLocation}{car.stockNo ? ` (S/N: ${car.stockNo})` : ''}</span>
                                                        </div>
                                                    )}
                                                    {car.stockInDate && (
                                                        <div>
                                                            <span className="text-gray-400">In Stock: </span>
                                                            <span>{formatDisplayDate(car.stockInDate)}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {match && (
                                                    <div className="mt-2.5 pt-2.5 border-t border-gray-200/70 dark:border-gray-700/70 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                                                        <div>
                                                            <span className="text-gray-400">ลูกค้า: </span>
                                                            <span className="font-semibold text-sky-700 dark:text-sky-300">{match.customerName || '-'}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-400">เซลล์: </span>
                                                            <span className="font-semibold text-indigo-700 dark:text-indigo-300">{match.salesperson || '-'}</span>
                                                        </div>
                                                        {match.saleDate && (
                                                            <div>
                                                                <span className="text-gray-400">วันที่ขาย/ส่งมอบ: </span>
                                                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatDisplayDate(match.saleDate)}</span>
                                                            </div>
                                                        )}
                                                        {match.licensePlate && (
                                                            <div>
                                                                <span className="text-gray-400">ทะเบียน: </span>
                                                                <span className="font-medium">{match.licensePlate}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="md:text-right shrink-0 pl-11 md:pl-0">
                                            <div className="text-[11px] text-gray-400 uppercase">ราคา</div>
                                            <div className="text-base font-bold text-slate-800 dark:text-white font-mono">
                                                {Number(car.price || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 rounded-b-2xl border-t border-gray-100 dark:border-gray-700 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setDrilldownModal(null)}
                            className="px-5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            ปิดหน้าต่าง
                        </button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};

export default StatisticsPage;
