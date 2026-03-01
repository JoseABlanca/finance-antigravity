import React, { useState, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';
import api from '../services/api';
import { Line, Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend
);

const barDataLabels = {
    id: 'barDataLabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((bar, index) => {
                const value = dataset.data[index];
                if (value !== 0 && value !== null && value !== undefined) {
                    ctx.save();
                    ctx.font = 'bold 11px sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 3;

                    const yPos = (bar.y + bar.base) / 2;
                    const formattedValue = new Intl.NumberFormat('es-ES', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                    }).format(value) + '€';

                    ctx.fillText(formattedValue, bar.x, yPos);
                    ctx.restore();
                }
            });
        });
    }
};

const Investments = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [trades, setTrades] = useState([]);
    const [showTradeForm, setShowTradeForm] = useState(false);
    const [editingTrade, setEditingTrade] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [selectedYear, setSelectedYear] = useState('ALL');
    const [chartData, setChartData] = useState(null);
    const [portfolioMetrics, setPortfolioMetrics] = useState(null);
    const [dailyReturns, setDailyReturns] = useState([]);
    const [drawdownHistory, setDrawdownHistory] = useState([]);
    const [balanceHistory, setBalanceHistory] = useState([]);

    // New Dashboard State
    const [dashboardSummary, setDashboardSummary] = useState(null);
    const [investTrendType, setInvestTrendType] = useState('MONTHLY');
    const [selectedTicker, setSelectedTicker] = useState('ALL');

    // Filters
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: '',
        type: 'ALL',
        id: ''
    });

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        symbol: '',
        action: 'BUY',
        quantity: 0,
        price: 0,
        fee: 0,
        currency: 'EUR',
        exchange_rate: 1.0,
        cashAccountId: '',
        assetAccountId: '',
        broker: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (activeTab === 'dashboard') {
            fetchChartData();
        }
    }, [activeTab, selectedYear, selectedTicker]);

    const fetchData = async () => {
        try {
            const [tradesRes, accountsRes] = await Promise.all([
                api.get('/investments/portfolio'),
                api.get('/accounts')
            ]);
            setTrades(tradesRes.data);
            const accountsData = accountsRes.data;
            setAccounts(accountsData);

            // Set defaults if they exist
            const cashAcc = accountsData.find(a => a.name.toLowerCase().includes('cash en broker'));
            const assetAcc = accountsData.find(a => a.name.toLowerCase().includes('acciones'));

            if (cashAcc || assetAcc) {
                setFormData(prev => ({
                    ...prev,
                    cashAccountId: cashAcc ? cashAcc.id : prev.cashAccountId,
                    assetAccountId: assetAcc ? assetAcc.id : prev.assetAccountId
                }));
            }
        } catch (err) {
            console.error("Failed to load investment data", err);
        }
    };

    const fetchChartData = async () => {
        try {
            const analyzeParams = {
                benchmark: 'SPY',
                currency: 'EUR'
            };

            if (selectedYear !== 'ALL') {
                analyzeParams.startDate = `${selectedYear}-01-01`;
                analyzeParams.endDate = `${selectedYear}-12-31`;
            } else {
                analyzeParams.years = 10;
            }

            const res = await api.get(`/investments/analyze/${selectedTicker === 'ALL' ? 'PORTFOLIO' : selectedTicker}`, {
                params: analyzeParams
            });

            // Fetch Summary Data
            try {
                const summaryRes = await api.get('/investments/dashboard-summary', {
                    params: {
                        ticker: selectedTicker,
                        year: selectedYear
                    }
                });
                setDashboardSummary(summaryRes.data);
            } catch (e) {
                console.error("Failed to fetch dashboard summary", e);
            }

            // Transform for Charts
            const prices = res.data.strategyHistory || [];
            if (prices.length > 0) {
                const labels = prices.map(p => new Date(p.date).toLocaleDateString());
                const data = prices.map(p => p.close);

                setChartData({
                    labels,
                    datasets: [{
                        label: selectedTicker === 'ALL' ? 'Valor de Cartera' : `Valor de ${selectedTicker}`,
                        data: data,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.1,
                        pointRadius: 0
                    }]
                });

                // Metrics from response if available, or calculate simple ones
                if (res.data.strategyHistory && res.data.strategyHistory.length > 0) {
                    const history = res.data.strategyHistory;
                    const lastVal = history[history.length - 1].close;
                    setPortfolioMetrics({ currentValue: lastVal });

                    // New: Store detailed history for charts
                    if (res.data.dailyReturns) setDailyReturns(res.data.dailyReturns);
                    if (res.data.drawdownHistory) setDrawdownHistory(res.data.drawdownHistory);
                    setBalanceHistory(res.data.strategyHistory || []);
                }
            }
        } catch (err) {
            console.error("Failed to load chart data", err);
        }
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
    };

    const handleTradeSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingTrade) {
                await api.put(`/investments/trade/${editingTrade.id}`, formData);
            } else {
                await api.post('/investments/trade', formData);
            }
            setShowTradeForm(false);
            setEditingTrade(null);
            resetForm();
            fetchData();
        } catch (err) {
            alert("Trade failed: " + (err.response?.data?.error || err.message));
        }
    };

    const handleDeleteTrade = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar esta operación?")) return;
        try {
            await api.delete(`/investments/trade/${id}`);
            fetchData();
        } catch (err) {
            alert("Delete failed: " + (err.response?.data?.error || err.message));
        }
    };

    const handleEditClick = (trade) => {
        setEditingTrade(trade);

        // Try to find default accounts even for edit if they are missing
        const cashAcc = accounts.find(a => a.name.toLowerCase().includes('cash en broker'));
        const assetAcc = accounts.find(a => a.name.toLowerCase().includes('acciones'));

        setFormData({
            date: trade.date,
            symbol: trade.symbol,
            action: trade.action,
            quantity: trade.quantity,
            price: trade.price,
            fee: trade.fee,
            currency: trade.currency || 'EUR',
            exchange_rate: trade.exchange_rate || 1.0,
            cashAccountId: cashAcc ? cashAcc.id : '',
            assetAccountId: assetAcc ? assetAcc.id : '',
            broker: trade.broker || ''
        });
        setShowTradeForm(true);
    };

    const resetForm = () => {
        const cashAcc = accounts.find(a => a.name.toLowerCase().includes('cash en broker'));
        const assetAcc = accounts.find(a => a.name.toLowerCase().includes('acciones'));

        setFormData({
            date: new Date().toISOString().split('T')[0],
            symbol: '',
            action: 'BUY',
            quantity: 0,
            price: 0,
            fee: 0,
            currency: 'EUR',
            exchange_rate: 1.0,
            cashAccountId: cashAcc ? cashAcc.id : '',
            assetAccountId: assetAcc ? assetAcc.id : '',
            broker: ''
        });
    };

    // Filtered Trades
    const filteredTrades = trades.filter(t => {
        const matchesType = filters.type === 'ALL' || t.action === filters.type;
        const matchesStart = !filters.startDate || new Date(t.date) >= new Date(filters.startDate);
        const matchesEnd = !filters.endDate || new Date(t.date) <= new Date(filters.endDate);
        const matchesId = !filters.id || t.id.toString().includes(filters.id);
        return matchesType && matchesStart && matchesEnd && matchesId;
    });

    const assetAccounts = accounts.filter(a => a.type === 'ASSET');

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1>Inversiones</h1>
                <button className="btn" onClick={() => { setEditingTrade(null); resetForm(); setShowTradeForm(true); }}>+ Registrar Operación</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid #ccc' }}>
                <button
                    style={{ padding: '10px 20px', border: 'none', background: 'none', borderBottom: activeTab === 'dashboard' ? '3px solid #5e6ad2' : 'none', fontWeight: activeTab === 'dashboard' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setActiveTab('dashboard')}
                >
                    Dashboard
                </button>
                <button
                    style={{ padding: '10px 20px', border: 'none', background: 'none', borderBottom: activeTab === 'brokers' ? '3px solid #5e6ad2' : 'none', fontWeight: activeTab === 'brokers' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setActiveTab('brokers')}
                >
                    Brokers
                </button>
                <button
                    style={{ padding: '10px 20px', border: 'none', background: 'none', borderBottom: activeTab === 'operations' ? '3px solid #5e6ad2' : 'none', fontWeight: activeTab === 'operations' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setActiveTab('operations')}
                >
                    Operaciones
                </button>
            </div>

            {activeTab === 'dashboard' && (
                <>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginBottom: '16px' }}>
                        <select
                            value={selectedTicker}
                            onChange={e => setSelectedTicker(e.target.value)}
                            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', fontWeight: '600' }}
                        >
                            <option value="ALL">Cartera Total</option>
                            {[...new Set(trades.map(t => t.symbol))].map(sym => (
                                <option key={sym} value={sym}>{sym}</option>
                            ))}
                        </select>

                        <select
                            value={selectedYear}
                            onChange={e => setSelectedYear(e.target.value)}
                            style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', fontWeight: '600' }}
                        >
                            <option value="ALL">Todo el Histórico</option>
                            <option value="2025">Año 2025</option>
                            <option value="2026">Año 2026</option>
                            <option value="2027">Año 2027</option>
                        </select>
                    </div>

                    <div className="dashboard-grid" style={{ marginBottom: '32px', display: 'block' }}>
                        {/* Metrics Cards */}
                        {dashboardSummary && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px', marginBottom: '32px' }}>
                                <div className="card" style={{ padding: '24px' }}>
                                    <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '0.9rem' }}>Total Invertido (Costo)</p>
                                    <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#333' }}>
                                        {formatCurrency(dashboardSummary.summary.invested)}
                                    </p>
                                </div>
                                <div className="card" style={{ padding: '24px' }}>
                                    <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '0.9rem' }}>Valor Actual</p>
                                    <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: '#333' }}>
                                        {formatCurrency(dashboardSummary.summary.currentValue)}
                                    </p>
                                </div>
                                <div className="card" style={{ padding: '24px' }}>
                                    <p style={{ margin: '0 0 8px 0', color: '#64748b', fontSize: '0.9rem' }}>Ganancia / Pérdida</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                        <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 'bold', color: dashboardSummary.summary.pl >= 0 ? '#10b981' : '#ef4444' }}>
                                            {dashboardSummary.summary.pl >= 0 ? '+' : ''}{formatCurrency(dashboardSummary.summary.pl)}
                                        </p>
                                        <span style={{
                                            color: dashboardSummary.summary.pl >= 0 ? '#10b981' : '#ef4444',
                                            fontWeight: '600',
                                            background: dashboardSummary.summary.pl >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.9rem'
                                        }}>
                                            {dashboardSummary.summary.plPercent.toFixed(2)}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Bar Chart Section */}
                        {dashboardSummary && (
                            <div className="card" style={{ marginBottom: '32px', padding: '32px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '8px', borderRadius: '8px', color: '#10b981' }}>
                                            <TrendingUp size={22} />
                                        </div>
                                        <h3 style={{ margin: 0 }}>Rendimiento Histórico</h3>
                                    </div>
                                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
                                        <button
                                            onClick={() => setInvestTrendType('MONTHLY')}
                                            style={{
                                                padding: '6px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px',
                                                background: investTrendType === 'MONTHLY' ? 'white' : 'transparent',
                                                color: investTrendType === 'MONTHLY' ? '#333' : '#64748b',
                                                boxShadow: investTrendType === 'MONTHLY' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                            }}
                                        >
                                            Mensual
                                        </button>
                                        <button
                                            onClick={() => setInvestTrendType('ANNUAL')}
                                            style={{
                                                padding: '6px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px',
                                                background: investTrendType === 'ANNUAL' ? 'white' : 'transparent',
                                                color: investTrendType === 'ANNUAL' ? '#333' : '#64748b',
                                                boxShadow: investTrendType === 'ANNUAL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                            }}
                                        >
                                            Anual
                                        </button>
                                    </div>
                                </div>
                                <div style={{ height: '300px' }}>
                                    <Bar
                                        plugins={[barDataLabels]}
                                        data={{
                                            labels: (investTrendType === 'MONTHLY' ? dashboardSummary.history.monthly : dashboardSummary.history.annual).map(d => d.period),
                                            datasets: [
                                                {
                                                    label: 'Ganancia (EUR)',
                                                    data: (investTrendType === 'MONTHLY' ? dashboardSummary.history.monthly : dashboardSummary.history.annual).map(d => d.gain),
                                                    backgroundColor: '#3b82f6',
                                                    borderRadius: 4
                                                }
                                            ]
                                        }}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            interaction: {
                                                mode: 'index',
                                                intersect: false,
                                            },
                                            plugins: {
                                                legend: { display: false },
                                                tooltip: {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                    titleColor: '#1e293b',
                                                    bodyColor: '#475569',
                                                    borderColor: '#e2e8f0',
                                                    borderWidth: 1,
                                                    padding: 12,
                                                    boxPadding: 6,
                                                    usePointStyle: true,
                                                    callbacks: {
                                                        label: (context) => {
                                                            const val = context.raw;
                                                            const item = (investTrendType === 'MONTHLY' ? dashboardSummary.history.monthly : dashboardSummary.history.annual)[context.dataIndex];
                                                            return ` Ganancia: ${formatCurrency(val)} (${item.percent.toFixed(2)}%)`;
                                                        }
                                                    }
                                                }
                                            },
                                            scales: {
                                                y: { grid: { display: false }, ticks: { font: { size: 11 } } },
                                                x: { grid: { display: false }, ticks: { font: { size: 11 } } }
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="card" style={{ marginBottom: '32px' }}>
                        <h3>Evolución de Cartera (Valor)</h3>
                        <div style={{ height: '400px' }}>
                            {chartData ? <Line
                                data={chartData}
                                options={{
                                    maintainAspectRatio: false,
                                    interaction: {
                                        mode: 'index',
                                        intersect: false,
                                    },
                                    scales: {
                                        x: {
                                            grid: { display: false },
                                            ticks: { maxTicksLimit: 12 }
                                        },
                                        y: {
                                            grid: { display: false },
                                            ticks: {
                                                callback: (value) => formatCurrency(value)
                                            }
                                        }
                                    },
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            titleColor: '#1e293b',
                                            bodyColor: '#475569',
                                            borderColor: '#e2e8f0',
                                            borderWidth: 1,
                                            padding: 12,
                                            boxPadding: 6,
                                            usePointStyle: true,
                                            callbacks: {
                                                label: (context) => ` Valor: ${formatCurrency(context.raw)}`
                                            }
                                        }
                                    }
                                }}
                            /> : <p>Cargando gráfico...</p>}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                        {/* Daily Returns Chart */}
                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ marginBottom: '20px' }}>Rendimientos Diarios (%)</h3>
                            <div style={{ height: '300px' }}>
                                <Bar
                                    data={{
                                        labels: dailyReturns.map(d => d.date),
                                        datasets: [{
                                            label: 'P&L Diario (€)',
                                            data: dailyReturns.map((d, i) => {
                                                const prevPrice = i === 0 ? balanceHistory[0]?.close : dailyReturns[i - 1].price;
                                                return d.price - prevPrice;
                                            }),
                                            backgroundColor: 'rgba(59, 130, 246, 0.6)',
                                            borderColor: '#3b82f6',
                                            borderWidth: 1
                                        }]
                                    }}
                                    options={{
                                        maintainAspectRatio: false,
                                        interaction: { mode: 'index', intersect: false },
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                titleColor: '#1e293b',
                                                bodyColor: '#475569',
                                                borderColor: '#e2e8f0',
                                                borderWidth: 1,
                                                padding: 12,
                                                callbacks: {
                                                    label: (context) => {
                                                        const item = dailyReturns[context.dataIndex];
                                                        const i = context.dataIndex;
                                                        const prevPrice = i === 0 ? balanceHistory[0]?.close : dailyReturns[i - 1].price;
                                                        const pl = (item.price - prevPrice);
                                                        const pct = (item.value * 100).toFixed(2) + '%';
                                                        return [` P&L Diario: ${formatCurrency(pl)}`, ` Rendimiento: ${pct}`, ` Capital: ${formatCurrency(item.price)}`];
                                                    }
                                                }
                                            }
                                        },
                                        scales: {
                                            y: {
                                                grid: { color: '#f1f5f9' },
                                                ticks: { callback: (v) => formatCurrency(v) }
                                            },
                                            x: { grid: { display: false }, ticks: { display: false } }
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {/* Drawdown Chart */}
                        <div className="card" style={{ padding: '24px' }}>
                            <h3 style={{ marginBottom: '20px' }}>Drawdown (%)</h3>
                            <div style={{ height: '300px' }}>
                                <Line
                                    data={{
                                        labels: drawdownHistory.map(d => d.date),
                                        datasets: [{
                                            label: 'Drawdown (€)',
                                            data: drawdownHistory.map(d => {
                                                // Calculate DD in EUR: price - peakPrice
                                                // We can approximate peakPrice from price and drawdown %
                                                // DD% = (price - peak) / peak => price / peak = 1 + DD% => peak = price / (1 + DD%)
                                                const peak = d.price / (1 + d.value);
                                                return d.price - peak;
                                            }),
                                            borderColor: '#3b82f6',
                                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                            fill: true,
                                            tension: 0.1,
                                            pointRadius: 0
                                        }]
                                    }}
                                    options={{
                                        maintainAspectRatio: false,
                                        interaction: { mode: 'index', intersect: false },
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                titleColor: '#1e293b',
                                                bodyColor: '#475569',
                                                borderColor: '#e2e8f0',
                                                borderWidth: 1,
                                                padding: 12,
                                                callbacks: {
                                                    label: (context) => {
                                                        const item = drawdownHistory[context.dataIndex];
                                                        const peak = item.price / (1 + item.value);
                                                        const ddEur = item.price - peak;
                                                        const pct = (item.value * 100).toFixed(2) + '%';
                                                        return [` Drawdown: ${formatCurrency(ddEur)} (${pct})`, ` Capital: ${formatCurrency(item.price)}`];
                                                    }
                                                }
                                            }
                                        },
                                        scales: {
                                            y: {
                                                grid: { color: '#f1f5f9' },
                                                ticks: { callback: (v) => formatCurrency(v) },
                                                max: 0
                                            },
                                            x: { grid: { display: false }, ticks: { display: false } }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: '32px', padding: '24px' }}>
                        <h3 style={{ marginBottom: '20px' }}>Curva de Balance (P&L Acumulado)</h3>
                        <div style={{ height: '400px' }}>
                            <Line
                                data={{
                                    labels: balanceHistory.map(d => new Date(d.date).toLocaleDateString()),
                                    datasets: [{
                                        label: 'Balance',
                                        data: balanceHistory.map(d => d.close),
                                        borderColor: '#3b82f6',
                                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                        fill: true,
                                        tension: 0.1,
                                        pointRadius: 0
                                    }]
                                }}
                                options={{
                                    maintainAspectRatio: false,
                                    interaction: { mode: 'index', intersect: false },
                                    plugins: {
                                        legend: { display: false },
                                        tooltip: {
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            titleColor: '#1e293b',
                                            bodyColor: '#475569',
                                            borderColor: '#e2e8f0',
                                            borderWidth: 1,
                                            padding: 12,
                                            callbacks: {
                                                label: (context) => {
                                                    const val = context.raw;
                                                    const firstVal = balanceHistory[0].close;
                                                    const pct = ((val - firstVal) / firstVal * 100).toFixed(2) + '%';
                                                    return [` Capital: ${formatCurrency(val)}`, ` Ganancia: ${pct}`];
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        y: {
                                            grid: { color: '#f1f5f9' },
                                            ticks: { callback: (v) => formatCurrency(v) }
                                        },
                                        x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }
                                    }
                                }}
                            />
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'brokers' && (
                <div className="card" style={{ padding: '32px' }}>
                    <h3>Inversiones por Broker</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px', marginTop: '24px' }}>
                        {dashboardSummary && dashboardSummary.brokers ? (
                            Object.entries(dashboardSummary.brokers).map(([broker, stats]) => (
                                <div key={broker} className="card" style={{ padding: '20px', border: '1px solid #f1f5f9', background: '#f8fafc' }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '12px', color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                                        {broker}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.9rem' }}>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>Invertido</span>
                                            <span style={{ fontWeight: '600', color: '#333' }}>{formatCurrency(stats.invested)}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>Valor Actual</span>
                                            <span style={{ fontWeight: '600', color: '#333' }}>{formatCurrency(stats.currentValue)}</span>
                                        </div>
                                        <div style={{ gridColumn: 'span 2', marginTop: '4px' }}>
                                            <span style={{ color: '#64748b', display: 'block', fontSize: '0.8rem' }}>Ganancia / Pérdida</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontWeight: 'bold', color: stats.pl >= 0 ? '#10b981' : '#ef4444', fontSize: '1.1rem' }}>
                                                    {stats.pl >= 0 ? '+' : ''}{formatCurrency(stats.pl)}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.8rem', fontWeight: '600',
                                                    color: stats.pl >= 0 ? '#10b981' : '#ef4444',
                                                    background: stats.pl >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                    padding: '2px 6px', borderRadius: '4px'
                                                }}>
                                                    {stats.plPercent.toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p>Cargando datos de brokers...</p>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'operations' && (
                <div className="card">
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div className="input-group" style={{ maxWidth: '100px' }}>
                            <label>ID</label>
                            <input type="text" value={filters.id} onChange={e => setFilters({ ...filters, id: e.target.value })} placeholder="ID..." />
                        </div>
                        <div className="input-group">
                            <label>Desde</label>
                            <input type="date" value={filters.startDate} onChange={e => setFilters({ ...filters, startDate: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label>Hasta</label>
                            <input type="date" value={filters.endDate} onChange={e => setFilters({ ...filters, endDate: e.target.value })} />
                        </div>
                        <div className="input-group">
                            <label>Tipo</label>
                            <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
                                <option value="ALL">Todos</option>
                                <option value="BUY">Compras</option>
                                <option value="SELL">Ventas</option>
                                <option value="DIVIDEND">Dividendos</option>
                            </select>
                        </div>
                    </div>

                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #eee' }}>
                                <th style={{ padding: '12px' }}>ID</th>
                                <th style={{ padding: '12px' }}>Fecha</th>
                                <th>Símbolo</th>
                                <th>Acción</th>
                                <th>Cant.</th>
                                <th>Precio</th>
                                <th>Divisa</th>
                                <th>Total (EUR)</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTrades.map(t => {
                                const totalEur = (t.quantity * t.price * (t.exchange_rate || 1)).toFixed(2);
                                return (
                                    <tr key={t.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                                        <td style={{ padding: '12px', color: '#64748b' }}>#{t.id}</td>
                                        <td style={{ padding: '12px' }}>{t.date}</td>
                                        <td style={{ fontWeight: 'bold' }}>{t.symbol}</td>
                                        <td>
                                            <span className={t.action === 'BUY' ? 'badge-buy' : 'badge-sell'}>
                                                {t.action === 'BUY' ? 'COMPRA' : t.action === 'SELL' ? 'VENTA' : t.action}
                                            </span>
                                        </td>
                                        <td>{t.quantity}</td>
                                        <td>{t.price}</td>
                                        <td>{t.currency || 'EUR'}</td>
                                        <td>€{totalEur}</td>
                                        <td>
                                            <button onClick={() => handleEditClick(t)} style={{ marginRight: '8px', cursor: 'pointer' }}>✏️</button>
                                            <button onClick={() => handleDeleteTrade(t.id)} style={{ cursor: 'pointer', color: 'red' }}>🗑️</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal */}
            {showTradeForm && (
                <div className="modal-overlay">
                    <div className="modal card premium-modal">
                        <div className="modal-header">
                            <h3>{editingTrade ? 'Editar Operación' : 'Registrar Operación'}</h3>
                            <button className="close-btn" onClick={() => setShowTradeForm(false)}>&times;</button>
                        </div>
                        <form onSubmit={handleTradeSubmit} className="premium-form">
                            <div className="form-row">
                                <div className="input-group">
                                    <label>Fecha</label>
                                    <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} required />
                                </div>
                                <div className="input-group">
                                    <label>Acción</label>
                                    <select value={formData.action} onChange={e => setFormData({ ...formData, action: e.target.value })}>
                                        <option value="BUY">Compra</option>
                                        <option value="SELL">Venta</option>
                                        <option value="DIVIDEND">Dividendo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="input-group">
                                    <label>Símbolo</label>
                                    <input value={formData.symbol} onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })} placeholder="Ej: AAPL, SAN.MC" required />
                                </div>
                                <div className="input-group">
                                    <label>Broker</label>
                                    <input value={formData.broker} onChange={e => setFormData({ ...formData, broker: e.target.value })} placeholder="Ej: Scalable, IBKR" />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="input-group" style={{ gridColumn: 'span 2' }}>
                                    <label>Cantidad</label>
                                    <input type="number" step="0.0001" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: parseFloat(e.target.value) })} required />
                                </div>
                            </div>

                            <div className="form-section-highlight">
                                <div className="form-row">
                                    <div className="input-group">
                                        <label>Precio</label>
                                        <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })} required />
                                    </div>
                                    <div className="input-group">
                                        <label>Divisa</label>
                                        <select value={formData.currency} onChange={e => setFormData({ ...formData, currency: e.target.value })}>
                                            <option value="EUR">EUR</option>
                                            <option value="USD">USD</option>
                                            <option value="GBP">GBP</option>
                                        </select>
                                    </div>
                                    <div className="input-group">
                                        <label>T. Cambio</label>
                                        <input
                                            type="number"
                                            step="0.0001"
                                            value={formData.exchange_rate}
                                            onChange={e => setFormData({ ...formData, exchange_rate: parseFloat(e.target.value) })}
                                            disabled={formData.currency === 'EUR'}
                                        />
                                    </div>
                                </div>
                                <div className="input-group" style={{ marginTop: '12px' }}>
                                    <label>Comisión (Original)</label>
                                    <input type="number" step="0.01" value={formData.fee} onChange={e => setFormData({ ...formData, fee: parseFloat(e.target.value) })} />
                                </div>
                            </div>

                            <div className="form-divider">
                                <span>Enlace Contable</span>
                            </div>

                            <div className="form-row">
                                <div className="input-group">
                                    <label>Cuenta de Efectivo (Origen)</label>
                                    <select value={formData.cashAccountId} onChange={e => setFormData({ ...formData, cashAccountId: e.target.value })} required>
                                        <option value="">Seleccionar Cuenta...</option>
                                        {accounts.filter(a => a.type === 'ASSET' || a.type === 'LIABILITY').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="input-group">
                                    <label>Cuenta de Inversión (Activo)</label>
                                    <select value={formData.assetAccountId} onChange={e => setFormData({ ...formData, assetAccountId: e.target.value })} required>
                                        <option value="">Seleccionar Cuenta...</option>
                                        {accounts.filter(a => a.type === 'ASSET').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn-cancel" onClick={() => setShowTradeForm(false)}>Cancelar</button>
                                <button type="submit" className="btn-save">{editingTrade ? 'Guardar Cambios' : 'Registrar Operación'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .badge-buy { background: #e8f5e9; color: #2e7d32; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; }
                .badge-sell { background: #ffebee; color: #c62828; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; }
                
                .modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(15, 23, 42, 0.75);
                    backdrop-filter: blur(4px);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 1000;
                    animation: fadeIn 0.2s ease-out;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .premium-modal {
                    width: 540px;
                    max-width: 95%;
                    border-radius: 20px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    background: white;
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }

                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .modal-header {
                    padding: 24px 32px;
                    background: #f8fafc;
                    border-bottom: 1px solid #f1f5f9;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .modal-header h3 { margin: 0; color: #1e293b; font-size: 1.25rem; font-weight: 700; }
                
                .close-btn {
                    background: none; border: none; font-size: 24px; color: #94a3b8; cursor: pointer;
                    line-height: 1; padding: 4px; border-radius: 8px; transition: all 0.2s;
                }
                .close-btn:hover { background: #f1f5f9; color: #1e293b; }

                .premium-form { padding: 32px; }

                .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                .form-row:last-child { margin-bottom: 0; }

                .input-group label {
                    display: block; margin-bottom: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b;
                    letter-spacing: 0.025em;
                }

                .input-group input, .input-group select {
                    width: 100%; padding: 12px 16px; border-radius: 12px; border: 1.5px solid #e2e8f0;
                    background: #ffffff; color: #1e293b; font-size: 0.95rem; transition: all 0.2s;
                    outline: none;
                }

                .input-group input:focus, .input-group select:focus {
                    border-color: #5e6ad2; box-shadow: 0 0 0 4px rgba(94, 106, 210, 0.1);
                }

                .input-group input::placeholder { color: #cbd5e1; }

                .form-section-highlight {
                    background: #f8fafc; padding: 20px; border-radius: 16px; margin: 24px 0;
                    border: 1px solid #f1f5f9;
                }

                .form-divider {
                    position: relative; text-align: center; margin: 32px 0 24px;
                }
                .form-divider::before {
                    content: ""; position: absolute; top: 50%; left: 0; right: 0;
                    height: 1px; background: #e2e8f0; z-index: 1;
                }
                .form-divider span {
                    position: relative; z-index: 2; background: white; padding: 0 16px;
                    color: #94a3b8; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .modal-footer {
                    display: flex; gap: 16px; justify-content: flex-end; margin-top: 32px;
                }

                .btn-cancel {
                    padding: 12px 24px; border-radius: 12px; border: 1.5px solid #e2e8f0;
                    background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;
                }
                .btn-cancel:hover { background: #f8fafc; border-color: #cbd5e1; }

                .btn-save {
                    padding: 12px 32px; border-radius: 12px; border: none;
                    background: #5e6ad2; color: white; font-weight: 600; cursor: pointer;
                    transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(94, 106, 210, 0.4);
                }
                .btn-save:hover { background: #4a57c5; transform: translateY(-1px); box-shadow: 0 6px 12px -2px rgba(94, 106, 210, 0.4); }
                .btn-save:active { transform: translateY(0); }
            `}</style>
        </div>
    );
};

export default Investments;
