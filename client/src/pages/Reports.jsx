import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, FileText, ChevronLeft, ChevronRight, Loader2, ArrowRightLeft } from 'lucide-react';

const Reports = () => {
    const [activeTab, setActiveTab] = useState('balance'); // 'balance', 'pnl', 'cashflow'
    const [year, setYear] = useState(new Date().getFullYear());
    const [period, setPeriod] = useState('ANNUAL');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [customRange, setCustomRange] = useState(false);
    const [fromMonth, setFromMonth] = useState('01');
    const [fromYear, setFromYear] = useState(new Date().getFullYear());
    const [toMonth, setToMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [toYear, setToYear] = useState(new Date().getFullYear());
    const [firstDate, setFirstDate] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        fetchFirstDate();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const fetchFirstDate = async () => {
        try {
            const res = await api.get('/reports/first-transaction-date');
            setFirstDate(res.data.minDate);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activeTab, year, period, showComparison, customRange, fromMonth, fromYear, toMonth, toYear]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let endpoint = '/reports/balance-sheet';
            if (activeTab === 'pnl') endpoint = '/reports/profit-loss';
            if (activeTab === 'cashflow') endpoint = '/reports/cash-flow';

            const res = await api.get(`${endpoint}`, {
                params: {
                    year,
                    period,
                    comparison: customRange ? 'custom' : showComparison ? 'true' : 'false',
                    fromMonth,
                    fromYear,
                    toMonth,
                    toYear
                }
            });
            setData(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const setRangeToStart = () => {
        if (!firstDate) return;
        const [y, m] = firstDate.split('-');
        setFromYear(parseInt(y));
        setFromMonth(m);
        setToYear(new Date().getFullYear());
        setToMonth(String(new Date().getMonth() + 1).padStart(2, '0'));
        setCustomRange(true);
        setShowComparison(false);
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const CashFlowTable = ({ results }) => {
        const catMap = {
            'REVENUE': { name: 'Cobros de Clientes / Ingresos', color: '#2e7d32' },
            'EXPENSE': { name: 'Pagos a Proveedores / Gasto', color: '#c62828' },
            'ASSET': { name: 'Inversiones / Otros Activos', color: '#1565c0' },
            'LIABILITY': { name: 'Financiación / Pasivos', color: '#7b1fa2' },
            'EQUITY': { name: 'Aportaciones de Socios', color: '#fbc02d' }
        };

        if (!results) return null;
        const periods = results.map(r => r.period);
        const categories = ['REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY'];

        const getCategoryValue = (periodData, cat) => {
            const act = periodData.activities.find(a => a.category === cat);
            return act ? act.net_cash : 0;
        };

        const getPeriodTotal = (periodData) => {
            return periodData.activities.reduce((sum, a) => sum + a.net_cash, 0);
        };

        return (
            <div style={{ marginBottom: '64px' }}>
                <h3 style={{ borderBottom: '2px solid #eee', paddingBottom: '8px', color: '#1a237e' }}>Detalle de Flujos de Efectivo</h3>
                <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'auto', minWidth: `${Math.max(400, (periods.length + 1) * 150)}px` }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa' }}>
                                <th style={{
                                    padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#1a237e',
                                    position: 'sticky', left: 0, background: '#f8f9fa', zIndex: 11,
                                    borderBottom: '2px solid #eee', width: '250px', minWidth: '200px',
                                    fontSize: isMobile ? '0.75rem' : '1rem'
                                }}>
                                    Categoría
                                </th>
                                {periods.map((p, i) => (
                                    <th key={i} style={{
                                        padding: '12px', textAlign: 'right', fontWeight: 'bold',
                                        borderBottom: '2px solid #eee',
                                        minWidth: '120px', fontSize: isMobile ? '0.7rem' : '1rem'
                                    }}>
                                        {p}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(cat => (
                                <tr key={cat} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{
                                        padding: '12px', color: catMap[cat]?.color || '#333', fontWeight: '500',
                                        position: 'sticky', left: 0, background: 'white', zIndex: 10,
                                        fontSize: isMobile ? '0.75rem' : '1rem', borderBottom: '1px solid #eee'
                                    }}>
                                        {catMap[cat]?.name || cat}
                                    </td>
                                    {results.map((res, i) => (
                                        <td key={i} style={{
                                            padding: '12px', textAlign: 'right', fontWeight: 'bold',
                                            color: getCategoryValue(res, cat) >= 0 ? '#2e7d32' : '#c62828',
                                            fontSize: isMobile ? '0.7rem' : '1rem',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {formatCurrency(getCategoryValue(res, cat)).replace('€', '').trim()}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr style={{ background: '#f0f2f5', borderTop: '2px solid #ccc' }}>
                                <td style={{
                                    padding: '12px', fontWeight: 'bold', fontSize: isMobile ? '0.8rem' : '1.1em',
                                    position: 'sticky', left: 0, background: '#f0f2f5', zIndex: 10
                                }}>
                                    Variación Neta de Efectivo
                                </td>
                                {results.map((res, i) => (
                                    <td key={i} style={{
                                        padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#1a237e',
                                        fontSize: isMobile ? '0.8rem' : '1.1em'
                                    }}>
                                        {formatCurrency(getPeriodTotal(res)).replace('€', '').trim()}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const AccountingTable = ({ results, type }) => {
        const groups = {
            'ASSET': 'ACTIVO',
            'LIABILITY': 'PASIVO',
            'EQUITY': 'PATRIMONIO NETO',
            'REVENUE': 'INGRESOS',
            'EXPENSE': 'GASTOS'
        };

        const subGroups = {
            'NON_CURRENT': 'No Corriente',
            'CURRENT': 'Corriente',
            'EQUITY': 'Patrimonio Neto'
        };

        if (!results || results.length === 0) return null;

        const accountMap = {};
        const periods = results.map(r => r.period);

        results.forEach((periodData, pIdx) => {
            const relevantAccounts = periodData.accounts.filter(a => a.type === type);
            relevantAccounts.forEach(acc => {
                if (!accountMap[acc.id]) {
                    accountMap[acc.id] = {
                        ...acc,
                        balances: new Array(results.length).fill(0),
                        children: []
                    };
                }
                accountMap[acc.id].balances[pIdx] = acc.balance;
            });
        });

        const allAccounts = Object.values(accountMap);
        if (allAccounts.length === 0) return null;

        const roots = [];
        allAccounts.forEach(node => {
            if (node.parent_id && accountMap[node.parent_id]) {
                accountMap[node.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        const calculateTotals = (node) => {
            let totals = [...node.balances];
            node.children.forEach(child => {
                const childTotals = calculateTotals(child);
                totals = totals.map((val, i) => val + childTotals[i]);
            });
            node.periodTotals = totals;
            return totals;
        };

        roots.forEach(root => calculateTotals(root));

        const groupedRoots = roots.reduce((acc, node) => {
            if (node.periodTotals.every(t => Math.abs(t) < 0.005)) return acc;
            const subtype = node.subtype || 'OTHER';
            if (!acc[subtype]) acc[subtype] = [];
            acc[subtype].push(node);
            return acc;
        }, {});

        const subtypeOrder = ['NON_CURRENT', 'CURRENT', 'EQUITY', 'OTHER'];
        const sectionTotals = roots.reduce((acc, root) => {
            return acc.map((val, i) => val + root.periodTotals[i]);
        }, new Array(results.length).fill(0));

        const AccountRow = ({ account, level = 0 }) => {
            if (account.periodTotals.every(t => Math.abs(t) < 0.005)) return null;
            const isBold = level === 0 || account.children.length > 0;
            return (
                <>
                    <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{
                            padding: isMobile ? '4px 0 4px 8px' : '8px 0 8px 16px',
                            paddingLeft: `${(isMobile ? 4 : 16) + level * (isMobile ? 6 : 20)}px`,
                            fontWeight: isBold ? 'bold' : 'normal',
                            color: isBold ? '#333' : '#666',
                            fontSize: level === 0 ? (isMobile ? '0.75rem' : '1.1em') : (isMobile ? '0.65rem' : '1em'),
                            textAlign: 'left',
                            position: 'sticky', left: 0, background: 'white', zIndex: 10,
                            minWidth: '200px', width: '250px'
                        }}>
                            {account.name}
                        </td>
                        {account.periodTotals.map((total, i) => (
                            <td key={i} style={{
                                padding: isMobile ? '2px 4px' : '8px 12px',
                                textAlign: 'right',
                                fontWeight: isBold ? 'bold' : 'normal',
                                color: isBold ? '#333' : '#666',
                                fontSize: isMobile ? '0.65rem' : '1rem',
                                whiteSpace: 'nowrap',
                                minWidth: '120px'
                            }}>
                                {formatCurrency(total).replace('€', '').trim()}
                            </td>
                        ))}
                    </tr>
                    {account.children.map(child => <AccountRow key={child.id} account={child} level={level + 1} />)}
                </>
            );
        };

        return (
            <div style={{ marginBottom: '32px' }}>
                <div style={{ overflowX: 'auto', background: 'white', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'auto', minWidth: `${Math.max(400, (periods.length + 1) * 150)}px` }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa' }}>
                                <th style={{
                                    padding: isMobile ? '8px' : '16px', textAlign: 'left', fontWeight: 'bold', color: '#1a237e',
                                    position: 'sticky', left: 0, background: '#f8f9fa', zIndex: 11,
                                    borderBottom: '2px solid #eee', width: '250px', minWidth: '200px',
                                    fontSize: isMobile ? '0.75rem' : '1rem'
                                }}>
                                    Cuenta
                                </th>
                                {periods.map((p, i) => (
                                    <th key={i} style={{
                                        padding: '12px', textAlign: 'right', fontWeight: 'bold',
                                        borderBottom: '2px solid #eee',
                                        minWidth: '120px', fontSize: isMobile ? '0.7rem' : '1rem'
                                    }}>
                                        {p}
                                    </th>
                                ))}
                            </tr>
                            <tr style={{ background: '#f1f3f9' }}>
                                <td style={{
                                    padding: isMobile ? '6px 12px' : '12px 24px',
                                    fontWeight: '900', color: '#1a237e', fontSize: isMobile ? '0.75rem' : '1.2rem',
                                    textTransform: 'uppercase', letterSpacing: '0.5px',
                                    position: 'sticky', left: 0, background: '#f1f3f9', zIndex: 10,
                                    borderBottom: '2px solid #eee'
                                }}>
                                    {groups[type]}
                                </td>
                                {sectionTotals.map((total, i) => (
                                    <td key={i} style={{
                                        padding: '12px', textAlign: 'right', fontWeight: '900',
                                        fontSize: isMobile ? '0.75rem' : '1.2rem', color: '#1a237e',
                                        borderBottom: '2px solid #eee', whiteSpace: 'nowrap'
                                    }}>
                                        {formatCurrency(total).replace('€', '').trim()}
                                    </td>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {subtypeOrder.map(subtype => groupedRoots[subtype] && (
                                <React.Fragment key={subtype}>
                                    <tr style={{ background: '#fafafa' }}>
                                        <td
                                            colSpan={periods.length + 1}
                                            style={{
                                                padding: isMobile ? '6px 12px' : '8px 24px',
                                                fontWeight: 'bold', color: '#666', fontSize: isMobile ? '0.7rem' : '0.9rem',
                                                textTransform: 'uppercase', background: '#fafafa'
                                            }}
                                        >
                                            {subGroups[subtype] || subtype}
                                        </td>
                                    </tr>
                                    {groupedRoots[subtype].map(node => (
                                        <AccountRow key={node.id} account={node} />
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#1a237e', color: 'white' }}>
                                <td style={{
                                    padding: isMobile ? '10px 12px' : '15px 24px', fontWeight: 'bold',
                                    fontSize: isMobile ? '0.8rem' : '1.1rem',
                                    position: 'sticky', left: 0, background: '#1a237e', zIndex: 10
                                }}>
                                    TOTAL {groups[type]}
                                </td>
                                {sectionTotals.map((total, i) => (
                                    <td key={i} style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: isMobile ? '0.8rem' : '1.1rem', whiteSpace: 'nowrap' }}>
                                        {formatCurrency(total)}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const getPeriodLabel = () => {
        if (customRange) {
            return `DESDE ${fromMonth}/${String(fromYear).substring(2)} HASTA ${toMonth}/${String(toYear).substring(2)}`;
        }
        if (period === 'ANNUAL') return activeTab === 'balance' ? `AL 31/12/${year}` : year;
        if (period.startsWith('M')) {
            const mStr = period.substring(1).padStart(2, '0');
            if (isNaN(parseInt(mStr))) {
                const nowM = String(new Date().getMonth() + 1).padStart(2, '0');
                return activeTab === 'balance' ? `AL CIERRE ${nowM}/${String(year).substring(2)}` : `${nowM}/${String(year).substring(2)}`;
            }
            return activeTab === 'balance' ? `AL CIERRE ${mStr}/${String(year).substring(2)}` : `${mStr}/${String(year).substring(2)}`;
        }
        return year;
    };

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: isMobile ? '8px' : '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '32px', gap: '20px' }}>
                <h1 style={{ margin: 0, color: '#1a237e' }}>Reporte Financiero</h1>

                <div style={{ display: 'flex', background: '#eee', padding: '4px', borderRadius: '10px' }}>
                    {[
                        { id: 'ANNUAL', label: 'Anual' },
                        { id: 'MONTHLY', label: 'Mensual' }
                    ].map(p => (
                        <button
                            key={p.id}
                            onClick={() => {
                                if (p.id === 'MONTHLY') {
                                    setPeriod(`M${String(new Date().getMonth() + 1).padStart(2, '0')}`);
                                } else {
                                    setPeriod('ANNUAL');
                                }
                                setCustomRange(false);
                                setShowComparison(false);
                            }}
                            style={{
                                padding: '8px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
                                background: period === p.id || (p.id === 'MONTHLY' && (period === 'MONTHLY' || period.startsWith('M'))) ? 'white' : 'transparent',
                                color: period === p.id || (p.id === 'MONTHLY' && (period === 'MONTHLY' || period.startsWith('M'))) ? 'var(--primary)' : '#666',
                                boxShadow: period === p.id || (p.id === 'MONTHLY' && (period === 'MONTHLY' || period.startsWith('M'))) ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                            }}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {(period === 'MONTHLY' || period.startsWith('M')) && !customRange && (
                    <select
                        value={period === 'MONTHLY' ? `M${String(new Date().getMonth() + 1).padStart(2, '0')}` : period}
                        onChange={(e) => setPeriod(e.target.value)}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}
                    >
                        {["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"].map((m, i) => (
                            <option key={i} value={`M${String(i + 1).padStart(2, '0')}`}>{m}</option>
                        ))}
                    </select>
                )}

                {!customRange && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'white', padding: '8px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <button onClick={() => setYear(y => y - 1)} className="btn-icon"><ChevronLeft size={20} /></button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '18px' }}>
                            <Calendar size={20} color="var(--primary)" />
                            {year}
                        </div>
                        <button onClick={() => setYear(y => y + 1)} className="btn-icon"><ChevronRight size={20} /></button>
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', padding: '8px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#666' }}>
                        <input
                            type="checkbox"
                            checked={customRange}
                            onChange={(e) => {
                                setCustomRange(e.target.checked);
                                if (e.target.checked) setShowComparison(false);
                            }}
                            style={{ width: '16px', height: '16px' }}
                        />
                        Rango Personalizado
                    </label>
                </div>

                {customRange && (
                    <div style={{
                        display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
                        background: '#f8f9fa', padding: '16px', borderRadius: '16px', border: '1px solid #eee'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '900', color: '#666', textTransform: 'uppercase' }}>Desde:</span>
                            {period !== 'ANNUAL' && (
                                <select value={fromMonth} onChange={(e) => setFromMonth(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ddd' }}>
                                    {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            )}
                            <input type="number" value={fromYear} onChange={(e) => setFromYear(parseInt(e.target.value))} style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #ddd' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', fontWeight: '900', color: '#666', textTransform: 'uppercase' }}>Hasta:</span>
                            {period !== 'ANNUAL' && (
                                <select value={toMonth} onChange={(e) => setToMonth(e.target.value)} style={{ padding: '6px', borderRadius: '6px', border: '1px solid #ddd' }}>
                                    {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            )}
                            <input type="number" value={toYear} onChange={(e) => setToYear(parseInt(e.target.value))} style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #ddd' }} />
                        </div>
                        <button
                            onClick={setRangeToStart}
                            style={{
                                padding: '8px 16px', background: '#1a237e', color: 'white', border: 'none', borderRadius: '8px',
                                cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <Calendar size={14} /> Inicio Datos
                        </button>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                    { id: 'balance', label: 'Balance de Situación', icon: <FileText size={18} /> },
                    { id: 'pnl', label: 'P&L (Resultados)', icon: <ArrowRightLeft size={18} /> },
                    { id: 'cashflow', label: 'Flujos de Caja', icon: <ArrowRightLeft size={18} /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: isMobile ? '8px 12px' : '12px 24px',
                            border: 'none',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: isMobile ? '0.7rem' : '0.95rem',
                            fontWeight: 'bold',
                            background: activeTab === tab.id ? '#1a237e' : 'white',
                            color: activeTab === tab.id ? 'white' : '#666',
                            boxShadow: activeTab === tab.id ? '0 4px 12px rgba(26,35,126,0.3)' : '0 2px 8px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '40px' }}><Loader2 className="animate-spin" size={40} color="#1a237e" /></div>
            ) : (
                <div style={{ background: 'white', padding: isMobile ? '12px' : '32px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <h2 style={{ margin: 0, textTransform: 'uppercase', color: '#1a237e', fontSize: '1.5rem', fontWeight: '800' }}>
                            {activeTab === 'balance' ? 'Balance de Situación' : activeTab === 'pnl' ? 'Estado de Resultados' : 'Flujos de Caja'}
                        </h2>
                        <div style={{ width: '40px', height: '4px', background: '#1a237e', margin: '16px auto', borderRadius: '2px' }}></div>
                        <h2 style={{ margin: 0, color: '#1a237e', fontSize: '1.2rem', fontWeight: '600', textTransform: 'uppercase' }}>PROVISIONAL {getPeriodLabel()}</h2>
                    </div>

                    {data && (data.results || (data.activities && data.activities.length > 0)) ? (
                        <>
                            {activeTab === 'balance' && (
                                <>
                                    <AccountingTable results={data.results} type="ASSET" />
                                    <AccountingTable results={data.results} type="LIABILITY" />
                                    <AccountingTable results={data.results} type="EQUITY" />
                                </>
                            )}
                            {activeTab === 'pnl' && (
                                <>
                                    <AccountingTable results={data.results} type="REVENUE" />
                                    <AccountingTable results={data.results} type="EXPENSE" />
                                </>
                            )}
                            {activeTab === 'cashflow' && (
                                <CashFlowTable results={data.results} />
                            )}
                        </>
                    ) : (
                        <p style={{ textAlign: 'center', color: '#666' }}>No hay datos para este periodo.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default Reports;
