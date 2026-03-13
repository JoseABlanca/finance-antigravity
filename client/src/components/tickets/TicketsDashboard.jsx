import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Pie, Line, Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register ChartJS modules
ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ChartDataLabels);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TicketsDashboard = () => {
    const [stats, setStats] = useState({ items: [], receipts: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setLoading(true);
                const [itemsRes, receiptsRes] = await Promise.all([
                    axios.get(`${API_URL}/bi/tickets/items`),
                    axios.get(`${API_URL}/bi/tickets`)
                ]);
                
                setStats({ items: itemsRes.data, receipts: receiptsRes.data });
            } catch (err) {
                console.error("Error fetching BI stats", err);
                setError("No se pudieron cargar los datos del Dashboard.");
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Procesando Analíticas BI...</div>;
    if (error) return <div style={{ color: '#ef4444' }}>{error}</div>;

    const { items, receipts } = stats;

    if (items.length === 0 || receipts.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                ℹ️ Aún no hay datos suficientes para generar estadísticas. Por favor, sube tu primer ticket.
            </div>
        );
    }

    // --- Data Processing for Charts ---

    // 1. Category Pie Chart
    const categoryTotals = items.reduce((acc, item) => {
        const cat = item.category || 'Otros';
        acc[cat] = (acc[cat] || 0) + item.total_price;
        return acc;
    }, {});
    
    // Sort categories by amount
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    
    const pieData = {
        labels: sortedCategories.map(c => c[0]),
        datasets: [{
            data: sortedCategories.map(c => c[1]),
            backgroundColor: [
                '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
                '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'
            ],
            borderWidth: 0,
        }]
    };

    // 2. Supermarket Spend (Bar Chart)
    const marketTotals = receipts.reduce((acc, r) => {
        const sm = r.supermarket || 'Desconocido';
        acc[sm] = (acc[sm] || 0) + r.total_amount;
        return acc;
    }, {});
    
    const sortedMarkets = Object.entries(marketTotals).sort((a, b) => b[1] - a[1]);

    const barData = {
        labels: sortedMarkets.map(m => m[0]),
        datasets: [{
            label: 'Gasto Total (€)',
            data: sortedMarkets.map(m => m[1]),
            backgroundColor: '#6366f1',
            borderRadius: 6,
        }]
    };

    // 3. Time Series - Top 3 Most Bought Items Inflation (Line Chart)
    // Find top 3 products by occurrence
    const productFrequency = items.reduce((acc, i) => {
        acc[i.product_name] = (acc[i.product_name] || 0) + 1;
        return acc;
    }, {});
    const top3Products = Object.entries(productFrequency)
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 3)
                                .map(p => p[0]);

    // Group items by date for the line chart
    const dates = [...new Set(receipts.map(r => r.date))].sort();
    
    const lineDatasets = top3Products.map((pName, index) => {
        const colors = ['#f43f5e', '#8b5cf6', '#10b981'];
        
        // Find avg price of this product for each receipt date
        const data = dates.map(d => {
            const itemsOnDate = items.filter(i => i.date === d && i.product_name === pName);
            if (itemsOnDate.length === 0) return null; // Connect gaps
            const avgPrice = itemsOnDate.reduce((sum, item) => sum + item.price_per_unit, 0) / itemsOnDate.length;
            return avgPrice;
        });

        return {
            label: pName,
            data: data,
            borderColor: colors[index],
            backgroundColor: colors[index],
            tension: 0.3,
            spanGaps: true
        };
    });

    const lineData = {
        labels: dates,
        datasets: lineDatasets
    };

    // --- Common Chart Options ---
    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'bottom', labels: { color: 'var(--text-main)', usePointStyle: true } },
            datalabels: { color: 'white', formatter: (value) => value.toFixed(0) + '€', font: { weight: 'bold' } }
        }
    };
    
    return (
        <div className="tickets-dashboard">
            <h3 style={{ marginBottom: '24px', color: 'var(--text-main)' }}>Análisis de Cesta de la Compra</h3>
            
            {/* KPI Cards */}
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
                <div className="metric-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Total Gastado (Scanner)</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)' }}>
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(receipts.reduce((s, r) => s + r.total_amount, 0))}
                    </div>
                </div>
                <div className="metric-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Tickets Procesados</div>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)' }}>{receipts.length}</div>
                </div>
                <div className="metric-card" style={{ background: 'var(--surface)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>Categoría Principal</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {sortedCategories[0]?.[0] || 'N/A'}
                    </div>
                </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                
                <div className="chart-container" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ textAlign: 'center', color: 'var(--text-main)', marginBottom: '16px' }}>Distribución de Gasto por Categoría</h4>
                    <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
                        <Pie data={pieData} options={options} />
                    </div>
                </div>

                <div className="chart-container" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ textAlign: 'center', color: 'var(--text-main)', marginBottom: '16px' }}>Gasto Acumulado por Supermercado</h4>
                    <div style={{ height: '300px' }}>
                        <Bar 
                            data={barData} 
                            options={{
                                ...options,
                                plugins: { ...options.plugins, datalabels: { display: false } },
                                scales: { 
                                    y: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-muted)' } },
                                    x: { grid: { display: false }, ticks: { color: 'var(--text-muted)' } }
                                },
                            }} 
                        />
                    </div>
                </div>

                <div className="chart-container" style={{ gridColumn: '1 / -1', background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ textAlign: 'center', color: 'var(--text-main)', marginBottom: '16px' }}>Evolución de Precios (Productos Frecuentes)</h4>
                    <div style={{ height: '350px' }}>
                        <Line 
                            data={lineData} 
                            options={{
                                ...options,
                                plugins: { ...options.plugins, datalabels: { display: false } },
                                scales: { 
                                    y: { grid: { color: 'var(--border)' }, ticks: { color: 'var(--text-muted)', callback: (v) => v + '€' } },
                                    x: { grid: { display: false }, ticks: { color: 'var(--text-muted)' } }
                                },
                            }} 
                        />
                    </div>
                </div>

            </div>

            <style>
                {`
                    @media (max-width: 768px) {
                        .tickets-dashboard > div[style*="gridTemplateColumns"] { grid-template-columns: 1fr !important; }
                        .chart-container { grid-column: 1 / -1 !important; }
                    }
                `}
            </style>
        </div>
    );
};

export default TicketsDashboard;
