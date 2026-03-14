import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Mail, CheckCircle, AlertTriangle, TrendingDown, TrendingUp, RefreshCw, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const EmailAlertBanner = ({ onUnreadCountChange }) => {
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(null);
    const [showLogs, setShowLogs] = useState(false);
    const [systemLogs, setSystemLogs] = useState([]);

    const fetchAlerts = useCallback(async () => {
        try {
            setLoading(true);
            const res = await axios.get(`${API_URL}/bi/tickets/email-alerts`);
            const all = res.data || [];
            setAlerts(all);
            const unread = all.filter(a => a.status === 'unread').length;
            if (onUnreadCountChange) onUnreadCountChange(unread);
        } catch (err) {
            console.error('[EmailAlerts] Error fetching alerts:', err);
            setError('No se pudieron cargar las alertas de email.');
        } finally {
            setLoading(false);
        }
    }, [onUnreadCountChange]);

    useEffect(() => {
        fetchAlerts();
    }, [fetchAlerts]);

    const markAsRead = async (id) => {
        try {
            await axios.put(`${API_URL}/bi/tickets/email-alerts/${id}/read`);
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'read' } : a));
            const unread = alerts.filter(a => a.status === 'unread' && a.id !== id).length;
            if (onUnreadCountChange) onUnreadCountChange(unread);
        } catch (err) {
            console.error('[EmailAlerts] Error marking as read:', err);
        }
    };

    const triggerEmailCheck = async () => {
        try {
            setChecking(true);
            await axios.post(`${API_URL}/bi/tickets/trigger-email-check`);
            // Wait a moment then refresh
            setTimeout(() => {
                fetchAlerts();
                setChecking(false);
            }, 20000); // 20 seconds
        } catch (err) {
            console.error('[EmailAlerts] Error triggering check:', err);
            setChecking(false);
        }
    };

    const fetchLogs = async () => {
        try {
            const res = await axios.get(`${API_URL}/bi/tickets/logs`);
            setSystemLogs(res.data || []);
            setShowLogs(true);
        } catch (err) {
            console.error('Error fetching logs:', err);
        }
    };

    const unreadAlerts = alerts.filter(a => a.status === 'unread');
    const readAlerts = alerts.filter(a => a.status === 'read');

    const formatAmount = (amount) =>
        new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount || 0);

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return (
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                <Mail size={16} />
                Cargando alertas de correo...
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Mail size={18} style={{ color: 'var(--accent, #6366f1)' }} />
                    <span style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '15px' }}>
                        Alertas de Email
                    </span>
                    {unreadAlerts.length > 0 && (
                        <span style={{
                            background: '#ef4444',
                            color: 'white',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: '700',
                            padding: '2px 8px',
                            lineHeight: '1.6'
                        }}>
                            {unreadAlerts.length} nueva{unreadAlerts.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <button
                    onClick={triggerEmailCheck}
                    disabled={checking}
                    title="Comprobar correos ahora"
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'transparent', border: '1px solid var(--border)',
                        borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
                        color: 'var(--text-secondary)', fontSize: '13px',
                        transition: 'all 0.2s',
                        opacity: checking ? 0.6 : 1
                    }}
                >
                    <RefreshCw size={14} style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }} />
                    {checking ? 'Comprobando...' : 'Revisar ahora'}
                </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <button 
                    onClick={() => setShowLogs(!showLogs)}
                    style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                    {showLogs ? 'Ocultar Logs' : 'Ver Logs del Sistema'}
                </button>
                {showLogs && (
                    <button 
                        onClick={fetchLogs}
                        style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        Actualizar Logs
                    </button>
                )}
            </div>

            {showLogs && (
                <div style={{ 
                    maxHeight: '200px', overflowY: 'auto', background: '#1e293b', 
                    color: '#e2e8f0', padding: '12px', borderRadius: '8px', 
                    fontSize: '11px', fontFamily: 'monospace', marginBottom: '16px' 
                }}>
                    {systemLogs.length === 0 ? 'Cargando logs...' : systemLogs.map(log => (
                        <div key={log.id} style={{ marginBottom: '4px', borderBottom: '1px solid #334155', paddingBottom: '2px' }}>
                            <span style={{ color: '#94a3b8' }}>[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                            <span style={{ color: log.level === 'ERROR' ? '#f87171' : (log.level === 'SUCCESS' ? '#4ade80' : '#818cf8') }}>
                                [{log.level}]
                            </span>{' '}
                            <span style={{ fontWeight: 'bold' }}>[{log.context}]</span> {log.message}
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px', padding: '8px 12px', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                    {error}
                </div>
            )}

            {/* Unread Alerts */}
            {unreadAlerts.length === 0 && readAlerts.length === 0 ? (
                <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '14px',
                    background: 'var(--surface)',
                    borderRadius: '10px',
                    border: '1px dashed var(--border)'
                }}>
                    <Mail size={28} style={{ marginBottom: '8px', opacity: 0.4 }} />
                    <div>No hay alertas de facturas por correo</div>
                    <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                        Las facturas enviadas a j.a.blanca89@gmail.com aparecerán aquí
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Unread first */}
                    {unreadAlerts.map(alert => (
                        <AlertCard
                            key={alert.id}
                            alert={alert}
                            unread={true}
                            onMarkRead={() => markAsRead(alert.id)}
                            formatAmount={formatAmount}
                            formatDate={formatDate}
                        />
                    ))}
                    {/* Read alerts (collapsed/dimmed) */}
                    {readAlerts.slice(0, 3).map(alert => (
                        <AlertCard
                            key={alert.id}
                            alert={alert}
                            unread={false}
                            onMarkRead={null}
                            formatAmount={formatAmount}
                            formatDate={formatDate}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const AlertCard = ({ alert, unread, onMarkRead, formatAmount, formatDate }) => {
    const isExpense = alert.is_expense === 1 || alert.is_expense === true;

    return (
        <div style={{
            background: unread ? 'var(--surface)' : 'transparent',
            border: unread ? '1px solid var(--border)' : '1px solid transparent',
            borderLeft: unread ? `3px solid ${isExpense ? '#ef4444' : '#10b981'}` : '3px solid var(--border)',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            opacity: unread ? 1 : 0.55,
            transition: 'all 0.2s',
        }}>
            {/* Icon */}
            <div style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: isExpense ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
                {isExpense
                    ? <TrendingDown size={18} color="#ef4444" />
                    : <TrendingUp size={18} color="#10b981" />
                }
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {alert.vendor || 'Desconocido'}
                    </span>
                    <span style={{
                        fontSize: '12px', fontWeight: '700',
                        color: isExpense ? '#ef4444' : '#10b981',
                        flexShrink: 0
                    }}>
                        {isExpense ? '-' : '+'}{formatAmount(alert.amount)}
                    </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📧 {alert.sender} · {alert.subject}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatDate(alert.received_at)}
                    {alert.journal_entry_id && (
                        <span style={{ marginLeft: '8px', background: 'rgba(99,102,241,0.1)', color: '#6366f1', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>
                            Asiento #{alert.journal_entry_id}
                        </span>
                    )}
                </div>
            </div>

            {/* Action */}
            {unread && onMarkRead && (
                <button
                    onClick={onMarkRead}
                    title="Marcar como leída"
                    style={{
                        background: 'transparent', border: '1px solid var(--border)',
                        borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        color: 'var(--text-secondary)', fontSize: '12px',
                        flexShrink: 0, transition: 'all 0.15s',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <CheckCircle size={14} />
                    Leído
                </button>
            )}
            {!unread && (
                <CheckCircle size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
            )}
        </div>
    );
};

export default EmailAlertBanner;
