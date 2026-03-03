import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { format } from 'date-fns';
import { Trash2, Pencil, Filter, ChevronDown, X } from 'lucide-react';
import SearchableSelect from '../components/SearchableSelect';

const Journal = () => {
    const [searchParams] = useSearchParams();
    const codeParam = searchParams.get('code');
    const isMobile = window.innerWidth < 768;
    const [transactions, setTransactions] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    // Filter State
    const [activeFilter, setActiveFilter] = useState(null);
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [selectedValues, setSelectedValues] = useState({
        desc: [],
        parentCode: [],
        parentName: [],
        code: [],
        subName: [],
        id: []
    });

    const [filterSearch, setFilterSearch] = useState('');

    // Initial Filter from Query Params
    useEffect(() => {
        if (codeParam && accounts.length > 0) {
            // Find all sub-accounts in the hierarchy (e.g. '57' matches '572', '572.01', etc.)
            const matchingCodes = accounts
                .filter(a => a.code.startsWith(codeParam))
                .map(a => a.code);

            if (matchingCodes.length > 0) {
                setSelectedValues(prev => ({ ...prev, code: matchingCodes }));
            }
        }
    }, [codeParam, accounts]);

    // New Transaction State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('');
    const [lines, setLines] = useState([
        { account_id: '', debit: 0, credit: 0 },
        { account_id: '', debit: 0, credit: 0 }
    ]);

    useEffect(() => {
        loadData();
    }, []);

    const evaluateMathExpression = (expression) => {
        if (!expression) return 0;
        try {
            // Sanitize: only allow numbers, math operators, parens, and dots
            const sanitized = expression.toString().replace(/,/g, '.');
            if (/[^0-9+\-*/().\s]/.test(sanitized)) return parseFloat(sanitized) || 0;
            // eslint-disable-next-line no-new-func
            const result = new Function(`return ${sanitized}`)();
            return isNaN(result) ? 0 : Math.round(result * 100) / 100;
        } catch {
            return parseFloat(expression) || 0;
        }
    };

    const loadData = async () => {
        const [txRes, accRes] = await Promise.all([
            api.get('/transactions'),
            api.get('/accounts')
        ]);
        setTransactions(txRes.data);
        setAccounts(accRes.data);
    };

    const handleLineChange = (index, field, value) => {
        const newLines = [...lines];
        newLines[index][field] = value;
        setLines(newLines);
    };

    const handleMathBlur = (index, field, value) => {
        const evaluated = evaluateMathExpression(value);
        handleLineChange(index, field, evaluated);
    };

    const addLine = () => {
        setLines([...lines, { account_id: '', debit: 0, credit: 0 }]);
    };

    const removeLine = (index) => {
        if (lines.length <= 2) {
            alert("Un asiento debe tener al menos dos líneas.");
            return;
        }
        setLines(lines.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Backend expects { date, description, entries: [...] }
        const payload = {
            date,
            description,
            entries: lines,
            reference: 'MANUAL'
        };
        try {
            if (editingId) {
                await api.put(`/transactions/${editingId}`, payload);
            } else {
                await api.post('/transactions', payload);
            }
            setShowForm(false);
            setLines([{ account_id: '', debit: 0, credit: 0 }, { account_id: '', debit: 0, credit: 0 }]); // Reset
            setDescription('');
            setEditingId(null);
            loadData();
        } catch (err) {
            alert("Error: " + (err.response?.data?.error || err.message));
        }
    };

    const handleEdit = (tx) => {
        setDate(tx.date);
        setDescription(tx.description);
        setLines(tx.entries.map(e => ({
            account_id: e.account_id,
            debit: e.debit,
            credit: e.credit
        })));
        setEditingId(tx.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('¿Seguro que quieres eliminar este asiento? Esto borrará todos los movimientos asociados.')) return;
        try {
            await api.delete(`/transactions/${id}`);
            loadData();
        } catch (err) {
            console.error(err);
            alert('Error al eliminar transacción');
        }
    };

    // Filter parent accounts to only show sub-accounts in dropdown
    const parentIds = new Set(accounts.filter(a => a.parent_id).map(a => a.parent_id));
    const selectableAccounts = accounts.filter(a => !parentIds.has(a.id));

    // Calculate totals and imbalance
    const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
    const imbalance = totalDebit - totalCredit;
    const isBalanced = Math.abs(imbalance) < 0.01;

    // 1. First, flatten all entries and enrich with account data
    const allEnrichedEntries = transactions.flatMap(tx =>
        tx.entries.map(entry => {
            const acc = accounts.find(a => a.id === entry.account_id);
            const parentAcc = acc && acc.parent_id ? accounts.find(a => a.id === acc.parent_id) : null;
            return {
                ...entry,
                txId: tx.id,
                txDate: tx.date,
                txDescription: tx.description,
                accountName: acc ? acc.name : 'Cuenta desconocida',
                accountCode: acc ? acc.code : '-',
                parentAccountName: parentAcc ? parentAcc.name : (acc ? acc.name : '-'),
                parentAccountCode: parentAcc ? parentAcc.code : (acc ? acc.code : '-')
            };
        })
    );

    // 2. Apply all filters
    const filteredEntries = allEnrichedEntries.filter(entry => {
        // Date range still useful alongside multi-select if we want, but let's stick to Excel logic:
        // If we have specific dates selected, use them. Otherwise show all.
        // Actually, let's keep the DATE RANGE as a special case because it's standard in finance.
        // But for others, use multi-select.

        if (filterDateStart && entry.txDate < filterDateStart) return false;
        if (filterDateEnd && entry.txDate > filterDateEnd) return false;

        const isIncluded = (field, value) => {
            const selected = selectedValues[field];
            if (!selected || selected.length === 0) return true;
            if (selected.includes('__EMPTY__')) return false;
            return selected.includes(String(value));
        };

        if (!isIncluded('desc', entry.txDescription)) return false;
        if (!isIncluded('parentCode', entry.parentAccountCode)) return false;
        if (!isIncluded('parentName', entry.parentAccountName)) return false;
        if (!isIncluded('code', entry.accountCode)) return false;
        if (!isIncluded('subName', entry.accountName)) return false;
        if (!isIncluded('id', entry.txId)) return false;

        return true;
    }).sort((a, b) => new Date(a.txDate) - new Date(b.txDate) || a.txId - b.txId);

    // 3. Map txId to a sequential display ID based on visible transactions
    const visibleTxIds = Array.from(new Set(filteredEntries.map(e => e.txId)));
    const txIdToSequentialId = {};
    visibleTxIds.forEach((id, idx) => {
        txIdToSequentialId[id] = idx + 1;
    });

    // Attach the sequential ID to the entries
    const finalEntries = filteredEntries.map(entry => ({
        ...entry,
        displayTxId: txIdToSequentialId[entry.txId]
    }));

    // Calculate totals for the filtered view
    const historyTotalDebit = finalEntries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
    const historyTotalCredit = finalEntries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
    const historyIsBalanced = Math.abs(historyTotalDebit - historyTotalCredit) < 0.01;

    // Calculate daily totals for the summary
    const dailyTotals = finalEntries.reduce((acc, entry) => {
        const date = entry.txDate;
        if (!acc[date]) {
            acc[date] = { date, debit: 0, credit: 0 };
        }
        acc[date].debit += (parseFloat(entry.debit) || 0);
        acc[date].credit += (parseFloat(entry.credit) || 0);
        return acc;
    }, {});

    const dailyTotalsArray = Object.values(dailyTotals).sort((a, b) => new Date(a.date) - new Date(b.date));

    const handleEditEntry = (entry) => {
        setEditingId(entry.txId);
        const tx = transactions.find(t => t.id === entry.txId);
        if (tx) {
            setDate(tx.date);
            setDescription(tx.description);
            setLines(tx.entries.map(e => ({
                id: e.id,
                account_id: e.account_id,
                debit: e.debit,
                credit: e.credit
            })));
            setShowForm(true);
        }
    };

    const handleDeleteEntry = async (entryId, txId) => {
        if (!window.confirm('¿Seguro que quieres eliminar esta línea?')) return;

        try {
            const tx = transactions.find(t => t.id === txId);
            if (!tx) return;

            if (tx.entries.length <= 1) {
                // If it's the only entry, delete the whole transaction
                await api.delete(`/transactions/${txId}`);
            } else {
                // Otherwise update the transaction without this entry
                const updatedEntries = tx.entries.filter(e => e.id !== entryId);
                await api.put(`/transactions/${txId}`, {
                    date: tx.date,
                    description: tx.description,
                    entries: updatedEntries
                });
            }
            loadData();
        } catch (err) {
            console.error(err);
            alert('Error al eliminar el movimiento');
        }
    };

    const ExcelFilter = ({ title, field, entryField }) => {
        const isOpen = activeFilter === field;

        // Get unique values for this field from ALL entries
        const uniqueValues = Array.from(new Set(allEnrichedEntries.map(e => String(e[entryField])))).sort();

        const currentSelected = selectedValues[field] || [];
        const isAllSelected = currentSelected.length === 0 || currentSelected.length === uniqueValues.length;

        const handleToggle = (val) => {
            let newSelected = [...currentSelected];
            if (newSelected.length === 0) {
                // All were selected by default. Deselecting one means selecting all others.
                newSelected = uniqueValues.filter(v => v !== val);
            } else if (newSelected.includes('__EMPTY__')) {
                // None were selected. Selecting one makes it the only one.
                newSelected = [val];
            } else if (newSelected.includes(val)) {
                newSelected = newSelected.filter(v => v !== val);
                if (newSelected.length === 0) newSelected = ['__EMPTY__'];
            } else {
                newSelected.push(val);
                if (newSelected.length === uniqueValues.length) newSelected = [];
            }
            setSelectedValues({ ...selectedValues, [field]: newSelected });
        };

        const handleSelectAll = () => {
            if (isAllSelected) {
                setSelectedValues({ ...selectedValues, [field]: ['__EMPTY__'] });
            } else {
                setSelectedValues({ ...selectedValues, [field]: [] });
            }
        };

        const filteredUniqueValues = uniqueValues.filter(v =>
            v.toLowerCase().includes(filterSearch.toLowerCase())
        );

        return (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontWeight: '600' }}>{title}</span>
                <button
                    onClick={() => { setActiveFilter(isOpen ? null : field); setFilterSearch(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                >
                    <Filter size={12} color={currentSelected.length > 0 ? 'var(--primary)' : '#999'} />
                </button>
                {isOpen && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'white',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '8px', padding: '12px',
                        minWidth: '220px', border: '1px solid #eee', marginTop: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>FILTRAR {title.toUpperCase()}</span>
                            <button onClick={() => setActiveFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                        </div>

                        <input
                            type="text"
                            value={filterSearch}
                            onChange={e => setFilterSearch(e.target.value)}
                            placeholder="Buscar..."
                            autoFocus
                            style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', marginBottom: '8px' }}
                        />

                        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '8px', border: '1px solid #eee', borderRadius: '4px', padding: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer', fontSize: '12px', background: '#f9f9f9', marginBottom: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAllSelected}
                                    onChange={handleSelectAll}
                                />
                                <strong>(Seleccionar todo)</strong>
                            </label>
                            {filteredUniqueValues.map(val => (
                                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px', cursor: 'pointer', fontSize: '12px' }}>
                                    <input
                                        type="checkbox"
                                        checked={currentSelected.length === 0 || (currentSelected.includes(val) && !currentSelected.includes('__EMPTY__'))}
                                        onChange={() => handleToggle(val)}
                                    />
                                    {val}
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={() => setActiveFilter(null)}
                                style={{ flex: 1, padding: '6px', fontSize: '11px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                Aceptar
                            </button>
                            <button
                                onClick={() => { setSelectedValues({ ...selectedValues, [field]: [] }); setActiveFilter(null); }}
                                style={{ flex: 1, padding: '6px', fontSize: '11px', background: '#f5f5f5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                Borrar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const FilterDropdown = ({ title, field, value, children }) => {
        const isOpen = activeFilter === field;
        return (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontWeight: '600' }}>{title}</span>
                <button
                    onClick={() => setActiveFilter(isOpen ? null : field)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                >
                    <Filter size={12} color={value ? 'var(--primary)' : '#999'} />
                </button>
                {isOpen && (
                    <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 100, background: 'white',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)', borderRadius: '8px', padding: '12px',
                        minWidth: '220px', border: '1px solid #eee', marginTop: '8px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#666' }}>FILTRAR {title.toUpperCase()}</span>
                            <button onClick={() => setActiveFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                        </div>
                        {children}
                        <button
                            onClick={() => setActiveFilter(null)}
                            style={{ marginTop: '8px', width: '100%', padding: '6px', fontSize: '11px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                        >
                            Aceptar
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h1>Libro Diario</h1>
                <button className="btn" onClick={() => { setShowForm(true); setEditingId(null); setLines([{ account_id: '', debit: 0, credit: 0 }, { account_id: '', debit: 0, credit: 0 }]); setDescription(''); }}>+ Nuevo Asiento</button>
            </div>

            {showForm && (
                <div className="card" style={{ marginBottom: '24px', border: '1px solid var(--primary)' }}>
                    <h3>{editingId ? 'Editar Transacción' : 'Nueva Transacción'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label style={{ fontSize: isMobile ? '10px' : 'inherit' }}>Fecha</label>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={{ fontSize: isMobile ? '11px' : 'inherit', padding: isMobile ? '4px' : '8px' }} />
                            </div>
                            <div className="input-group" style={{ flex: 3 }}>
                                <label style={{ fontSize: isMobile ? '10px' : 'inherit' }}>Descripción / Concepto</label>
                                <input value={description} onChange={e => setDescription(e.target.value)} placeholder="ej. Pago Alquiler (Opcional)" style={{ fontSize: isMobile ? '11px' : 'inherit', padding: isMobile ? '4px' : '8px' }} />
                            </div>
                        </div>

                        <table style={{ width: '100%', marginBottom: '16px' }}>
                            <thead>
                                <tr style={{ fontSize: isMobile ? '10px' : 'inherit' }}>
                                    <th>Cuenta</th>
                                    <th width={isMobile ? "80" : "150"}>Debe</th>
                                    <th width={isMobile ? "80" : "150"}>Haber</th>
                                    <th width="40"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <SearchableSelect
                                                options={selectableAccounts.map(a => ({
                                                    value: a.id,
                                                    label: `${a.code} - ${a.name} (${a.type === 'ASSET' ? 'Activo' : a.type === 'LIABILITY' ? 'Pasivo' : a.type === 'EQUITY' ? 'Patrimonio' : a.type === 'REVENUE' ? 'Ingreso' : 'Gasto'})`
                                                }))}
                                                value={line.account_id}
                                                onChange={(val) => handleLineChange(idx, 'account_id', val)}
                                                placeholder="Seleccionar Cuenta..."
                                                isMobile={isMobile}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text" style={{ width: '100%', padding: isMobile ? '4px' : '8px', fontSize: isMobile ? '10px' : 'inherit' }}
                                                value={line.debit}
                                                onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                                                onBlur={e => handleMathBlur(idx, 'debit', e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleMathBlur(idx, 'debit', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="text" style={{ width: '100%', padding: isMobile ? '4px' : '8px', fontSize: isMobile ? '10px' : 'inherit' }}
                                                value={line.credit}
                                                onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                                                onBlur={e => handleMathBlur(idx, 'credit', e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && handleMathBlur(idx, 'credit', e.target.value)}
                                            />
                                        </td>
                                        <td>
                                            <button type="button" onClick={() => removeLine(idx)} className="btn-icon danger" title="Eliminar línea">
                                                <X size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid #ddd', fontWeight: 'bold', fontSize: isMobile ? '10px' : 'inherit' }}>
                                    <td style={{ textAlign: 'right', padding: isMobile ? '4px' : '8px' }}>Totales:</td>
                                    <td style={{ padding: isMobile ? '4px' : '8px', color: isBalanced ? 'green' : (imbalance < 0 ? 'red' : 'inherit') }}>
                                        {totalDebit.toFixed(2)}
                                        {!isBalanced && imbalance < 0 && (
                                            <div style={{ fontSize: '11px', color: 'red', marginTop: '4px' }}>
                                                Faltan: {Math.abs(imbalance).toFixed(2)}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px', color: isBalanced ? 'green' : (imbalance > 0 ? 'red' : 'inherit') }}>
                                        {totalCredit.toFixed(2)}
                                        {!isBalanced && imbalance > 0 && (
                                            <div style={{ fontSize: '11px', color: 'red', marginTop: '4px' }}>
                                                Faltan: {imbalance.toFixed(2)}
                                            </div>
                                        )}
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                        <button type="button" onClick={addLine} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', marginBottom: '16px', fontSize: isMobile ? '11px' : 'inherit' }}>+ Añadir Línea</button>

                        <div style={{ textAlign: 'right' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }} style={{ marginRight: '12px', fontSize: isMobile ? '12px' : 'inherit', padding: isMobile ? '4px 12px' : 'inherit' }}>Cancelar</button>
                            <button type="submit" className="btn" style={{ fontSize: isMobile ? '12px' : 'inherit', padding: isMobile ? '4px 12px' : 'inherit' }}>{editingId ? 'Actualizar' : 'Contabilizar'}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '16px' }}>Resumen Diario (Cuadre)</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '10px' : '13px' }}>
                        <thead>
                            <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #eee' }}>
                                <th style={{ padding: isMobile ? '4px' : '8px', textAlign: 'left' }}>Fecha</th>
                                <th style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right' }}>Debe</th>
                                <th style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right' }}>Haber</th>
                                <th style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right' }}>Dif.</th>
                                <th style={{ padding: isMobile ? '4px' : '8px', textAlign: 'center' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dailyTotalsArray.map(day => {
                                const diff = day.debit - day.credit;
                                const isDayBalanced = Math.abs(diff) < 0.01;
                                let statusLabel = "CUADRE";
                                let statusColor = "#059669"; // Green

                                if (!isDayBalanced) {
                                    statusLabel = "Saldo Deudor";
                                    statusColor = "#dc2626"; // Red
                                }
                                if (diff < -0.01) {
                                    statusLabel = "Saldo Acreedor";
                                    statusColor = "#dc2626"; // Red
                                }

                                return (
                                    <tr key={day.date} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: isMobile ? '4px' : '8px' }}>{format(new Date(day.date), 'dd/MM/yyyy')}</td>
                                        <td style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right' }}>€{day.debit.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right' }}>€{day.credit.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</td>
                                        <td style={{ padding: isMobile ? '4px' : '8px', textAlign: 'right', color: isDayBalanced ? '#666' : '#dc2626', fontWeight: isDayBalanced ? 'normal' : 'bold' }}>
                                            {isDayBalanced ? '-' : `€${Math.abs(diff).toLocaleString('de-DE', { minimumFractionDigits: 2 })}`}
                                        </td>
                                        <td style={{ padding: isMobile ? '4px' : '8px', textAlign: 'center' }}>
                                            <span style={{ color: statusColor, fontWeight: 'bold' }}>{statusLabel}</span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {dailyTotalsArray.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ padding: '16px', textAlign: 'center', color: '#999' }}>No hay datos para mostrar</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0 }}>Historial de Transacciones</h3>
                    <button className="btn btn-secondary" onClick={() => {
                        setFilterDateStart(''); setFilterDateEnd('');
                        setSelectedValues({
                            desc: [],
                            parentCode: [],
                            parentName: [],
                            code: [],
                            subName: [],
                            id: []
                        });
                    }}>Limpiar Filtros</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd', background: '#f8f9fa', fontSize: isMobile ? '10px' : 'inherit' }}>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd', width: isMobile ? '40px' : '60px' }}>
                                <ExcelFilter title="ID" field="id" entryField="txId" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd', width: isMobile ? '80px' : '120px' }}>
                                <FilterDropdown title="Fecha" field="date" value={filterDateStart || filterDateEnd}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#666' }}>Desde:</label>
                                            <input type="date" value={filterDateStart} onChange={e => setFilterDateStart(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#666' }}>Hasta:</label>
                                            <input type="date" value={filterDateEnd} onChange={e => setFilterDateEnd(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '12px' }} />
                                        </div>
                                    </div>
                                </FilterDropdown>
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd' }}>
                                <ExcelFilter title="Concepto" field="desc" entryField="txDescription" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd', width: isMobile ? '60px' : '90px' }}>
                                <ExcelFilter title="Cód. Cuenta" field="parentCode" entryField="parentAccountCode" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd' }}>
                                <ExcelFilter title="Cuenta" field="parentName" entryField="parentAccountName" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd', width: isMobile ? '60px' : '90px' }}>
                                <ExcelFilter title="Cód. Subcu." field="code" entryField="accountCode" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd' }}>
                                <ExcelFilter title="Subcuenta" field="subName" entryField="accountName" />
                            </th>
                            <th style={{ padding: isMobile ? '4px' : '12px', textAlign: 'right', border: '1px solid #ddd', width: isMobile ? '70px' : '110px' }}>Debe</th>
                            <th style={{ padding: isMobile ? '4px' : '12px', textAlign: 'right', border: '1px solid #ddd', width: isMobile ? '70px' : '110px' }}>Haber</th>
                            <th style={{ padding: isMobile ? '4px' : '12px', border: '1px solid #ddd', width: isMobile ? '60px' : '100px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {finalEntries.map((entry, idx) => {
                            const isFirstOfTx = idx === 0 || finalEntries[idx - 1].txId !== entry.txId;
                            return (
                                <tr key={`${entry.txId}-${entry.account_id}-${idx}`} style={{ borderBottom: '1px solid #ddd', fontSize: isMobile ? '10px' : '13px' }}>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', textAlign: 'center', color: '#666', borderLeft: '1px solid #ddd', borderRight: '1px solid #ddd', fontWeight: isFirstOfTx ? 'bold' : 'normal', borderTop: isFirstOfTx ? '1px solid #ddd' : 'none' }}>
                                        {entry.displayTxId}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', color: '#555', border: '1px solid #ddd' }}>
                                        {format(new Date(entry.txDate), 'dd/MM/yyyy')}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', color: '#333', border: '1px solid #ddd' }}>
                                        {entry.txDescription}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', color: '#666', border: '1px solid #ddd' }}>
                                        {entry.parentAccountCode}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', border: '1px solid #ddd', fontWeight: '500' }}>
                                        {entry.parentAccountName}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', color: '#666', border: '1px solid #ddd' }}>
                                        {entry.accountCode}
                                    </td>
                                    <td style={{ padding: isMobile ? '4px' : '8px 12px', border: '1px solid #ddd' }}>
                                        {entry.accountName}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                        {entry.debit > 0 ? `€${parseFloat(entry.debit).toFixed(2)}` : '-'}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', border: '1px solid #ddd', fontSize: '13px' }}>
                                        {entry.credit > 0 ? `€${parseFloat(entry.credit).toFixed(2)}` : '-'}
                                    </td>
                                    <td style={{ padding: '8px 12px', border: '1px solid #ddd' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => handleEditEntry(entry)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}
                                                title="Editar movimiento"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteEntry(entry.id, entry.txId)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ff4444' }}
                                                title="Eliminar movimiento"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ background: '#f1f5f9', fontWeight: 'bold', borderTop: '2px solid #cbd5e1' }}>
                            <td colSpan="7" style={{ padding: '12px', textAlign: 'right', fontSize: '14px' }}>TOTALES FILTRADOS:</td>
                            <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px', color: historyIsBalanced ? '#059669' : '#dc2626' }}>
                                €{historyTotalDebit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', fontSize: '14px', color: historyIsBalanced ? '#059669' : '#dc2626' }}>
                                €{historyTotalCredit.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                {historyIsBalanced ? (
                                    <span style={{ color: '#059669', fontSize: '12px' }}>Cuadrado ✓</span>
                                ) : (
                                    <span style={{ color: '#dc2626', fontSize: '12px' }}>Descuadrado ✗</span>
                                )}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};

export default Journal;
