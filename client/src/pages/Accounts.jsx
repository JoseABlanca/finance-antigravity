import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { PGC_ACCOUNTS } from '../data/pgc';
import { Plus, ChevronRight, ChevronDown, Trash2, Pencil, Search, ArrowUpDown, Eye } from 'lucide-react';

const AccountItem = ({ account, level, onAddChild, onDelete, onEdit, onViewDetails, expandedIds, toggleExpand }) => {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expandedIds.has(account.id);

    return (
        <div className="account-item">
            <div
                className="account-row"
                style={{ paddingLeft: `${level * 20 + 12}px` }}
            >
                <div
                    className="expand-icon"
                    onClick={() => toggleExpand(account.id)}
                    style={{ visibility: hasChildren ? 'visible' : 'hidden', cursor: 'pointer', marginRight: '8px' }}
                >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, marginRight: '8px', color: '#555' }}>{account.code}</span>
                    <span style={{ fontWeight: 500 }}>{account.name}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 600, color: '#333' }}>
                        {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(account.totalBalance || 0)}
                    </span>
                    <span className={`badge badge-${account.type.toLowerCase()}`} style={{ marginLeft: '12px', fontSize: '10px' }}>
                        {account.type}
                    </span>
                </div>
                <div className="actions">
                    <button className="btn-icon" onClick={() => onViewDetails(account)} title="Ver movimientos">
                        <Eye size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => onEdit(account)}>
                        <Pencil size={16} />
                    </button>
                    <button className="btn-icon" onClick={() => onAddChild(account)}>
                        <Plus size={16} />
                    </button>
                    <button className="btn-icon danger" onClick={() => onDelete(account.id)}>
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>
            {hasChildren && isExpanded && (
                <div className="account-children">
                    {account.children.map(child => (
                        <AccountItem
                            key={child.id}
                            account={child}
                            level={level + 1}
                            onAddChild={onAddChild}
                            onDelete={onDelete}
                            onEdit={onEdit}
                            onViewDetails={onViewDetails}
                            expandedIds={expandedIds}
                            toggleExpand={toggleExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const evaluateMathExpression = (expression) => {
    if (!expression) return '';
    try {
        // Sanitize: only allow numbers, math operators, parens, and dots
        // We replace commas with dots for internationalization flexibility if user types 10,50
        const sanitized = expression.toString().replace(/,/g, '.');
        if (/[^0-9+\-*/().\s]/.test(sanitized)) return expression;
        // eslint-disable-next-line no-new-func
        const result = new Function(`return ${sanitized}`)();
        // Round to 2 decimals usually good for currency, but let's keep precision then format if needed. 
        // Actually formatted inputs usually nicer. Let's just return raw verification result.
        // Convert to string to match state type
        return isNaN(result) ? expression : result.toString();
    } catch {
        return expression;
    }
};

const Accounts = () => {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newAccount, setNewAccount] = useState({ name: '', code: '', type: 'ASSET', parent_id: null, initialBalance: '', balance: '' });

    // Filter PGC accounts based on selected type
    const pgcSuggestions = PGC_ACCOUNTS.filter(p => p.type === newAccount.type);

    const onPgcSelect = (e) => {
        const val = e.target.value;
        const selected = pgcSuggestions.find(p => p.name === val || p.code === val);
        if (selected) {
            setNewAccount({ ...newAccount, name: selected.name, code: selected.code });
        } else {
            setNewAccount({ ...newAccount, name: val });
        }
    };

    const fetchAccounts = async () => {
        try {
            const res = await api.get('/accounts');
            setAccounts(buildTree(res.data));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    const buildTree = (flatList) => {
        const map = {};
        const roots = [];
        // First pass: create map
        flatList.forEach(acc => {
            map[acc.id] = { ...acc, children: [], totalBalance: acc.balance || 0 };
        });

        // Second pass: link children
        flatList.forEach(acc => {
            if (acc.parent_id) {
                if (map[acc.parent_id]) {
                    map[acc.parent_id].children.push(map[acc.id]);
                }
            } else {
                roots.push(map[acc.id]);
            }
        });

        // Third pass: Recursive balance rollup
        const calculateTotal = (node) => {
            let sum = node.balance || 0;
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => {
                    sum += calculateTotal(child);
                });
            }
            node.totalBalance = sum;
            return sum;
        };

        roots.forEach(root => calculateTotal(root));

        return roots;
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (newAccount.id) {
                // Update
                await api.put(`/accounts/${newAccount.id}`, newAccount);
            } else {
                // Create
                await api.post('/accounts', newAccount);
            }
            setShowForm(false);
            setNewAccount({ name: '', code: '', type: 'ASSET', parent_id: null, initialBalance: '', balance: '' });
            fetchAccounts();
        } catch (err) {
            console.error(err);
            const msg = err.response?.data?.error || err.message || 'Error creating account';
            alert(`Error: ${msg}`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¡ATENCIÓN! Esto eliminará la cuenta, todas sus subcuentas y todas las transacciones asociadas. ¿Estás seguro?')) return;
        try {
            await api.delete(`/accounts/${id}`);
            fetchAccounts();
        } catch (err) {
            console.error(err);
            alert('Error al eliminar cuenta');
        }
    };

    const openAddModal = (parent = null) => {
        setNewAccount({
            name: '',
            code: parent ? `${parent.code}.` : '',
            type: parent ? parent.type : 'ASSET',
            parent_id: parent ? parent.id : null,
            initialBalance: ''
        });
        setShowForm(true);
    };

    const openEditModal = (account) => {
        // When editing, we want to show the current own "balance" as the input value
        // We reuse 'initialBalance' field or add a new 'balance' field to the form
        // Let's use 'balance' for update
        setNewAccount({ ...account, balance: account.balance });
        setShowForm(true);
    };

    const [expandedIds, setExpandedIds] = useState(new Set());
    // Helper to get ALL IDs
    const getAllIds = (nodes) => {
        let ids = [];
        nodes.forEach(node => {
            ids.push(node.id);
            if (node.children) ids = [...ids, ...getAllIds(node.children)];
        });
        return ids;
    };

    const toggleExpand = (id) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const expandAll = () => {
        const allIds = getAllIds(accounts);
        setExpandedIds(new Set(allIds));
    };

    const collapseAll = () => {
        setExpandedIds(new Set());
    };

    // Search and Sort State
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('code'); // 'code' | 'name'

    // Filter and Sort Logic
    const processedAccounts = useMemo(() => {
        const filterNodes = (nodes) => {
            return nodes.reduce((acc, node) => {
                const matches = node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    node.code.toLowerCase().includes(searchTerm.toLowerCase());

                const filteredChildren = node.children ? filterNodes(node.children) : [];

                if (matches || filteredChildren.length > 0) {
                    acc.push({ ...node, children: filteredChildren });
                }
                return acc;
            }, []);
        };

        const sortNodes = (nodes) => {
            return [...nodes].sort((a, b) => {
                if (sortOrder === 'code') {
                    return a.code.localeCompare(b.code, undefined, { numeric: true });
                } else {
                    return a.name.localeCompare(b.name);
                }
            }).map(node => ({
                ...node,
                children: node.children ? sortNodes(node.children) : []
            }));
        };

        let result = accounts;
        if (searchTerm) {
            result = filterNodes(result);
        }
        return sortNodes(result);
    }, [accounts, searchTerm, sortOrder]);

    // Initial expansion on load or search
    useEffect(() => {
        if (accounts.length > 0) {
            expandAll();
        }
    }, [accounts]);

    // Auto-expand whenever search term changes and isn't empty
    useEffect(() => {
        if (searchTerm) {
            expandAll();
        }
    }, [searchTerm]);


    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <h1>Plan de Cuentas</h1>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                style={{
                                    padding: '6px 8px 6px 30px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    fontSize: '13px',
                                    width: '150px'
                                }}
                            />
                        </div>
                        <div style={{ position: 'relative' }}>
                            <ArrowUpDown size={16} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
                            <select
                                value={sortOrder}
                                onChange={e => setSortOrder(e.target.value)}
                                style={{
                                    padding: '6px 8px 6px 30px',
                                    borderRadius: '4px',
                                    border: '1px solid #ddd',
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value="code">Código</option>
                                <option value="name">Nombre</option>
                            </select>
                        </div>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={expandAll}>Expandir Todo</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '12px' }} onClick={collapseAll}>Contraer Todo</button>
                    </div>
                </div>
                <button className="btn" onClick={() => openAddModal(null)}>+ Nueva Cuenta Raíz</button>
            </div>

            <div className="card">
                {loading ? <p>Cargando...</p> : (
                    <div className="account-tree">
                        {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map(type => {
                            const typeAccounts = processedAccounts.filter(acc => acc.type === type);
                            if (typeAccounts.length === 0) return null;

                            const groupLabels = {
                                'ASSET': 'Activo',
                                'LIABILITY': 'Pasivo',
                                'EQUITY': 'Patrimonio',
                                'REVENUE': 'Ingresos',
                                'EXPENSE': 'Gastos'
                            };

                            const groupColors = {
                                'ASSET': '#00695c',
                                'LIABILITY': '#c62828',
                                'EQUITY': '#1565c0',
                                'REVENUE': '#6a1b9a',
                                'EXPENSE': '#ef6c00'
                            };

                            return (
                                <div key={type} style={{ marginBottom: '32px' }}>
                                    <h3 style={{
                                        borderBottom: `2px solid ${groupColors[type]}`,
                                        paddingBottom: '8px',
                                        color: groupColors[type],
                                        marginBottom: '16px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        {groupLabels[type]}
                                        <span style={{ fontSize: '0.8em', color: '#666', fontWeight: 'normal' }}>
                                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                                                typeAccounts.reduce((sum, acc) => sum + (acc.totalBalance || 0), 0)
                                            )}
                                        </span>
                                    </h3>
                                    {typeAccounts.map(acc => (
                                        <AccountItem
                                            key={acc.id}
                                            account={acc}
                                            level={0}
                                            onAddChild={openAddModal}
                                            onDelete={handleDelete}
                                            onEdit={openEditModal}
                                            onViewDetails={(acc) => navigate(`/journal?code=${acc.code}`)}
                                            expandedIds={expandedIds}
                                            toggleExpand={toggleExpand}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                        {processedAccounts.length === 0 && <p style={{ textAlign: 'center', color: '#888' }}>No hay cuentas que coincidan con la búsqueda.</p>}
                    </div>
                )}
            </div>

            {showForm && (
                <div className="modal-overlay">
                    <div className="modal card">
                        <h3>{newAccount.id ? 'Editar Cuenta' : (newAccount.parent_id ? 'Añadir Sub-Cuenta' : 'Añadir Cuenta Raíz')}</h3>
                        <form onSubmit={handleSave}>
                            <div className="input-row">
                                <div className="input-group">
                                    <label>Código (PGC)</label>
                                    <input
                                        value={newAccount.code}
                                        onChange={e => setNewAccount({ ...newAccount, code: e.target.value })}
                                        placeholder="ej. 572"
                                    />
                                </div>
                                <div className="input-group">
                                    <label>Tipo (Masa Patrimonial)</label>
                                    <select
                                        value={newAccount.type}
                                        onChange={e => setNewAccount({ ...newAccount, type: e.target.value })}
                                        disabled={!!newAccount.parent_id}
                                    >
                                        <option value="ASSET">Activo</option>
                                        <option value="LIABILITY">Pasivo</option>
                                        <option value="EQUITY">Patrimonio</option>
                                        <option value="REVENUE">Ingresos</option>
                                        <option value="EXPENSE">Gastos</option>
                                    </select>
                                </div>
                            </div>
                            <div className="input-group">
                                <label>Nombre</label>
                                <input
                                    list="pgc-suggestions"
                                    value={newAccount.name}
                                    onChange={onPgcSelect}
                                    placeholder="ej. Bancos (Escribe para buscar)"
                                    required
                                    autoComplete="off"
                                />
                                <datalist id="pgc-suggestions">
                                    {pgcSuggestions.map((acc, idx) => (
                                        <option key={idx} value={acc.name}>{acc.code} - {acc.name}</option>
                                    ))}
                                </datalist>
                            </div>
                            <div className="input-group">
                                <label>{newAccount.id ? 'Saldo Actual (Ajustar)' : 'Saldo Inicial (Opcional)'}</label>
                                <input
                                    type="text"
                                    value={newAccount.id ? (newAccount.balance !== undefined ? newAccount.balance : '') : (newAccount.initialBalance || '')}
                                    onChange={e => {
                                        if (newAccount.id) {
                                            setNewAccount({ ...newAccount, balance: e.target.value });
                                        } else {
                                            setNewAccount({ ...newAccount, initialBalance: e.target.value });
                                        }
                                    }}
                                    onBlur={e => {
                                        const val = e.target.value;
                                        const calculated = evaluateMathExpression(val);
                                        if (calculated !== val) {
                                            if (newAccount.id) {
                                                setNewAccount({ ...newAccount, balance: calculated });
                                            } else {
                                                setNewAccount({ ...newAccount, initialBalance: calculated });
                                            }
                                        }
                                    }}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault(); // Prevent submit to allow seeing the result first, or just calc.
                                            // Ideally we want to calc then maybe submit? 
                                            // Users often hit enter to submit. 
                                            // Let's first calculate. If it was a calc, they might want to see result.
                                            // If it was already a number, they might want to submit.
                                            // Simple UX: Enter calculates. Second Enter submits (if valid).
                                            const val = e.target.value;
                                            const calculated = evaluateMathExpression(val);

                                            // Create updates
                                            if (newAccount.id) {
                                                setNewAccount({ ...newAccount, balance: calculated });
                                            } else {
                                                setNewAccount({ ...newAccount, initialBalance: calculated });
                                            }

                                            // If value didn't change (was already pure number) or calc didn't work, 
                                            // maybe we could let it submit? But preventDefault stops it.
                                            // Let's just calculate on Enter for now to be safe.
                                        }
                                    }}
                                    placeholder="0.00 o fórmula (ej. 100+20)"
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
                                <button type="submit" className="btn">{newAccount.id ? 'Guardar Cambios' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .account-row {
                    display: flex;
                    align-items: center;
                    padding: 8px 0;
                    border-bottom: 1px solid #f0f0f0;
                }
                .account-row:hover {
                    background: #f9f9f9;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    color: #888;
                    display: flex;
                }
                .btn-icon:hover { color: var(--primary); }
                .btn-icon.danger:hover { color: red; }
                
                .badge { padding: 4px 8px; border-radius: 4px; background: #eee; font-weight: 600; }
                .badge-asset { background: #e0f2f1; color: #00695c; }
                .badge-liability { background: #ffebee; color: #c62828; }
                .badge-equity { background: #e3f2fd; color: #1565c0; }
                .badge-revenue { background: #f3e5f5; color: #6a1b9a; }
                .badge-expense { background: #fff3e0; color: #ef6c00; }

                .modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex; justify-content: center; align-items: center;
                    z-index: 100;
                }
                .modal {
                    width: 600px;
                    max-width: 95%;
                    padding: 24px;
                }
                .input-row {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }
            `}</style>
        </div>
    );
};

export default Accounts;
