import React, { useState } from 'react';

// Helpers
const formatNumber = (num) => {
    if (!num && num !== 0) return '-';
    if (num > 1e9) return (num / 1e9).toFixed(2) + ' B';
    if (num > 1e6) return (num / 1e6).toFixed(2) + ' M';
    return num.toLocaleString();
};

const formatPercent = (num) => {
    if (!num && num !== 0) return '-';
    return (num * 100).toFixed(2) + '%';
};

const MetricCard = ({ label, value, sublabel, color = '#111' }) => (
    <div style={{ padding: '16px', border: '1px solid #eee', borderRadius: '8px', background: '#fafafa' }}>
        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', color: color }}>{value || '-'}</div>
        {sublabel && <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>{sublabel}</div>}
    </div>
);

const StatementTable = ({ data, columns }) => {
    if (!data || data.length === 0) return <div>No hay datos disponibles para este estado financiero.</div>;

    return (
        <div style={{ overflowX: 'auto', marginTop: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                    <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                        <th style={{ padding: '12px', textAlign: 'left', minWidth: '200px' }}>Concepto</th>
                        {data.map((period, i) => (
                            <th key={i} style={{ padding: '12px', textAlign: 'right' }}>
                                {period.endDate ? new Date(period.endDate).toLocaleDateString() : `Periodo ${i + 1}`}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {columns.map((col, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px', fontWeight: col.bold ? 'bold' : 'normal', paddingLeft: col.indent ? '20px' : '10px' }}>
                                {col.label}
                            </td>
                            {data.map((period, i) => (
                                <td key={i} style={{ padding: '10px', textAlign: 'right', color: '#444' }}>
                                    {formatNumber(period[col.key])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const FinancialAnalysis = ({ data, loading, period, setPeriod, onSearch }) => {
    const [tab, setTab] = useState('metrics'); // 'metrics', 'income', 'balance', 'cash'
    const [searchTerm, setSearchTerm] = useState('');

    const handleSearch = (e) => {
        e.preventDefault();
        if (searchTerm.trim()) {
            onSearch(searchTerm.trim().toUpperCase());
            setSearchTerm('');
        }
    };

    if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Cargando datos financieros...</div>;

    const metrics = data?.metrics || {};
    const incomeStatement = data?.incomeStatement || [];
    const balanceSheet = data?.balanceSheet || [];
    const cashFlow = data?.cashFlow || [];
    const ticker = data?.ticker || '';

    const incomeColumns = [
        { label: 'Ingresos Totales', key: 'totalRevenue', bold: true },
        { label: 'Costo de Ventas', key: 'costOfRevenue' },
        { label: 'Beneficio Bruto', key: 'grossProfit', bold: true },
        { label: 'Gastos de Operación', key: 'totalOperatingExpenses' },
        { label: 'EBIT', key: 'ebit', bold: true },
        { label: 'Intereses', key: 'interestExpense' },
        { label: 'Ingresos Netos', key: 'netIncome', bold: true },
    ];

    const balanceColumns = [
        { label: 'Activos Totales', key: 'totalAssets', bold: true },
        { label: 'Activos Corrientes', key: 'totalCurrentAssets' },
        { label: 'Efectivo', key: 'cash' },
        { label: 'Inventario', key: 'inventory' },
        { label: 'Pasivos Totales', key: 'totalLiab', bold: true },
        { label: 'Pasivos Corrientes', key: 'totalCurrentLiabilities' },
        { label: 'Deuda Total', key: 'longTermDebt' },
        { label: 'Patrimonio Total', key: 'totalStockholderEquity', bold: true },
    ];

    const cashFlowColumns = [
        { label: 'Flujo de Operaciones', key: 'totalCashFromOperatingActivities', bold: true },
        { label: 'Flujo de Inversión', key: 'totalCashflowsFromInvestingActivities' },
        { label: 'CapEx', key: 'capitalExpenditures' },
        { label: 'Flujo de Financiación', key: 'totalCashFromFinancingActivities' },
        { label: 'Cambio Neto en Efectivo', key: 'changeInCash', bold: true },
    ];

    if (!data && !loading) return (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: '20px', textAlign: 'center' }}>
            <h3>Análisis Fundamental</h3>
            <p>Ingresa un ticker para comenzar</p>
            <form onSubmit={handleSearch} style={{ display: 'inline-flex', gap: '8px' }}>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Ej: AAPL"
                    style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer' }}>Buscar</button>
            </form>
        </div>
    );

    return (
        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '24px', color: '#111' }}>Análisis Fundamental: {ticker}</h2>
                        <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>
                            Precio: {metrics?.price?.toFixed(2)} {metrics?.currency} | Market Cap: {formatNumber(metrics?.marketCap)}
                        </p>
                    </div>
                    {/* Search Input in Header */}
                    <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar otro ticker..."
                            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '13px', width: '150px' }}
                        />
                        <button type="submit" style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#2563eb', color: 'white', cursor: 'pointer', fontSize: '13px' }}>Ir</button>
                    </form>
                </div>

                <div style={{ display: 'flex', gap: '16px' }}>
                    {/* Period Toggle */}
                    <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '8px', padding: '4px' }}>
                        <button
                            onClick={() => setPeriod('annual')}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                background: period === 'annual' ? 'white' : 'transparent',
                                borderRadius: '6px',
                                fontWeight: '600',
                                color: period === 'annual' ? '#2563eb' : '#6b7280',
                                boxShadow: period === 'annual' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer'
                            }}
                        >
                            Anual
                        </button>
                        <button
                            onClick={() => setPeriod('quarterly')}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                background: period === 'quarterly' ? 'white' : 'transparent',
                                borderRadius: '6px',
                                fontWeight: '600',
                                color: period === 'quarterly' ? '#2563eb' : '#6b7280',
                                boxShadow: period === 'quarterly' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                                cursor: 'pointer'
                            }}
                        >
                            Trimestral
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['metrics', 'income', 'balance', 'cash'].map(t => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: tab === t ? '#2563eb' : '#f3f4f6',
                                    color: tab === t ? 'white' : '#4b5563',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px'
                                }}
                            >
                                {t === 'metrics' ? 'Métricas' : t === 'income' ? 'Ingresos' : t === 'balance' ? 'Balance' : 'Flujo'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {tab === 'metrics' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                    <MetricCard label="PER (Trailing)" value={metrics?.peRatio?.toFixed(2)} sublabel={`Forward: ${metrics?.forwardPE?.toFixed(2)}`} />
                    <MetricCard label="PEG Ratio" value={metrics?.pegRatio?.toFixed(2)} color={metrics?.pegRatio < 1 ? 'green' : 'black'} />
                    <MetricCard label="Price / Book" value={metrics?.priceToBook?.toFixed(2)} />
                    <MetricCard label="EV / EBITDA" value={metrics?.evToEbitda?.toFixed(2)} />
                    <MetricCard label="Profit Margin" value={formatPercent(metrics?.profitMargin)} />
                    <MetricCard label="Operating Margin" value={formatPercent(metrics?.operatingMargin)} />
                    <MetricCard label="ROE" value={formatPercent(metrics?.roe)} />
                    <MetricCard label="ROA" value={formatPercent(metrics?.roa)} />
                    <MetricCard label="Dividend Yield" value={formatPercent(metrics?.dividendYield)} />
                    <MetricCard label="Payout Ratio" value={formatPercent(metrics?.payoutRatio)} />
                    <MetricCard label="Current Ratio" value={metrics?.currentRatio?.toFixed(2)} />
                    <MetricCard label="Quick Ratio" value={metrics?.quickRatio?.toFixed(2)} />
                    <MetricCard label="Debt / Equity" value={metrics?.debtToEquity?.toFixed(2)} />
                    <MetricCard label="Free Cash Flow" value={formatNumber(metrics?.freeCashFlow)} />
                </div>
            )}

            {tab === 'income' && <StatementTable data={incomeStatement} columns={incomeColumns} />}
            {tab === 'balance' && <StatementTable data={balanceSheet} columns={balanceColumns} />}
            {tab === 'cash' && <StatementTable data={cashFlow} columns={cashFlowColumns} />}
        </div>
    );
};

export default FinancialAnalysis;
