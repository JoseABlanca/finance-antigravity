import React, { useState, useCallback } from 'react';
import TicketUploader from '../components/tickets/TicketUploader';
import TicketsTable from '../components/tickets/TicketsTable';
import TicketsDashboard from '../components/tickets/TicketsDashboard';
import EmailAlertBanner from '../components/tickets/EmailAlertBanner';
import { Camera, Table, LineChart, Mail } from 'lucide-react';

const TicketsPage = () => {
    const [activeTab, setActiveTab] = useState('upload');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [unreadEmailCount, setUnreadEmailCount] = useState(0);

    const handleUploadSuccess = () => {
        setRefreshTrigger(prev => prev + 1);
        setActiveTab('historic');
    };

    const handleUnreadCountChange = useCallback((count) => {
        setUnreadEmailCount(count);
    }, []);

    return (
        <div className="dashboard">
            <header className="dashboard-header" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h1>Tickets Supermercado & BI</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Escanea tus tickets de compra y analiza la evolución de precios</p>
                    </div>
                    {/* Mini email badge — click to switch to email tab */}
                    {unreadEmailCount > 0 && (
                        <button
                            onClick={() => setActiveTab('emails')}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
                                color: '#dc2626', fontWeight: '600', fontSize: '13px',
                                animation: 'pulse 2s infinite'
                            }}
                        >
                            <Mail size={16} />
                            {unreadEmailCount} factura{unreadEmailCount !== 1 ? 's' : ''} nueva{unreadEmailCount !== 1 ? 's' : ''} por email
                        </button>
                    )}
                </div>
            </header>

            {/* Pre-load EmailAlertBanner hidden to fetch count without showing */}
            <div style={{ display: 'none' }}>
                <EmailAlertBanner onUnreadCountChange={handleUnreadCountChange} />
            </div>

            <div className="tabs-container" style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <button 
                    className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveTab('upload')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Camera size={18} /> Nuevo Ticket
                </button>
                <button 
                    className={`btn ${activeTab === 'historic' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveTab('historic')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <Table size={18} /> Historial Cesta
                </button>
                <button 
                    className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveTab('dashboard')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    <LineChart size={18} /> BI Dashboard
                </button>
                <button 
                    className={`btn ${activeTab === 'emails' ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setActiveTab('emails')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}
                >
                    <Mail size={18} />
                    Facturas Email
                    {unreadEmailCount > 0 && (
                        <span style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            background: '#ef4444',
                            color: 'white',
                            borderRadius: '999px',
                            fontSize: '10px',
                            fontWeight: '700',
                            padding: '1px 6px',
                            lineHeight: '1.6',
                            pointerEvents: 'none'
                        }}>
                            {unreadEmailCount}
                        </span>
                    )}
                </button>
            </div>

            <div className="tab-content" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                {activeTab === 'upload' && <TicketUploader onSuccess={handleUploadSuccess} />}
                {activeTab === 'historic' && <TicketsTable key={`table-${refreshTrigger}`} />}
                {activeTab === 'dashboard' && <TicketsDashboard key={`dashboard-${refreshTrigger}`} />}
                {activeTab === 'emails' && (
                    <EmailAlertBanner onUnreadCountChange={handleUnreadCountChange} />
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
};

export default TicketsPage;
