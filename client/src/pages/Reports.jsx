import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../services/api';
import {
    ChevronLeft, ChevronRight, Loader2, ArrowRightLeft, BarChart3, Database, PieChart, FileBarChart
} from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement } from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, LineElement, PointElement);

// ─── Palette ─────────────────────────────────────────────────────────────────
const D = {
    // Nav / chrome
    bg: '#F1F5F9',
    navBg: '#FFFFFF',
    sideBg: '#FFFFFF',
    // Table colours (match photo 2)
    tblHeader: '#FFFFFF',
    tblSubHdr: '#FFFFFF',
    tblRowOdd: '#FFFFFF',
    pvBg: '#FDF7FF',   // faint lavender
    pvCol: '#000000',
    phPos: '#15803D',
    phNeg: '#DC2626',
    // Primary brand
    primary: '#1D4ED8',
    // Mass colours
    ac: '#1D4ED8', anc: '#1E40AF', pc: '#DC2626', pnc: '#CA8A04', pn: '#15803D',
    white: '#FFFFFF',
};

const PERIOD_BLUES = ['#BFDBFE', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8', '#1E3A8A'];

const MASSES = [
    { id: 'AC', label: 'ACTIVO CORRIENTE', type: 'ASSET', codes: ['3', '4', '5'], color: D.ac },
    { id: 'ANC', label: 'ACTIVO NO CORRIENTE', type: 'ASSET', codes: ['2'], color: D.anc },
    { id: 'PC', label: 'PASIVO CORRIENTE', type: 'LIABILITY', codes: ['4', '5'], color: D.pc },
    { id: 'PNC', label: 'PASIVO NO CORRIENTE', type: 'LIABILITY', codes: ['17', '18'], color: D.pnc },
    { id: 'PN', label: 'PATRIMONIO NETO', type: 'EQUITY', codes: null, color: D.pn },
];

const inMassObj = (acc, m) => {
    if (!m) return true;
    if (m.id === 'PN') return acc.type === 'EQUITY';
    if (acc.type !== m.type) return false;
    return m.codes.some(c => (acc.code ?? '').startsWith(c));
};

const inAnyMass = (acc, massIds) => {
    if (!massIds.size) return true;
    return MASSES.some(m => massIds.has(m.id) && inMassObj(acc, m));
};

const fmt = n => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n ?? 0);
const fmtPct = n => (n > 0 ? '+' : '') + (n ?? 0).toFixed(2) + ' %';
const fmtPct2 = n => (n ?? 0).toFixed(1) + ' %';
const numDigits = acc => (acc.code ?? '').replace(/\D/g, '').length;

