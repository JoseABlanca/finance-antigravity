import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, ChevronLeft, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    }

    if (!currentUser) return null; // Don't show sidebar on login/register pages

    return (
        <div className={`sidebar ${isOpen ? '' : 'collapsed'}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px', paddingLeft: isOpen ? '12px' : '0', width: '100%' }}>
                {isOpen && <h2 style={{ color: 'var(--primary)', margin: 0, whiteSpace: 'nowrap' }}>Finance Control</h2>}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-main)',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: isOpen ? 'auto' : '0',
                        width: isOpen ? 'auto' : '100%'
                    }}
                >
                    {isOpen ? <ChevronLeft size={24} /> : <Menu size={24} />}
                </button>
            </div>

            <nav className="nav-menu">
                <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Informe Financiero">
                    <LayoutDashboard size={20} />
                    {isOpen && <span>Informe Financiero</span>}
                </NavLink>
                <NavLink to="/accounts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Mayor">
                    <Wallet size={20} />
                    {isOpen && <span>Mayor</span>}
                </NavLink>
                <NavLink to="/journal" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Diario">
                    <Wallet size={20} />
                    {isOpen && <span>Diario</span>}
                </NavLink>

                <NavLink to="/investments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Inversiones">
                    <TrendingUp size={20} />
                    {isOpen && <span>Inversiones</span>}
                </NavLink>

                <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reportes">
                    <LayoutDashboard size={20} />
                    {isOpen && <span>Reportes</span>}
                </NavLink>

                <NavLink to="/report-quant" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reporte Quant">
                    <TrendingUp size={20} />
                    {isOpen && <span>Reporte Quant</span>}
                </NavLink>
                <div style={{ marginTop: 'auto' }}>
                    <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Configuración">
                        <Settings size={20} />
                        {isOpen && <span>Configuración</span>}
                    </NavLink>
                    <button
                        onClick={handleLogout}
                        className="nav-item"
                        title="Cerrar Sesión"
                        style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text-main)', marginTop: '8px' }}
                    >
                        <LogOut size={20} />
                        {isOpen && <span>Cerrar Sesión</span>}
                    </button>
                </div>
            </nav>
        </div>
    );
};

export default Sidebar;
