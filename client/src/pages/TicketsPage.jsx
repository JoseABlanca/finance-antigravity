import React, { useState } from 'react';
import TicketUploader from '../components/tickets/TicketUploader';
import TicketsTable from '../components/tickets/TicketsTable';
import TicketsDashboard from '../components/tickets/TicketsDashboard';
import { Camera, Table, LineChart } from 'lucide-react';

const TicketsPage = () => {
    const [activeTab, setActiveTab] = useState('upload');
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Triggered after a successful upload to force child components to refresh data
    const handleUploadSuccess = () => {
        setRefreshTrigger(prev => prev + 1);
        setActiveTab('historic'); // Auto-switch to historic table after uploading
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header" style={{ marginBottom: '24px' }}>
                <div>
                    <h1>Tickets Supermercardo & BI</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Escanea tus tickets de compra y analiza la evolución de precios</p>
                </div>
            </header>

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
            </div>

            <div className="tab-content" style={{ background: 'var(--surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                {activeTab === 'upload' && <TicketUploader onSuccess={handleUploadSuccess} />}
                {activeTab === 'historic' && <TicketsTable key={`table-${refreshTrigger}`} />}
                {activeTab === 'dashboard' && <TicketsDashboard key={`dashboard-${refreshTrigger}`} />}
            </div>
        </div>
    );
};

export default TicketsPage;
