import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, PointElement, LineElement } from 'chart.js';
import { TrendingUp, Wallet, ArrowRightLeft, Plus } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const FinanceDashboard = () => {
    const [trendType, setTrendType] = useState('ANNUAL'); // 'ANNUAL' or 'QUARTERLY'
    const [trends, setTrends] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [trendRes, summaryRes] = await Promise.all([
                    api.get(`/reports/trends?type=${trendType}`),
                    api.get('/reports/dashboard')
                ]);
                setTrends(trendRes.data);
                setSummary(summaryRes.data.summary);
            } catch (err) {
                console.error("Failed to fetch dashboard data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [trendType]);

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(val);
    };

    const FinanceSection = ({ title, icon, chartData, tableData, type }) => (
        <div className="card" style={{ marginBottom: '40px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', padding: '8px', borderRadius: '8px', color: '#6366f1' }}>
                    {icon}
                </div>
                <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{title}</h2>
            </div>

            {/* Chart Area */}
            <div style={{ height: '300px', marginBottom: '40px' }}>
                <Bar
                    data={chartData}
                    options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                align: 'start',
                                labels: { boxWidth: 10, usePointStyle: true, font: { size: 12 } }
                            },
                        },
                        scales: {
                            y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 } } },
                            x: { grid: { display: false }, ticks: { font: { size: 11 } } }
                        }
                    }}
                />
            </div>

            {/* Data Table (Below Chart as requested in Photo 2) */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #eee' }}>
                            <th style={{ textAlign: 'left', padding: '12px 16px', color: '#666', fontWeight: '500', width: '250px' }}>Período</th>
                            {tableData.map((d, i) => (
                                <th key={i} style={{ textAlign: 'right', padding: '12px 16px', color: '#666', fontWeight: '500' }}>{d.period}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {type === 'pnl' ? (
                            <>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Ingresos totales</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.revenue)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Beneficio bruto</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.gross_profit || 0)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Resultado de explotación</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.operating_result || 0)}</td>)}
                                </tr>
                                <tr>
                                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>Resultado atribuido al grupo</td>
                                    {tableData.map((d, i) => (
                                        <td key={i} style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 'bold' }}>
                                            {formatCurrency(d.net_result)}
                                        </td>
                                    ))}
                                </tr>
                            </>
                        ) : type === 'balance' ? (
                            <>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Activos</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.total_assets || 0)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Pasivos</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.total_liabilities || 0)}</td>)}
                                </tr>
                                <tr>
                                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>Patrimonio Neto</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 'bold' }}>{formatCurrency(d.total_equity || 0)}</td>)}
                                </tr>
                            </>
                        ) : (
                            <>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Flujos de actividades de explotación</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.op_cf || 0)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Flujos de actividades de inversión</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.inv_cf || 0)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#888' }}>Flujos de actividades de financiación</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(d.fin_cf || 0)}</td>)}
                                </tr>
                                <tr style={{ borderBottom: '1px solid #f9f9f9' }}>
                                    <td style={{ padding: '12px 16px', color: '#6366f1', fontWeight: '500' }}>Free Cash Flow</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px', color: '#6366f1', fontWeight: '500' }}>{formatCurrency(d.fcf || 0)}</td>)}
                                </tr>
                                <tr>
                                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>Flujo Neto</td>
                                    {tableData.map((d, i) => <td key={i} style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 'bold', color: d.net_result >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(d.net_result)}</td>)}
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (loading) return <div className="card" style={{ padding: '60px', textAlign: 'center' }}>Cargando Informe Financiero...</div>;

    const pnlChartData = {
        labels: trends.map(t => t.period),
        datasets: [
            { label: 'Ingresos totales', data: trends.map(t => t.revenue), backgroundColor: '#6366f1', borderRadius: 4 },
            { label: 'Resultado atribuido al grupo', data: trends.map(t => t.net_result), backgroundColor: '#e5e7eb', borderRadius: 4 }
        ]
    };

    const balanceChartData = {
        labels: trends.map(t => t.period),
        datasets: [
            { label: 'Activos', data: trends.map(t => t.total_assets), backgroundColor: '#6366f1', borderRadius: 4 },
            { label: 'Pasivos', data: trends.map(t => t.total_liabilities), backgroundColor: '#e5e7eb', borderRadius: 4 }
        ]
    };

    const cashflowChartData = {
        labels: trends.map(t => t.period),
        datasets: [
            { label: 'Explotación', data: trends.map(t => t.op_cf), backgroundColor: '#6366f1', borderRadius: 4 },
            { label: 'Inversión', data: trends.map(t => t.inv_cf), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Financiación', data: trends.map(t => t.fin_cf), backgroundColor: '#e5e7eb', borderRadius: 4 }
        ]
    };

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
                <div>
                    <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Informe Financiero</h1>
                    <p style={{ color: '#666', margin: 0 }}>Tendencias históricas y desglose de resultados.</p>
                </div>

                <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                    <button
                        onClick={() => setTrendType('QUARTERLY')}
                        style={{
                            padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px',
                            background: trendType === 'QUARTERLY' ? 'white' : 'transparent',
                            color: trendType === 'QUARTERLY' ? '#333' : '#64748b',
                            boxShadow: trendType === 'QUARTERLY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        Trimestral
                    </button>
                    <button
                        onClick={() => setTrendType('ANNUAL')}
                        style={{
                            padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '600', fontSize: '14px',
                            background: trendType === 'ANNUAL' ? 'white' : 'transparent',
                            color: trendType === 'ANNUAL' ? '#333' : '#64748b',
                            boxShadow: trendType === 'ANNUAL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        Anual
                    </button>
                </div>
            </div>


            {/* Vertical Stack sections as requested */}
            <FinanceSection
                title="Cuenta de Resultados"
                icon={<ArrowRightLeft size={22} />}
                chartData={pnlChartData}
                tableData={trends.slice(-4)}
                type="pnl"
            />

            <FinanceSection
                title="Balance de Situación"
                icon={<Wallet size={22} />}
                chartData={balanceChartData}
                tableData={trends.slice(-4)}
                type="balance"
            />

            <FinanceSection
                title="Flujos de Caja"
                icon={<TrendingUp size={22} />}
                chartData={cashflowChartData}
                tableData={trends.slice(-4)}
                type="cashflow"
            />
        </div>
    );
};

export default FinanceDashboard;
