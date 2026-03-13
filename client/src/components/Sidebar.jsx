import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, TrendingUp, Settings, ChevronLeft, Menu, LogOut, X, Receipt } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = () => {
    const [isOpen, setIsOpen] = useState(true);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const { logout, currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Close mobile sidebar on route change
    useEffect(() => {
        setIsMobileOpen(false);
    }, [location]);

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch (error) {
            console.error('Failed to log out', error);
        }
    }

    if (!currentUser) return null;

    return (
        <>
            <button className="mobile-menu-btn" onClick={() => setIsMobileOpen(true)}>
                <Menu size={24} />
            </button>

            {isMobileOpen && (
                <div className="mobile-overlay" onClick={() => setIsMobileOpen(false)}></div>
            )}

            <div className={`sidebar ${isOpen ? '' : 'collapsed'} ${isMobileOpen ? 'mobile-open' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', paddingLeft: isOpen || isMobileOpen ? '12px' : '0', width: '100%' }}>
                    {(isOpen || isMobileOpen) && <h2 style={{ color: 'var(--primary)', margin: 0, whiteSpace: 'nowrap' }}>Finance Control</h2>}

                    {/* Desktop Collapse Toggle */}
                    <button
                        className="desktop-toggle"
                        onClick={() => setIsOpen(!isOpen)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            padding: '8px',
                            display: window.innerWidth > 768 ? 'flex' : 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: isOpen ? 'auto' : '0',
                            width: isOpen ? 'auto' : '100%'
                        }}
                    >
                        {isOpen ? <ChevronLeft size={24} /> : <Menu size={24} />}
                    </button>

                    {/* Mobile Close Toggle */}
                    <button
                        className="mobile-close"
                        onClick={() => setIsMobileOpen(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            padding: '8px',
                            display: window.innerWidth <= 768 && isMobileOpen ? 'flex' : 'none',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 'auto'
                        }}
                    >
                        <X size={24} />
                    </button>
                </div>

                <nav className="nav-menu">
                    <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Informe Financiero">
                        <LayoutDashboard size={20} />
                        {(isOpen || isMobileOpen) && <span>Informe Financiero</span>}
                    </NavLink>
                    <NavLink to="/accounts" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Mayor">
                        <Wallet size={20} />
                        {(isOpen || isMobileOpen) && <span>Mayor</span>}
                    </NavLink>
                    <NavLink to="/journal" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Diario">
                        <Wallet size={20} />
                        {(isOpen || isMobileOpen) && <span>Diario</span>}
                    </NavLink>

                    <NavLink to="/investments" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Inversiones">
                        <TrendingUp size={20} />
                        {(isOpen || isMobileOpen) && <span>Inversiones</span>}
                    </NavLink>

                    <NavLink to="/reports" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reporte Financiero">
                        <LayoutDashboard size={20} />
                        {(isOpen || isMobileOpen) && <span>Reporte Financiero</span>}
                    </NavLink>

                    <NavLink to="/report-quant" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Reporte Quant">
                        <TrendingUp size={20} />
                        {(isOpen || isMobileOpen) && <span>Reporte Quant</span>}
                    </NavLink>

                    <NavLink to="/tickets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Tickets BI">
                        <Receipt size={20} />
                        {(isOpen || isMobileOpen) && <span>Tickets BI</span>}
                    </NavLink>
                    <div style={{ marginTop: 'auto' }}>
                        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title="Configuración">
                            <Settings size={20} />
                            {(isOpen || isMobileOpen) && <span>Configuración</span>}
                        </NavLink>
                        <button
                            onClick={handleLogout}
                            className="nav-item"
                            title="Cerrar Sesión"
                            style={{ background: 'transparent', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text-main)', marginTop: '8px' }}
                        >
                            <LogOut size={20} />
                            {(isOpen || isMobileOpen) && <span>Cerrar Sesión</span>}
                        </button>
                    </div>
                </nav>
            </div>
        </>
    );
};

export default Sidebar;