// Expand/Collapse Icon (like Photo 2: square with +/-)
const TreeIcon = ({ isExpanded }) => (
    <div style={{
        width: 10, height: 10, border: '1px solid #94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, color: '#64748B', cursor: 'pointer', background: '#FFF', lineHeight: 1
    }}>
        {isExpanded ? '-' : '+'}
    </div>
);

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function Reports() {
    const curYear = new Date().getFullYear();

    const [activeTab, setActiveTab] = useState('balance');
    const [filterMode, setFilterMode] = useState('ANNUAL');
    const [customRange, setCustomRange] = useState(false);
    const [annualYear, setAnnualYear] = useState(curYear);
    const [annualFrom, setAnnualFrom] = useState(curYear - 2);
    const [annualTo, setAnnualTo] = useState(curYear);
    const [fromMonth, setFromMonth] = useState('01');
    const [fromYear, setFromYear] = useState(curYear);
    const [toMonth, setToMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
    const [toYear, setToYear] = useState(curYear);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    // Multi-select
    const [selMasses, setSelMasses] = useState(new Set());
    const [chartLevel, setChartLevel] = useState(0);
    const [expandedNodes, setExpandedNodes] = useState({});

    useEffect(() => { fetchData(); },
        // eslint-disable-next-line
        [activeTab, filterMode, customRange, annualYear, annualFrom, annualTo, fromMonth, fromYear, toMonth, toYear]);

    // ── API ────────────────────────────────────────────────────────────────────
    const fetchData = async () => {
        setLoading(true);
        try {
            const ep = activeTab === 'pnl' ? '/reports/profit-loss'
                : activeTab === 'cashflow' ? '/reports/cash-flow'
                    : '/reports/balance-sheet';
            const params = { period: filterMode };
            if (customRange) {
                params.comparison = 'custom';
                if (filterMode === 'ANNUAL') { params.fromYear = annualFrom; params.toYear = annualTo; }
                else { params.fromMonth = fromMonth; params.fromYear = fromYear; params.toMonth = toMonth; params.toYear = toYear; }
            } else {
                params.comparison = 'false';
                if (filterMode === 'ANNUAL') params.year = annualYear;
                else { params.month = toMonth; params.year = toYear; }
            }
            const res = await api.get(ep, { params });
            setData(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const toggleMass = useCallback(id => {
        setSelMasses(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);
    const clearMasses = useCallback(() => setSelMasses(new Set()), []);
    const toggleNode = id => setExpandedNodes(p => ({ ...p, [id]: !p[id] }));

    const getPeriodLabel = () => {
        if (customRange) return filterMode === 'ANNUAL' ? `${annualFrom}–${annualTo}` : `${fromMonth}/${fromYear}–${toMonth}/${toYear}`;
        if (filterMode === 'ANNUAL') return `Ejercicio ${annualYear}`;
        const M = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return `${M[+toMonth - 1]} ${toYear}`;
    };

    const periods = useMemo(() => data?.results?.map(r => r.period) ?? [], [data]);
    const nPeriods = periods.length;

    // ── Precompute tree and filters ───────────────────────────────────────────
    const { accountMap, allAccounts } = useMemo(() => {
        if (!data?.results?.length) return { accountMap: {}, allAccounts: [] };
        const map = {};
        data.results.forEach((pd, pIdx) => {
            (pd.accounts || []).forEach(acc => {
                if (!map[acc.id]) map[acc.id] = { ...acc, periodBalances: new Array(data.results.length).fill(0), children: [] };
                map[acc.id].periodBalances[pIdx] = acc.balance ?? 0;
            });
        });

        // Link parent-children
        Object.values(map).forEach(n => {
            if (n.parent_id && map[n.parent_id]) {
                const p = map[n.parent_id];
                if (!p.children.find(c => c.id === n.id)) p.children.push(n);
            }
        });

        // 1. Mark which nodes match the mass filter themselves
        Object.values(map).forEach(n => {
            n.matchesMassDirect = inAnyMass(n, selMasses);
        });

        // 2. Compute bottom-up: matching tree + totals
        const done = new Set();
        const calc = n => {
            if (done.has(n.id)) return;
            done.add(n.id);

            let hasMatchingDescendant = false;
            let tots = [...n.periodBalances];

            // If it DOES NOT match the mass directly, we ignore its own balance when filtering
            if (selMasses.size && !n.matchesMassDirect) {
                tots = new Array(data.results.length).fill(0);
            }

            n.children.forEach(c => {
                calc(map[c.id] || c);
                const childObj = map[c.id] || c;
                if (childObj.isVisible) {
                    hasMatchingDescendant = true;
                    tots = tots.map((v, i) => v + (childObj.periodTotals[i] ?? 0));
                }
            });

            n.periodTotals = tots;
            // Visible if it has no filter, OR matches directly, OR has a visible child
            n.isVisible = !selMasses.size || n.matchesMassDirect || hasMatchingDescendant;
        };

        // Calculate from roots
        Object.values(map).filter(n => !n.parent_id || !map[n.parent_id]).forEach(calc);

        return { accountMap: map, allAccounts: Object.values(map) };
    }, [data, selMasses]);

    // ── Data card ─────────────────────────────────────────────────────────────
    const cardStats = useMemo(() => {
        const visibleRoots = allAccounts.filter(a => a.isVisible && (!a.parent_id || !accountMap[a.parent_id] || !accountMap[a.parent_id].isVisible));
        const total = visibleRoots.reduce((s, a) => s + (a.periodTotals?.[0] ?? 0), 0);
        const count = allAccounts.filter(a => a.isVisible).length;
        const firstMass = selMasses.size === 1 ? MASSES.find(m => selMasses.has(m.id)) : null;
        return { total: Math.abs(total), count, firstMass };
    }, [allAccounts, accountMap, selMasses]);

    // ── Chart data ────────────────────────────────────────────────────────────
    const chartData = useMemo(() => {
        if (!allAccounts.length || !nPeriods) return { hbar: null, stacked: null, line: null };

        // hbar only considers nodes that MATCH directly
        const visibleAccs = allAccounts.filter(a => a.isVisible && a.matchesMassDirect);

        const massAggAllPeriods = (m) => {
            const arr = new Array(nPeriods).fill(0);
            allAccounts.filter(a => inMassObj(a, m) && (!a.parent_id || !accountMap[a.parent_id] || !inMassObj(accountMap[a.parent_id], m)))
                .forEach(a => {
                    for (let i = 0; i < nPeriods; i++) arr[i] += Math.abs(a.periodTotals?.[i] ?? 0);
                });
            return arr;
        };

        const byLevel = accs => {
            if (chartLevel === 1) return accs.filter(a => numDigits(a) === 2);
            if (chartLevel === 2) return accs.filter(a => numDigits(a) === 3);
            if (chartLevel === 3) return accs.filter(a => numDigits(a) >= 4);
            return accs;
        };

        let sorted = [];
        if (chartLevel === 0) {
            sorted = MASSES.filter(m => !selMasses.size || selMasses.has(m.id)).map(m => ({
                name: m.label,
                periodTotals: massAggAllPeriods(m),
                virtualColor: m.color,
                isMass: true,
                massId: m.id
            })).sort((a, b) => Math.abs(b.periodTotals[0]) - Math.abs(a.periodTotals[0]));
        } else {
            const levelAccs = byLevel(visibleAccs);
            sorted = [...levelAccs]
                .sort((a, b) => Math.abs(b.periodTotals?.[0] ?? 0) - Math.abs(a.periodTotals?.[0] ?? 0))
                .slice(0, 14);
        }

        const hbarLabels = sorted.map(a => a.name.length > 38 ? a.name.slice(0, 38) + '…' : a.name);
        const firstMassColor = selMasses.size === 1 ? (MASSES.find(m => selMasses.has(m.id))?.color ?? D.primary) : D.primary;

        const hbarDatasets = nPeriods <= 1 ? [{
            label: String(periods[0] ?? 'Saldo'),
            data: sorted.map(a => Math.abs(a.periodTotals?.[0] ?? 0)),
            backgroundColor: chartLevel === 0 ? sorted.map(a => a.virtualColor) : firstMassColor,
            borderRadius: 2,
            barThickness: 14,
        }] : periods.map((p, pIdx) => ({
            label: String(p),
            data: sorted.map(a => Math.abs(a.periodTotals?.[pIdx] ?? 0)),
            backgroundColor: chartLevel === 0 ? sorted.map(a => a.virtualColor) : PERIOD_BLUES[pIdx % PERIOD_BLUES.length],
            borderRadius: 2,
            barThickness: 10,
        }));

        const acVMass = massAggAllPeriods(MASSES[0])[0];
        const ancVMass = massAggAllPeriods(MASSES[1])[0];
        const pcVMass = massAggAllPeriods(MASSES[2])[0];
        const pncVMass = massAggAllPeriods(MASSES[3])[0];
        const pnVMass = massAggAllPeriods(MASSES[4])[0];

        const totalA = (acVMass + ancVMass) || 1;
        const totalPPN = (pcVMass + pncVMass + pnVMass) || 1;
        const p = (v, t) => t ? (v / t) * 100 : 0;

        let stackedDatasets = [];
        const colors = [D.ac, '#10B981', '#F59E0B', '#6366F1', D.pc, '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#84CC16', '#3B82F6', '#EF4444', '#EAB308'];

        if (chartLevel === 0) {
            stackedDatasets = [
                { label: 'A.1) Activo Corriente', data: [p(acVMass, totalA), 0], backgroundColor: D.ac },
                { label: 'A.2) Activo No Corr.', data: [p(ancVMass, totalA), 0], backgroundColor: D.anc },
                { label: 'P.3) Patrimonio Neto', data: [0, p(pnVMass, totalPPN)], backgroundColor: D.pn },
                { label: 'P.2) Pasivo No Corr.', data: [0, p(pncVMass, totalPPN)], backgroundColor: D.pnc },
                { label: 'P.1) Pasivo Corriente', data: [0, p(pcVMass, totalPPN)], backgroundColor: D.pc },
            ];
            if (selMasses.size > 0) {
                stackedDatasets = stackedDatasets.filter(ds => {
                    if (ds.label.includes('Activo Corriente') && selMasses.has('AC')) return true;
                    if (ds.label.includes('Activo No Corr.') && selMasses.has('ANC')) return true;
                    if (ds.label.includes('Patrimonio Neto') && selMasses.has('PN')) return true;
                    if (ds.label.includes('Pasivo No Corr.') && selMasses.has('PNC')) return true;
                    if (ds.label.includes('Pasivo Corriente') && selMasses.has('PC')) return true;
                    return false;
                });
            }
        } else {
            let sIdx = 0;
            let sumA = 0, sumPPN = 0;
            sorted.forEach(a => {
                const isA = inMassObj(a, MASSES[0]) || inMassObj(a, MASSES[1]);
                const v = Math.abs(a.periodTotals[0]);
                const pct = isA ? (v / totalA) * 100 : (v / totalPPN) * 100;

                if (isA) sumA += v;
                else sumPPN += v;

                stackedDatasets.push({
                    label: a.name.length > 25 ? a.name.slice(0, 25) + '…' : a.name,
                    data: isA ? [pct, 0] : [0, pct],
                    backgroundColor: colors[sIdx % colors.length]
                });
                sIdx++;
            });

            const restA = Math.max(0, (!selMasses.size || selMasses.has('AC') || selMasses.has('ANC') ? totalA : 0) - sumA);
            const restPPN = Math.max(0, (!selMasses.size || selMasses.has('PC') || selMasses.has('PNC') || selMasses.has('PN') ? totalPPN : 0) - sumPPN);

            if (restA > (totalA * 0.01)) stackedDatasets.push({ label: 'Resto Activo', data: [(restA / totalA) * 100, 0], backgroundColor: '#CBD5E1' });
            if (restPPN > (totalPPN * 0.01)) stackedDatasets.push({ label: 'Resto PN+Pasivo', data: [0, (restPPN / totalPPN) * 100], backgroundColor: '#94A3B8' });
        }

        const stacked = {
            labels: ['ACTIVO', 'PN + PASIVO'],
            datasets: stackedDatasets,
            totals: { totalA, totalPPN },
        };

        const lineLabels = [...periods].map(p => String(p).substring(0, 9));
        const lineDatasets = sorted.map((a, idx) => {
            return {
                label: a.name.length > 30 ? a.name.slice(0, 30) + '…' : a.name,
                data: [...(a.periodTotals || [])].map(v => Math.abs(v)),
                borderColor: a.virtualColor || colors[idx % colors.length],
                backgroundColor: a.virtualColor || colors[idx % colors.length],
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 4,
            };
        });

        return { hbar: { labels: hbarLabels, datasets: hbarDatasets }, stacked, line: { labels: lineLabels, datasets: lineDatasets } };
    }, [allAccounts, selMasses, chartLevel, periods, nPeriods, accountMap]);

    // ── TABLE (Photo 2 Replication) ───────────────────────────────────────────
    const AccountingTables = () => {
        if (!data?.results?.length) return null;

        const typeCfg = activeTab === 'pnl'
            ? [{ type: 'REVENUE', label: 'INGRESOS' }, { type: 'EXPENSE', label: 'GASTOS' }]
            : [{ type: 'ASSET', label: 'ACTIVO' }, { type: 'LIABILITY', label: 'PASIVO' }, { type: 'EQUITY', label: 'PATRIMONIO NETO' }];

        // Only show types that have visible roots
        const visibleTypes = typeCfg.filter(({ type }) =>
            allAccounts.some(a => a.type === type && a.isVisible)
        );

        const nameW = 340, saldoW = 86, pvW = 60, phW = 76;
        const colsPerP = nPeriods > 1 ? 3 : 2;

        const AccountRow = ({ node, grandTotals, level }) => {
            const n = accountMap[node.id] || node;
            if (!n.isVisible) return null;

            const isExp = !!expandedNodes[n.id];
            const visibleChildren = n.children.filter(c => (accountMap[c.id] || c).isVisible);
            const hasKids = visibleChildren.length > 0;
            const pt = n.periodTotals || [];
            const cur = pt[0] ?? 0;
            const prev = pt[1] ?? 0;
            const gt0 = grandTotals[0] || 1;
            const pv = (cur / gt0) * 100;
            const ph = prev ? ((cur - prev) / Math.abs(prev)) * 100 : 0;

            const isLevel0 = level === 0;

            return (
                <>
                    <tr style={{ height: 26, borderBottom: '1px solid #E2E8F0', background: '#FFFFFF' }}>
                        <td style={{ paddingLeft: 6 + level * 16, fontSize: 11, fontWeight: isLevel0 ? 700 : 400, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: nameW, borderRight: '1px solid #E2E8F0', position: 'sticky', left: 0, zIndex: 10, background: '#FFFFFF' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {hasKids ? (
                                    <div onClick={() => toggleNode(n.id)}>
                                        <TreeIcon isExpanded={isExp} />
                                    </div>
                                ) : <div style={{ width: 10 }} />}
                                {isLevel0 ? n.name.toUpperCase() : n.name}
                            </div>
                        </td>
                        {/* Period 0 */}
                        <td style={{ width: saldoW, textAlign: 'right', paddingRight: 8, fontSize: 11, fontWeight: isLevel0 ? 700 : 400, borderRight: '1px solid #E2E8F0' }}>{fmt(cur)}</td>
                        <td style={{ width: pvW, textAlign: 'right', paddingRight: 6, fontSize: 11, background: D.pvBg, fontWeight: isLevel0 ? 700 : 400, borderRight: '1px solid #E2E8F0' }}>{fmtPct2(pv)}</td>
                        {nPeriods > 1 && <td style={{ width: phW, textAlign: 'right', paddingRight: 6, fontSize: 11, fontWeight: 700, color: ph >= 0 ? D.phPos : D.phNeg, borderRight: '1px solid #E2E8F0' }}>{fmtPct(ph)}</td>}

                        {/* Period 1+ */}
                        {periods.slice(1).map((_, i) => {
                            const bal = pt[i + 1] ?? 0;
                            const pvx = grandTotals[i + 1] ? (bal / grandTotals[i + 1]) * 100 : 0;
                            const prv = pt[i + 2] ?? 0;
                            const phx = prv ? ((bal - prv) / Math.abs(prv)) * 100 : 0;
                            return (
                                <React.Fragment key={i}>
                                    <td style={{ width: saldoW, textAlign: 'right', paddingRight: 8, fontSize: 11, borderRight: '1px solid #E2E8F0', color: '#475569' }}>{fmt(bal)}</td>
                                    <td style={{ width: pvW, textAlign: 'right', paddingRight: 6, fontSize: 11, background: D.pvBg, borderRight: '1px solid #E2E8F0' }}>{fmtPct2(pvx)}</td>
                                    {nPeriods > 2 && <td style={{ width: phW, textAlign: 'right', paddingRight: 6, fontSize: 11, fontWeight: 700, color: phx >= 0 ? D.phPos : D.phNeg, borderRight: '1px solid #E2E8F0' }}>{fmtPct(phx)}</td>}
                                </React.Fragment>
                            );
                        })}
                    </tr>
                    {hasKids && isExp && visibleChildren.map(c => (
                        <AccountRow key={c.id} node={c} grandTotals={grandTotals} level={level + 1} />
                    ))}
                </>
            );
        };

        return (
            <div style={{ overflowX: 'auto', width: '100%', background: '#FFFFFF' }}>
                <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%', minWidth: 480, fontSize: 12 }}>
                    <colgroup>
                        <col style={{ width: nameW }} />
                        {periods.map((_, pi) => (
                            <React.Fragment key={pi}>
                                <col style={{ width: saldoW }} />
                                <col style={{ width: pvW }} />
                                {(nPeriods > 1 && (pi === 0 || nPeriods > 2)) && <col style={{ width: phW }} />}
                            </React.Fragment>
                        ))}
                    </colgroup>
                    <thead>
                        {/* Row 1: Periods */}
                        <tr style={{ background: '#FFFFFF', height: 26, borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ paddingLeft: 10, textAlign: 'center', fontSize: 11, fontStyle: 'italic', color: '#64748B', fontWeight: 400, borderRight: '1px solid #E2E8F0', position: 'sticky', left: 0, zIndex: 11, background: '#FFFFFF' }}>
                                Fiscal Year<br />Balance De Situación
                            </th>
                            {periods.map((p, pi) => (
                                <th key={pi} colSpan={nPeriods > 1 ? (pi === 0 || nPeriods > 2 ? 3 : 2) : 2}
                                    style={{ textAlign: 'center', fontSize: 12, fontWeight: 400, color: '#334155', borderRight: '1px solid #E2E8F0' }}>
                                    {String(p).substring(0, 9)}
                                </th>
                            ))}
                        </tr>
                        {/* Row 2: Columns */}
                        <tr style={{ background: '#FFFFFF', height: 26, borderBottom: '2px solid #E2E8F0' }}>
                            <th style={{ borderRight: '1px solid #E2E8F0', position: 'sticky', left: 0, zIndex: 11, background: '#FFFFFF' }} />
                            {periods.map((_, pi) => (
                                <React.Fragment key={pi}>
                                    <th style={{ textAlign: 'right', paddingRight: 8, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: '#64748B', borderRight: '1px solid #E2E8F0' }}>Saldo</th>
                                    <th style={{ textAlign: 'right', paddingRight: 6, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: '#A855F7', background: D.pvBg, borderRight: '1px solid #E2E8F0' }}>PV</th>
                                    {(nPeriods > 1 && (pi === 0 || nPeriods > 2)) && <th style={{ textAlign: 'right', paddingRight: 6, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: '#64748B', borderRight: '1px solid #E2E8F0' }}>PH</th>}
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleTypes.map(({ type, label }) => {
                            const roots = allAccounts.filter(a =>
                                a.isVisible && a.type === type && (!a.parent_id || !accountMap[a.parent_id] || !accountMap[a.parent_id].isVisible)
                            );
                            if (!roots.length) return null;

                            const grandTotals = roots.reduce(
                                (acc, r) => acc.map((v, i) => v + (r.periodTotals?.[i] ?? 0)),
                                new Array(nPeriods).fill(0)
                            );

                            return (
                                <React.Fragment key={type}>
                                    {roots.map((r, i) => (
                                        <React.Fragment key={r.id}>
                                            <AccountRow node={r} grandTotals={grandTotals} level={0} />
                                        </React.Fragment>
                                    ))}
                                    {/* Subtotal Row */}
                                    <tr style={{ background: '#FFFFFF', height: 28, borderBottom: '3px solid #E2E8F0' }}>
                                        <td style={{ paddingLeft: 6, fontWeight: 800, fontSize: 11, color: '#0F172A', borderRight: '1px solid #E2E8F0', position: 'sticky', left: 0, zIndex: 10, background: '#FFFFFF' }}>Total {label}</td>
                                        {periods.map((_, pi) => {
                                            const gt = grandTotals[pi] ?? 0;
                                            const prev = grandTotals[pi + 1] ?? 0;
                                            const phG = prev ? ((gt - prev) / Math.abs(prev)) * 100 : 0;
                                            return (
                                                <React.Fragment key={pi}>
                                                    <td style={{ textAlign: 'right', paddingRight: 8, fontWeight: 800, fontSize: 11, borderRight: '1px solid #E2E8F0' }}>{fmt(gt)}</td>
                                                    <td style={{ textAlign: 'right', paddingRight: 6, fontWeight: 800, fontSize: 11, background: D.pvBg, borderRight: '1px solid #E2E8F0' }}>
                                                        {grandTotals[0] ? '100.0 %' : '–'}
                                                    </td>
                                                    {(nPeriods > 1 && (pi === 0 || nPeriods > 2)) && (
                                                        <td style={{ textAlign: 'right', paddingRight: 6, fontSize: 11, fontWeight: 800, color: phG >= 0 ? D.phPos : D.phNeg, borderRight: '1px solid #E2E8F0' }}>
                                                            {pi === 0 ? '–' : fmtPct(phG)}
                                                        </td>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // ── CASHFLOW ──────────────────────────────────────────────────────────────
    const CashflowTable = () => {
        if (!data?.results?.length) return null;
        const cats = [{ key: 'OPERATING', label: "A) Explotación" }, { key: 'INVESTING', label: "B) Inversión" }, { key: 'FINANCING', label: "C) Financiación" }];
        return (
            <div style={{ overflowX: 'auto', background: '#FFFFFF' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                        <tr style={{ background: D.tblHeader, borderBottom: '2px solid #E2E8F0', height: 36 }}>
                            <th style={{ textAlign: 'left', paddingLeft: 12, fontWeight: 800, color: '#334155', position: 'sticky', left: 0, zIndex: 11, background: D.tblHeader }}>FLUJOS DE EFECTIVO</th>
                            {periods.map(p => <th key={p} style={{ textAlign: 'right', paddingRight: 12, fontWeight: 700, color: '#334155' }}>{String(p).substring(0, 9)}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {cats.map(({ key, label }) => (
                            <tr key={key} style={{ borderBottom: '1px solid #E2E8F0', height: 36 }}>
                                <td style={{ paddingLeft: 14, fontWeight: 600, color: '#334155', position: 'sticky', left: 0, zIndex: 10, background: '#FFFFFF' }}>{label}</td>
                                {data.results.map((r, i) => {
                                    const v = r.activities?.find(a => a.category === key)?.net_cash ?? 0;
                                    return <td key={i} style={{ textAlign: 'right', paddingRight: 12, fontWeight: 700, color: v >= 0 ? D.phPos : D.phNeg }}>{fmt(v)}</td>;
                                })}
                            </tr>
                        ))}
                        <tr style={{ background: '#F8FAFC', height: 38 }}>
                            <td style={{ paddingLeft: 14, fontWeight: 900, color: D.primary, position: 'sticky', left: 0, zIndex: 10, background: '#F8FAFC' }}>TOTAL</td>
                            {data.results.map((r, i) => {
                                const t = r.activities?.reduce((s, a) => s + (a.net_cash || 0), 0) ?? 0;
                                return <td key={i} style={{ textAlign: 'right', paddingRight: 12, fontWeight: 900, color: D.primary, fontSize: 14 }}>{fmt(t)}</td>;
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    };

    // ── RENDER ────────────────────────────────────────────────────────────────
    const hasData = !!(data?.results?.length);
    const LEVEL_OPTS = [{ v: 1, l: 'Cuentas' }, { v: 2, l: 'Subcuentas' }, { v: 3, l: 'Subnivel' }];
    const cardColor = cardStats.firstMass?.color ?? D.primary;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: D.bg, fontFamily: "'Segoe UI',system-ui,sans-serif", overflow: 'hidden' }}>

            {/* ── NAV ── */}
            <div style={{ background: D.navBg, borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', minHeight: 48, padding: '0 10px', gap: 0, flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingRight: 10, marginRight: 6, borderRight: '1px solid #E2E8F0', flexShrink: 0 }}>
                    <div style={{ width: 24, height: 24, background: D.primary, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <FileBarChart size={13} color="white" />
                    </div>
                    <span style={{ fontWeight: 900, fontSize: 12, color: D.primary }}>REPORT</span>
                </div>
                <div style={{ display: 'flex', flexShrink: 0 }}>
                    {[{ id: 'balance', l: 'BALANCE' }, { id: 'pnl', l: 'P&L' }, { id: 'cashflow', l: 'CASHFLOW' }].map(t => (
                        <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                            padding: '0 10px', height: 48, border: 'none', background: 'none', cursor: 'pointer',
                            borderBottom: activeTab === t.id ? `3px solid ${D.primary}` : '3px solid transparent',
                            color: activeTab === t.id ? D.primary : '#94A3B8',
                            fontWeight: 800, fontSize: 10, letterSpacing: '.4px', whiteSpace: 'nowrap',
                        }}>{t.l}</button>
                    ))}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', padding: '4px 0' }}>
                    <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 4, padding: 2, gap: 1 }}>
                        {['ANNUAL', 'MONTHLY'].map(m => (
                            <button key={m} onClick={() => setFilterMode(m)} style={{
                                padding: '2px 8px', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontWeight: 800,
                                background: filterMode === m ? D.primary : 'transparent', color: filterMode === m ? '#FFF' : '#94A3B8',
                            }}>{m === 'ANNUAL' ? 'Anual' : 'Mensual'}</button>
                        ))}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={customRange} onChange={e => setCustomRange(e.target.checked)} style={{ accentColor: D.primary }} />
                        Rango
                    </label>
                    {filterMode === 'ANNUAL' ? (!customRange ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 1, background: '#F1F5F9', borderRadius: 4, padding: '1px 6px', border: '1px solid #E2E8F0' }}>
                            <button onClick={() => setAnnualYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.primary, display: 'flex' }}><ChevronLeft size={12} /></button>
                            <span style={{ fontWeight: 900, fontSize: 12, minWidth: 30, textAlign: 'center' }}>{annualYear}</span>
                            <button onClick={() => setAnnualYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: D.primary, display: 'flex' }}><ChevronRight size={12} /></button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <input type="number" value={annualFrom} onChange={e => setAnnualFrom(+e.target.value)} style={{ width: 58, padding: '2px 4px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 11, fontWeight: 700 }} />
                            <span style={{ color: '#CBD5E1', fontSize: 10 }}>–</span>
                            <input type="number" value={annualTo} onChange={e => setAnnualTo(+e.target.value)} style={{ width: 58, padding: '2px 4px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 11, fontWeight: 700 }} />
                        </div>
                    )) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <select value={fromMonth} onChange={e => setFromMonth(e.target.value)} style={{ padding: '2px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 10 }}>
                                {[...Array(12)].map((_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{String(i + 1).padStart(2, '0')}</option>)}
                            </select>
                            <input type="number" value={fromYear} onChange={e => setFromYear(+e.target.value)} style={{ width: 52, padding: '2px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 10 }} />
                            <ArrowRightLeft size={10} color="#CBD5E1" />
                            <select value={toMonth} onChange={e => setToMonth(e.target.value)} style={{ padding: '2px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 10 }}>
                                {[...Array(12)].map((_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{String(i + 1).padStart(2, '0')}</option>)}
                            </select>
                            <input type="number" value={toYear} onChange={e => setToYear(+e.target.value)} style={{ width: 52, padding: '2px', borderRadius: 3, border: '1px solid #CBD5E1', fontSize: 10 }} />
                        </div>
                    )}
                    <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700, borderLeft: '1px solid #E2E8F0', paddingLeft: 6, whiteSpace: 'nowrap' }}>{getPeriodLabel()}</span>
                </div>
            </div>

            {/* ── BODY ── */}
            {loading ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={40} color={D.primary} style={{ animation: 'spin 1s linear infinite' }} />
                </div>
            ) : !hasData ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                    <Database size={44} color="#CBD5E1" />
                    <p style={{ color: '#64748B', fontWeight: 700, fontSize: 14 }}>Sin datos — {getPeriodLabel()}</p>
                    <button onClick={fetchData} style={{ padding: '8px 20px', background: D.primary, color: '#FFF', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer', fontSize: 12 }}>Recargar</button>
                </div>
            ) : (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row', minHeight: 0 }}>

                    {/* ── SIDEBAR ── */}
                    <div style={{
                        width: 148, flexShrink: 0,
                        background: D.sideBg, borderRight: '1px solid #E2E8F0',
                        display: 'flex', flexDirection: 'column',
                        padding: '8px 6px', gap: 4, overflowY: 'auto',
                    }}>
                        <button onClick={clearMasses} style={{
                            padding: '9px 6px', borderRadius: 5,
                            border: !selMasses.size ? `1.5px solid ${D.primary}` : '1px solid #E2E8F0',
                            background: !selMasses.size ? '#EFF6FF' : '#F8FAFC',
                            color: !selMasses.size ? D.primary : '#94A3B8',
                            fontWeight: 800, fontSize: 8.5, cursor: 'pointer', letterSpacing: '.5px',
                            textTransform: 'uppercase', textAlign: 'center', width: '100%', transition: 'all .15s',
                        }}>🔍 VER TODO</button>

                        {MASSES.map(g => {
                            const active = selMasses.has(g.id);
                            return (
                                <button key={g.id} onClick={() => toggleMass(g.id)} style={{
                                    padding: '11px 6px', borderRadius: 5, border: 'none',
                                    background: active ? '#1F2937' : '#F3F4F6',
                                    color: active ? '#FFFFFF' : '#374151',
                                    fontWeight: 800, fontSize: 8.5, cursor: 'pointer', letterSpacing: '.5px',
                                    textTransform: 'uppercase', textAlign: 'center',
                                    transition: 'all .15s', lineHeight: 1.4, width: '100%',
                                    boxShadow: active ? '0 3px 8px rgba(0,0,0,.25)' : 'none',
                                }}>
                                    {g.label}
                                </button>
                            );
                        })}

                        {/* Data card */}
                        <div style={{
                            marginTop: 'auto', borderRadius: 7, padding: '10px 8px',
                            background: `${cardColor}12`,
                            border: `1px solid ${cardColor}44`,
                            flexShrink: 0,
                        }}>
                            <div style={{ fontSize: 7.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: cardColor, marginBottom: 3 }}>
                                {selMasses.size === 1 ? cardStats.firstMass?.label : selMasses.size > 1 ? `${selMasses.size} masas` : 'TOTAL GENERAL'}
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 900, color: cardColor, lineHeight: 1.1 }}>
                                {fmt(cardStats.total)}
                            </div>
                            <div style={{ fontSize: 8, color: '#94A3B8', marginTop: 2 }}>{cardStats.count} cuentas</div>
                        </div>
                    </div>

                    {/* ── MAIN PANEL ── */}
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minWidth: 0, padding: '10px' }}>

                        {/* Table */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', overflow: 'hidden', flexShrink: 0, marginBottom: 12 }}>
                            {activeTab === 'cashflow' ? <CashflowTable /> : <AccountingTables />}
                        </div>

                        {/* Charts */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>

                            {/* Horizontal Bar */}
                            <div style={{ flex: '2 1 260px', minWidth: 0, background: D.navBg, border: '1px solid #E2E8F0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <BarChart3 size={13} color={D.primary} />
                                        <span style={{ fontWeight: 800, fontSize: 10, color: D.primary, letterSpacing: '.3px' }}>
                                            {selMasses.size ? [...selMasses].map(id => MASSES.find(m => m.id === id)?.label?.split(' ')[0]).join(', ') : 'TODAS LAS MASAS'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 4, padding: 2, gap: 1 }}>
                                        {LEVEL_OPTS.map(opt => (
                                            <button key={opt.v} onClick={() => setChartLevel(chartLevel === opt.v ? 0 : opt.v)} style={{
                                                padding: '2px 7px', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 8.5, fontWeight: 800,
                                                background: chartLevel === opt.v ? D.primary : 'transparent',
                                                color: chartLevel === opt.v ? '#FFF' : '#94A3B8', transition: '.15s',
                                            }}>{opt.l}</button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ height: 280 }}>
                                    {chartData.hbar ? (
                                        <Bar data={chartData.hbar} options={{
                                            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                                            plugins: {
                                                legend: { display: nPeriods > 1, position: 'right', labels: { boxWidth: 8, padding: 6, font: { size: 8.5, weight: '600' } } },
                                                tooltip: { backgroundColor: '#1e293b', padding: 8 },
                                                datalabels: { display: false }
                                            },
                                            scales: {
                                                x: { grid: { display: false }, ticks: { font: { size: 8.5 } } },
                                                y: { grid: { display: false }, ticks: { font: { size: 8.5 } } },
                                            },
                                        }} />
                                    ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#CBD5E1', fontSize: 12 }}>Sin datos</div>}
                                </div>
                            </div>

                            {/* Stacked Structure */}
                            <div style={{ flex: '1 1 220px', minWidth: 0, background: D.navBg, border: '1px solid #E2E8F0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        <PieChart size={13} color={D.primary} />
                                        <span style={{ fontWeight: 800, fontSize: 10, color: D.primary }}>ESTRUCTURA FINANCIERA</span>
                                    </div>
                                    <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 4, padding: 2, gap: 1 }}>
                                        {LEVEL_OPTS.map(opt => (
                                            <button key={opt.v} onClick={() => setChartLevel(opt.v)} style={{
                                                padding: '2px 7px', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 8.5, fontWeight: 800,
                                                background: chartLevel === opt.v ? D.primary : 'transparent',
                                                color: chartLevel === opt.v ? '#FFF' : '#94A3B8', transition: '.15s',
                                            }}>{opt.l}</button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ flex: 1, minHeight: 200 }}>
                                    {chartData.stacked ? (
                                        <Bar data={chartData.stacked} plugins={[ChartDataLabels]} options={{
                                            responsive: true, maintainAspectRatio: false,
                                            scales: {
                                                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9, weight: '700' } } },
                                                y: { stacked: true, max: 100, grid: { color: '#F1F5F9' }, ticks: { callback: v => v + '%', font: { size: 8 } } },
                                            },
                                            plugins: {
                                                legend: { position: 'right', labels: { boxWidth: 9, padding: 8, font: { size: 9, weight: '600' } } },
                                                tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toFixed(1)}%` } },
                                                datalabels: {
                                                    color: '#FFFFFF',
                                                    font: { weight: 'bold', size: 10 },
                                                    formatter: (value) => value > 3 ? value.toFixed(1) + '%' : '',
                                                    align: 'center',
                                                    anchor: 'center'
                                                }
                                            },
                                        }} />
                                    ) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#CBD5E1', fontSize: 12 }}>Sin datos</div>}
                                </div>
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 6, fontSize: 9.5, color: '#64748B', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Total Activo</span><b style={{ color: D.primary }}>{fmt(chartData.stacked?.totals?.totalA)}</b>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>PN + Pasivo</span><b style={{ color: D.primary }}>{fmt(chartData.stacked?.totals?.totalPPN)}</b>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Line Chart */}
                        <div style={{ marginTop: 12, background: D.navBg, border: '1px solid #E2E8F0', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FileBarChart size={13} color={D.primary} />
                                <span style={{ fontWeight: 800, fontSize: 10, color: D.primary }}>EVOLUCIÓN TEMPORAL</span>
                            </div>
                            <div style={{ height: 260 }}>
                                {chartData.line && nPeriods > 0 ? (
                                    <Line data={chartData.line} options={{
                                        responsive: true, maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 9, weight: '600' } } },
                                            tooltip: { backgroundColor: '#1e293b', padding: 8 },
                                            datalabels: { display: false }
                                        },
                                        scales: {
                                            x: { grid: { display: false }, ticks: { font: { size: 9, weight: '600' } } },
                                            y: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 9 } } },
                                        },
                                    }} />
                                ) : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#CBD5E1', fontSize: 12 }}>Sin datos</div>}
                            </div>
                        </div>

                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
                *{box-sizing:border-box}
                ::-webkit-scrollbar{width:4px;height:4px}
                ::-webkit-scrollbar-track{background:#F1F5F9}
                ::-webkit-scrollbar-thumb{background:#93C5FD;border-radius:4px}
            `}</style>
        </div>
    );
}
