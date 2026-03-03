import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Calendar, FileText, ChevronLeft, ChevronRight, Loader2, ArrowRightLeft } from 'lucide-react';

const Reports = () => {
    const [activeTab, setActiveTab] = useState('balance'); // 'balance', 'pnl', 'cashflow'
    const [year, setYear] = useState(new Date().getFullYear());
    const [period, setPeriod] = useState('ANNUAL'); // 'ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4'
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showComparison, setShowComparison] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        fetchData();
    }, [activeTab, year, period, showComparison]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let endpoint = '/reports/balance-sheet';
            if (activeTab === 'pnl') endpoint = '/reports/profit-loss';
            if (activeTab === 'cashflow') endpoint = '/reports/cash-flow';

            const res = await api.get(`${endpoint}?year=${year}&period=${period}&comparison=${showComparison}`);
            setData(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
    };

    const CashFlowTable = ({ activities }) => {
        const catMap = {
            'REVENUE': { name: 'Cobros de Clientes / Ingresos', color: '#2e7d32' },
            'EXPENSE': { name: 'Pagos a Proveedores / Gastos', color: '#c62828' },
            'ASSET': { name: 'Inversiones / Otros Activos', color: '#1565c0' },
            'LIABILITY': { name: 'Financiación / Pasivos', color: '#7b1fa2' },
            'EQUITY': { name: 'Aportaciones de Socios', color: '#fbc02d' }
        };

        const total = activities.reduce((sum, a) => sum + a.net_cash, 0);

        return (
            <div style={{ marginBottom: '32px' }}>
                <h3 style={{ borderBottom: '2px solid #eee', paddingBottom: '8px', color: '#1a237e' }}>Detalle de Flujos de Efectivo</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8f9fa' }}>
                            <td style={{ padding: '12px', fontWeight: 'bold' }}>Categoría de Actividad</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold' }}>Impacto en Caja</td>
                        </tr>
                    </thead>
                    <tbody>
                        {activities.length > 0 ? activities.map((act, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '12px', color: catMap[act.category]?.color || '#333', fontWeight: '500' }}>
                                    {catMap[act.category]?.name || act.category}
                                </td>
                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: act.net_cash >= 0 ? '#2e7d32' : '#c62828' }}>
                                    {formatCurrency(act.net_cash)}
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan="2" style={{ padding: '24px', textAlign: 'center', color: '#999' }}>No hay movimientos de caja en este periodo</td>
                            </tr>
                        )}
                        <tr style={{ background: '#f0f2f5', borderTop: '2px solid #ccc' }}>
                            <td style={{ padding: '12px', fontWeight: 'bold', fontSize: '1.1em' }}>Variación Neta de Efectivo</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', color: '#1a237e', fontSize: '1.1em' }}>
                                {formatCurrency(total)}
                            </td>
                        </tr>
                    </tbody>
                </table>
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

        // Unified Account Map
        const accountMap = {};
        const periods = results.map(r => r.period);

        results.forEach((periodData, pIdx) => {
            const relevantAccounts = periodData.accounts.filter(a => {
                return a.type === type;
            });

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

        // Build Hierarchy Tree
        const roots = [];
        allAccounts.forEach(node => {
            if (node.parent_id && accountMap[node.parent_id]) {
                accountMap[node.parent_id].children.push(node);
            } else {
                roots.push(node);
            }
        });

        // Recursive Total Calculation for each period
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

        // Group Roots by Subtype
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
                            textAlign: 'left'
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
                                whiteSpace: 'nowrap'
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
            <div style={{ marginBottom: '64px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '4px solid #000' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '40%' }}></th>
                            {periods.map((p, i) => (
                                <th key={i} style={{
                                    textAlign: 'right',
                                    padding: isMobile ? '4px 2px' : '16px 12px',
                                    minWidth: isMobile ? '50px' : '120px',
                                    textTransform: 'uppercase',
                                    fontSize: isMobile ? '0.6rem' : '1rem',
                                    color: '#000',
                                    fontWeight: '900',
                                    borderBottom: '2px solid #000',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {p}
                                </th>
                            ))}
                        </tr>
                        {/* Main Group Header Row with Totals */}
                        <tr style={{ borderBottom: '1px solid #000' }}>
                            <td style={{
                                padding: isMobile ? '4px 0' : '16px 0',
                                fontWeight: '900',
                                fontSize: isMobile ? '0.75rem' : '1.2rem',
                                color: '#000',
                                textTransform: 'uppercase',
                                textAlign: 'left'
                            }}>
                                {groups[type]}
                            </td>
                            {sectionTotals.map((total, i) => (
                                <td key={i} style={{
                                    padding: isMobile ? '4px 2px' : '16px 12px',
                                    textAlign: 'right',
                                    fontWeight: '900',
                                    fontSize: isMobile ? '0.75rem' : '1.2rem',
                                    color: '#000',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {formatCurrency(total).replace('€', '').trim()}
                                </td>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {roots.map(root => (
                            <AccountRow key={root.id} account={root} />
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const getPeriodLabel = () => {
        if (period === 'ANNUAL') return activeTab === 'balance' ? `31/12/${year}` : year;
        const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        if (period.startsWith('M')) {
            const mIdx = parseInt(period.substring(1)) - 1;
            return activeTab === 'balance' ? `Cierre ${months[mIdx]} ${year}` : `${months[mIdx]} ${year}`;
        }
        return activeTab === 'balance' ? `Mensual ${year}` : `Mensual ${year}`;
    };

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '32px', gap: '20px' }}>
                <h1 style={{ margin: 0 }}>Reporte Financiero</h1>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', background: '#eee', padding: '4px', borderRadius: '10px' }}>
                        {[
                            { id: 'ANNUAL', label: 'Anual' },
                            { id: 'MONTHLY', label: 'Mensual' }
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => setPeriod(p.id)}
                                style={{
                                    padding: '8px 24px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
                                    background: period === p.id || (p.id === 'MONTHLY' && period.startsWith('M')) ? 'white' : 'transparent',
                                    color: period === p.id || (p.id === 'MONTHLY' && period.startsWith('M')) ? 'var(--primary)' : '#666',
                                    boxShadow: period === p.id || (p.id === 'MONTHLY' && period.startsWith('M')) ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    {(period === 'MONTHLY' || period.startsWith('M')) && (
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', padding: '8px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', color: '#666' }}>
                            <input
                                type="checkbox"
                                checked={showComparison}
                                onChange={(e) => setShowComparison(e.target.checked)}
                                style={{ width: '16px', height: '16px' }}
                            />
                            Ver Comparativa
                        </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'white', padding: '8px 16px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                        <button onClick={() => setYear(y => y - 1)} className="btn-icon"><ChevronLeft size={20} /></button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '18px' }}>
                            <Calendar size={20} color="var(--primary)" />
                            {year}
                        </div>
                        <button onClick={() => setYear(y => y + 1)} className="btn-icon"><ChevronRight size={20} /></button>
                    </div>
                </div>
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
                            padding: '12px 24px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: activeTab === tab.id ? 'var(--primary)' : 'white',
                            color: activeTab === tab.id ? 'white' : '#666',
                            fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="card" style={{ padding: isMobile ? '16px' : '40px' }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                        <Loader2 className="animate-spin" size={48} color="var(--primary)" />
                    </div>
                ) : (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '60px' }}>
                            <h1 style={{
                                margin: 0,
                                color: '#448aff',
                                fontSize: isMobile ? '1.5rem' : '2.5rem',
                                fontWeight: '900',
                                letterSpacing: '1px',
                                textTransform: 'uppercase'
                            }}>
                                {activeTab === 'balance' ? 'BALANCE DE SITUACIÓN' :
                                    activeTab === 'pnl' ? 'CUENTA DE RESULTADOS' :
                                        'FLUJOS DE EFECTIVO'}
                            </h1>
                            <div style={{
                                width: '100px',
                                height: '4px',
                                background: '#448aff',
                                margin: '16px auto',
                                borderRadius: '2px'
                            }}></div>
                            <h2 style={{
                                margin: 0,
                                color: '#1a237e',
                                fontSize: '1.2rem',
                                fontWeight: '600',
                                textTransform: 'uppercase'
                            }}>PROVISIONAL</h2>
                        </div>

                        {data && (data.results || (data.activities && data.activities.length > 0)) ? (
                            activeTab === 'balance' ? (
                                <>
                                    <AccountingTable results={data.results} type="ASSET" />
                                    <AccountingTable results={data.results} type="LIABILITY" />
                                    <AccountingTable results={data.results} type="EQUITY" />
                                </>
                            ) : activeTab === 'pnl' ? (
                                <>
                                    <AccountingTable results={data.results} type="REVENUE" />
                                    <AccountingTable results={data.results} type="EXPENSE" />

                                    <div style={{
                                        marginTop: '40px', padding: '32px', borderRadius: '16px',
                                        background: '#f8f9fa',
                                        border: '1px solid #eee',
                                        display: 'flex', flexDirection: 'column'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1a237e' }}>RESULTADO DEL PERIODO</span>
                                            <div style={{ display: 'flex', gap: '24px' }}>
                                                {data.results.map((res, i) => {
                                                    const rev = res.accounts.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.balance, 0);
                                                    const exp = res.accounts.filter(a => a.type === 'EXPENSE').reduce((s, a) => s + a.balance, 0);
                                                    const net = rev - exp;
                                                    return (
                                                        <div key={i} style={{ textAlign: 'right', minWidth: '120px' }}>
                                                            <div style={{ fontSize: '0.8rem', color: '#888', textTransform: 'uppercase' }}>{res.period}</div>
                                                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: net >= 0 ? '#2e7d32' : '#c62828' }}>
                                                                {formatCurrency(net).replace('€', '').trim()}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <CashFlowTable activities={data.activities} />
                            )
                        ) : (
                            <div style={{ textAlign: 'center', padding: '80px', color: '#999' }}>
                                <Calendar size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                                <p>No hay datos registrados para el periodo seleccionado</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default Reports;
