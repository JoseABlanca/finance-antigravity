import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, ShoppingCart, Calendar, MapPin, Tag } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TicketsTable = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchItems = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${API_URL}/bi/tickets/items`);
                setItems(response.data);
            } catch (err) {
                console.error("Error fetching historic items", err);
                setError("Error al cargar el historial de compras.");
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, []);

    // Helper functions for formatting
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
    };

    // Filter logic
    const filteredItems = items.filter(item => {
        const search = searchTerm.toLowerCase();
        return (
            (item.product_name && item.product_name.toLowerCase().includes(search)) ||
            (item.supermarket && item.supermarket.toLowerCase().includes(search)) ||
            (item.category && item.category.toLowerCase().includes(search))
        );
    });

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Cargando base de datos de tickets...</div>;
    }

    if (error) {
        return <div style={{ color: '#ef4444', padding: '20px', background: '#fee2e2', borderRadius: '8px' }}>{error}</div>;
    }

    return (
        <div className="tickets-historic">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShoppingCart size={20} /> Historial de la Cesta
                </h3>
                
                {/* Search Bar */}
                <div style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Buscar producto, súper o categoría..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '10px 12px 10px 36px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-hover)',
                            color: 'var(--text-main)'
                        }}
                    />
                </div>
            </div>

            {/* Total items stats summary row */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'var(--surface-hover)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', display: 'inline-block' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Artículos Encontrados</span>
                    <strong style={{ display: 'block', fontSize: '18px', color: 'var(--text-main)' }}>{filteredItems.length}</strong>
                </div>
            </div>

            {/* Desktop Table Layout */}
             <div className="table-responsive">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> Fecha</div></th>
                            <th><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={14} /> Súper</div></th>
                            <th>Producto</th>
                            <th><div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={14} /> Categoría</div></th>
                            <th style={{ textAlign: 'center' }}>Cantidad</th>
                            <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.length === 0 ? (
                            <tr>
                                <td colSpan="7" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                                    No se encontraron artículos.
                                </td>
                            </tr>
                        ) : (
                            filteredItems.map(item => (
                                <tr key={item.id}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.date)}</td>
                                    <td>
                                        <span className={`badge ${item.supermarket?.toLowerCase().includes('mercadona') ? 'badge-success' : 'badge-neutral'}`}>
                                            {item.supermarket || 'Súper'}
                                        </span>
                                    </td>
                                    <td style={{ fontWeight: '500' }}>{item.product_name}</td>
                                    <td>
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-main)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                            {item.category || 'Otros'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(item.price_per_unit)}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--text-main)' }}>{formatCurrency(item.total_price)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
            <style>
                {`
                    @media (max-width: 768px) {
                        .data-table thead { display: none; }
                        .data-table tbody td { display: flex; justify-content: space-between; align-items: center; padding: 12px; text-align: right; }
                        .data-table tbody td::before { content: attr(data-label); font-weight: bold; text-align: left; }
                        .data-table tr { padding-bottom: 8px; display: block; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
                    }
                `}
            </style>
        </div>
    );
};

export default TicketsTable;
