import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { Search, Download, Menu, X } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, LogarithmicScale, Filler, LineController, BarController, ScatterController } from 'chart.js';
import { Line, Bar, Chart, Scatter } from 'react-chartjs-2';
import annotationPlugin from 'chartjs-plugin-annotation';
import Plot from 'react-plotly.js';
import QuantMachineLearning from '../components/QuantMachineLearning';
import FinancialAnalysis from '../components/FinancialAnalysis';

ChartJS.register(CategoryScale, LinearScale, LogarithmicScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler, LineController, BarController, ScatterController, annotationPlugin);

const QuantReport = () => {
    const [ticker, setTicker] = useState('');
    const [benchmark, setBenchmark] = useState('SPY');
    const [years, setYears] = useState(5);

    // New State Variables
    const [mode, setMode] = useState("PORTFOLIO");
    const [mcSource, setMcSource] = useState('strategy'); // 'strategy', 'benchmark', 'portfolio'
    const [portfolioData, setPortfolioData] = useState(null); // Cache for My Portfolio data
    const [currency, setCurrency] = useState("USD"); // USD or EUR for ticker
    const [benchmarkCurrency, setBenchmarkCurrency] = useState("USD"); // USD or EUR for benchmark
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [portfolioAssets, setPortfolioAssets] = useState([]);

    // Automatically load portfolio tickers on mount
    useEffect(() => {
        api.get('/investments')
            .then(res => {
                const tickers = [...new Set(res.data.map(i => i.ticker).filter(t => t))];
                setPortfolioAssets(tickers);
                setOptTickers(tickers.join(', '));
            })
            .catch(err => console.error("Could not fetch portfolio investments", err));
    }, []);

    // Account Selection for Portfolio
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState('');

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    // Optimizer State
    const [optTickers, setOptTickers] = useState("AAPL, MSFT, GOOGL, AMZN, NVDA");
    const [optData, setOptData] = useState(null);
    const [optLoading, setOptLoading] = useState(false);
    const [optMetric, setOptMetric] = useState('volatility'); // 'volatility' or 'maxDrawdown'

    // New Optimizer Tabs State
    const [optTab, setOptTab] = useState('efficientFrontier'); // 'efficientFrontier', 'correlation', 'walkforward'
    const [correlationData, setCorrelationData] = useState(null);
    const [correlationLoading, setCorrelationLoading] = useState(false);
    const [correlationPeriod, setCorrelationPeriod] = useState('daily'); // daily, monthly, annual
    const [correlationType, setCorrelationType] = useState('returns'); // returns, drawdowns
    const [walkforwardData, setWalkforwardData] = useState(null);
    const [walkforwardLoading, setWalkforwardLoading] = useState(false);

    // Monte Carlo State
    const [mcSimulations, setMcSimulations] = useState(100);
    const [mcData, setMcData] = useState(null);
    const [mcLoading, setMcLoading] = useState(false);
    const [hoveredPath, setHoveredPath] = useState(null);
    const [hoveredQuantileVal, setHoveredQuantileVal] = useState(null);
    const [hoveredQuantileY, setHoveredQuantileY] = useState(null);
    const [hoveredQuantileType, setHoveredQuantileType] = useState(null);
    const [hoveredPoint, setHoveredPoint] = useState(null); // {x, y, type: 'expected' | 'best'}
    const [optimizerPortfolio, setOptimizerPortfolio] = useState('maxSharpe'); // 'maxSharpe', 'minVol', 'minDrawdown', 'expectedValue'

    // Financial Analysis State
    const [finData, setFinData] = useState(null);
    const [finLoading, setFinLoading] = useState(false);
    const [finPeriod, setFinPeriod] = useState('annual'); // 'annual' or 'quarterly'

    // Selected Portfolio Selection
    const [selectedWeights, setSelectedWeights] = useState(null);
    const [selectedPortfolioInfo, setSelectedPortfolioInfo] = useState(null);

    const handleOptimize = async () => {
        setOptLoading(true);
        setError(null);
        setSelectedWeights(null);
        setSelectedPortfolioInfo(null);
        const tickersList = optTickers.split(',').map(t => t.trim().toUpperCase()).filter(t => t.length > 0);

        let optRes = null;
        try {
            const res = await api.post('/investments/optimize', {
                tickers: tickersList,
                years: years,
                currency: currency
            });
            optRes = res;
            setOptData(res.data);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || "Optimization failed");
        } finally {
            setOptLoading(false);
        }

        // Fetch Correlation
        setCorrelationLoading(true);
        try {
            const resCor = await api.post('/investments/correlation', {
                tickers: tickersList,
                startDate,
                endDate,
                years,
                period: correlationPeriod,
                type: correlationType
            });
            setCorrelationData(resCor.data);
        } catch (err) {
            console.error("Correlation error:", err);
        } finally {
            setCorrelationLoading(false);
        }

        // Fetch Walkforward
        setWalkforwardLoading(true);
        try {
            const bestWeightsObj = optRes?.data?.bestPortfolio?.weights || {};
            console.log("[Walkforward] optRes:", optRes?.data?.bestPortfolio);
            console.log("[Walkforward] weights:", bestWeightsObj);
            const bestTickersList = Object.keys(bestWeightsObj);
            const bestWeightsArr = Object.values(bestWeightsObj);
            if (bestTickersList.length > 0) {
                const resWf2 = await api.post('/investments/walkforward', {
                    tickers: bestTickersList,
                    weights: bestWeightsArr,
                    years
                });
                setWalkforwardData(resWf2.data);
            }
        } catch (err) {
            console.error("Walkforward error:", err);
            setWalkforwardData(null);
        } finally {
            setWalkforwardLoading(false);
        }
    };

    const fetchCorrelation = async () => {
        if (!optTickers) return;
        setCorrelationLoading(true);
        try {
            const tickersList = optTickers.split(',').map(t => t.trim().toUpperCase()).filter(t => t.length > 0);
            const resCor = await api.post('/investments/correlation', {
                tickers: tickersList,
                startDate,
                endDate,
                years,
                period: correlationPeriod,
                type: correlationType
            });
            setCorrelationData(resCor.data);
        } catch (err) {
            console.error("Correlation error:", err);
        } finally {
            setCorrelationLoading(false);
        }
    };

    // Auto-fetch correlation when filters change (if optimization already ran)
    useEffect(() => {
        if (optData) {
            fetchCorrelation();
        }
    }, [correlationPeriod, correlationType]);

    const runMonteCarlo = async (sims) => {
        if (!data) return;
        setMcLoading(true);

        let prices = null;
        let mcLabels = null;

        // Determine data source
        if (mcSource === 'benchmark') {
            prices = data.benchmarkPrices;
        } else if (mcSource === 'portfolio') {
            if (mode === 'PORTFOLIO') {
                prices = data.strategyPrices;
            } else {
                // Check cache or fetch
                if (portfolioData) {
                    prices = portfolioData.strategyPrices;
                } else {
                    try {
                        let queryParams = `?benchmark=${benchmark}&currency=${currency}&benchmarkCurrency=${benchmarkCurrency}&t=${Date.now()}&years=${years}`;
                        const res = await api.get(`/investments/analyze/PORTFOLIO${queryParams}`);
                        setPortfolioData(res.data);
                        prices = res.data.strategyPrices;
                        mcLabels = res.data.cumulativeReturns?.map(d => d.date);
                    } catch (err) {
                        console.error("Failed to fetch portfolio data for MC", err);
                        setMcLoading(false);
                        return;
                    }
                }
            }
        } else if (mcSource === 'optimizer') {
            if (!optData) {
                alert("Please run optimization first.");
                setMcLoading(false);
                return;
            }

            let targetWeights = null;
            if (optimizerPortfolio === 'maxSharpe') targetWeights = optData.bestPortfolio.weights;
            else if (optimizerPortfolio === 'minVol') targetWeights = optData.minVolPortfolio.weights;
            else if (optimizerPortfolio === 'minDrawdown') targetWeights = optData.minDrawdownPortfolio.weights;
            else if (optimizerPortfolio === 'expectedValue' && kde3dData) targetWeights = kde3dData.avgWeights;

            if (!targetWeights) {
                alert("Selected portfolio data not available.");
                setMcLoading(false);
                return;
            }

            // Fetch Custom Portfolio History
            try {
                const res = await api.post('/investments/analyze/custom', {
                    weights: targetWeights,
                    benchmark: benchmark,
                    years: years
                });
                prices = res.data.strategyPrices;
                mcLabels = res.data.cumulativeReturns?.map(d => d.date);
            } catch (err) {
                console.error("Failed to simulate optimizer portfolio", err);
                alert("Failed to simulate portfolio: " + err.message);
                setMcLoading(false);
                return;
            }

        } else if (mcSource === 'selected') {
            if (!selectedWeights) {
                alert("Please select a portfolio from the chart first.");
                setMcLoading(false);
                return;
            }

            // Fetch Custom Selection History
            try {
                const res = await api.post('/investments/analyze/custom', {
                    weights: selectedWeights,
                    benchmark: benchmark,
                    years: years
                });
                prices = res.data.strategyPrices;
                mcLabels = res.data.cumulativeReturns?.map(d => d.date);
            } catch (err) {
                console.error("Failed to simulate selected portfolio", err);
                alert("Failed to simulate portfolio: " + err.message);
                setMcLoading(false);
                return;
            }
        } else {
            // strategy (Ticker or Portfolio depending on mode)
            prices = data.strategyPrices;
            mcLabels = data.cumulativeReturns?.map(d => d.date);
        }

        if (!prices || prices.length < 2) {
            setMcLoading(false);
            if (mcSource === 'portfolio') {
                alert("Tu portfolio está vacío o no tiene suficiente historial para realizar la simulación.");
            }
            return;
        }

        setTimeout(() => {
            const returns = [];
            for (let i = 1; i < prices.length; i++) {
                returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
            }

            const paths = [];
            const terminalValues = [];

            // Original Path (for comparison)
            const originalPath = [0];
            let cum = 0;
            for (let r of returns) {
                cum = (1 + cum) * (1 + r) - 1;
                originalPath.push(cum * 100); // Store as %
            }

            const maxDrawdowns = [];
            // Simulations
            const numSims = sims || mcSimulations;
            for (let i = 0; i < numSims; i++) {
                let simCum = 0;
                let peak = 1;
                let maxDD = 0;
                const path = [0];
                for (let t = 0; t < returns.length; t++) {
                    const randR = returns[Math.floor(Math.random() * returns.length)];
                    simCum = (1 + simCum) * (1 + randR) - 1;
                    const currentPrice = 1 + simCum;
                    if (currentPrice > peak) peak = currentPrice;
                    const dd = (currentPrice - peak) / peak;
                    if (dd < maxDD) maxDD = dd;
                    path.push(simCum * 100);
                }
                paths.push(path);
                terminalValues.push(simCum);
                maxDrawdowns.push(maxDD);
            }

            // PDF Analysis
            const sortedTerminalValues = [...terminalValues].sort((a, b) => a - b);
            const min = sortedTerminalValues[0];
            const max = sortedTerminalValues[sortedTerminalValues.length - 1];
            const step = (max - min) / 20;
            const distLabels = [];
            const distCounts = [];
            for (let b = min; b <= max; b += step) {
                distLabels.push((b * 100).toFixed(1));
                distCounts.push(terminalValues.filter(v => v >= b && v < b + step).length);
            }

            // KDE Calculation for Terminal Values
            const gaussianKernel = (u) => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
            const tMean = terminalValues.reduce((a, b) => a + b, 0) / terminalValues.length;
            const tStdDev = Math.sqrt(terminalValues.reduce((a, b) => a + Math.pow(b - tMean, 2), 0) / terminalValues.length);
            let bandwidth = 1.06 * tStdDev * Math.pow(terminalValues.length, -0.2);
            if (!bandwidth) bandwidth = (max - min) / 20;

            const kdeData = [];
            const kdeStep = (max - min) / 100; // Smoother resolution
            for (let x = min; x <= max; x += kdeStep) {
                let sum = 0;
                for (let val of terminalValues) {
                    const u = (x - val) / bandwidth;
                    sum += gaussianKernel(u);
                }
                const density = (1 / (terminalValues.length * bandwidth)) * sum;
                kdeData.push({ x: x * 100, y: density });
            }

            // CDF Analysis for Terminal Values
            const cdfData = [];
            for (let i = 0; i < sortedTerminalValues.length; i++) {
                if (i % Math.ceil(sortedTerminalValues.length / 50) === 0) { // Downsample for performance
                    cdfData.push({ x: sortedTerminalValues[i] * 100, y: (i + 1) / sortedTerminalValues.length * 100 });
                }
            }

            // Distribution Analysis for Max Drawdowns
            const sortedDD = [...maxDrawdowns].sort((a, b) => a - b);
            const ddMin = sortedDD[0];
            const ddMax = sortedDD[sortedDD.length - 1];

            // KDE for Max Drawdowns
            const ddMean = sortedDD.reduce((a, b) => a + b, 0) / sortedDD.length;
            const ddStdDev = Math.sqrt(sortedDD.reduce((a, b) => a + Math.pow(b - ddMean, 2), 0) / sortedDD.length);
            let ddBandwidth = 1.06 * ddStdDev * Math.pow(sortedDD.length, -0.2);
            if (!ddBandwidth) ddBandwidth = (ddMax - ddMin) / 20;

            const kdeDrawdown = [];
            const ddKdeStep = (ddMax - ddMin) / 100;
            for (let x = ddMin; x <= ddMax; x += ddKdeStep) {
                let sum = 0;
                for (let val of sortedDD) {
                    const u = (x - val) / ddBandwidth;
                    sum += gaussianKernel(u);
                }
                const density = (1 / (sortedDD.length * ddBandwidth)) * sum;
                kdeDrawdown.push({ x: x * 100, y: density });
            }

            // CDF for Max Drawdowns
            const cdfDrawdown = [];
            for (let i = 0; i < sortedDD.length; i++) {
                if (i % Math.ceil(sortedDD.length / 50) === 0) {
                    cdfDrawdown.push({ x: sortedDD[i] * 100, y: (i + 1) / sortedDD.length * 100 });
                }
            }

            const getQuantile = (arr, q) => {
                const sorted = [...arr].sort((a, b) => a - b);
                const pos = (sorted.length - 1) * q;
                const base = Math.floor(pos);
                const rest = pos - base;
                if (sorted[base + 1] !== undefined) {
                    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
                } else {
                    return sorted[base];
                }
            };

            // Calculate Historical Max Drawdown
            let histPeak = 1;
            let histMaxDD = 0;
            let histCum = 1;
            for (let r of returns) {
                histCum *= (1 + r);
                if (histCum > histPeak) histPeak = histCum;
                const dd = (histCum - histPeak) / histPeak;
                if (dd < histMaxDD) histMaxDD = dd;
            }

            setMcData({
                paths,
                originalPath,
                labels: mcLabels || new Array(paths[0].length).fill(0).map((_, i) => i),
                terminalValues,
                maxDrawdowns,
                distLabels,
                distCounts,
                kdeData,
                cdfData,
                kdeDrawdown,
                cdfDrawdown,
                meanReturn: tMean * 100,
                originalReturn: originalPath[originalPath.length - 1],
                meanDrawdown: ddMean * 100,
                originalMaxDD: histMaxDD * 100,
                quantiles: {
                    returns: {
                        5: {
                            val: getQuantile(terminalValues, 0.95) * 100,
                            idx: terminalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((terminalValues.length - 1) * 0.95)].i,
                            yKde: kdeData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.95) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.95) * 100) ? curr : prev).y,
                            yCdf: cdfData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.95) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.95) * 100) ? curr : prev).y
                        },
                        25: {
                            val: getQuantile(terminalValues, 0.75) * 100,
                            idx: terminalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((terminalValues.length - 1) * 0.75)].i,
                            yKde: kdeData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.75) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.75) * 100) ? curr : prev).y,
                            yCdf: cdfData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.75) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.75) * 100) ? curr : prev).y
                        },
                        50: {
                            val: getQuantile(terminalValues, 0.50) * 100,
                            idx: terminalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((terminalValues.length - 1) * 0.50)].i,
                            yKde: kdeData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.50) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.50) * 100) ? curr : prev).y,
                            yCdf: cdfData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.50) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.50) * 100) ? curr : prev).y
                        },
                        75: {
                            val: getQuantile(terminalValues, 0.25) * 100,
                            idx: terminalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((terminalValues.length - 1) * 0.25)].i,
                            yKde: kdeData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.25) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.25) * 100) ? curr : prev).y,
                            yCdf: cdfData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.25) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.25) * 100) ? curr : prev).y
                        },
                        95: {
                            val: getQuantile(terminalValues, 0.05) * 100,
                            idx: terminalValues.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((terminalValues.length - 1) * 0.05)].i,
                            yKde: kdeData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.05) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.05) * 100) ? curr : prev).y,
                            yCdf: cdfData.reduce((prev, curr) => Math.abs(curr.x - getQuantile(terminalValues, 0.05) * 100) < Math.abs(prev.x - getQuantile(terminalValues, 0.05) * 100) ? curr : prev).y
                        },
                    },
                    drawdown: {
                        5: {
                            val: getQuantile(maxDrawdowns, 0.95) * 100,
                            idx: maxDrawdowns.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((maxDrawdowns.length - 1) * 0.95)].i,
                            yKde: kdeDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.95) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.95) * 100) ? curr : prev).y,
                            yCdf: cdfDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.95) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.95) * 100) ? curr : prev).y
                        },
                        25: {
                            val: getQuantile(maxDrawdowns, 0.75) * 100,
                            idx: maxDrawdowns.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((maxDrawdowns.length - 1) * 0.75)].i,
                            yKde: kdeDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.75) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.75) * 100) ? curr : prev).y,
                            yCdf: cdfDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.75) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.75) * 100) ? curr : prev).y
                        },
                        50: {
                            val: getQuantile(maxDrawdowns, 0.50) * 100,
                            idx: maxDrawdowns.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((maxDrawdowns.length - 1) * 0.50)].i,
                            yKde: kdeDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.50) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.50) * 100) ? curr : prev).y,
                            yCdf: cdfDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.50) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.50) * 100) ? curr : prev).y
                        },
                        75: {
                            val: getQuantile(maxDrawdowns, 0.25) * 100,
                            idx: maxDrawdowns.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((maxDrawdowns.length - 1) * 0.25)].i,
                            yKde: kdeDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.25) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.25) * 100) ? curr : prev).y,
                            yCdf: cdfDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.25) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.25) * 100) ? curr : prev).y
                        },
                        95: {
                            val: getQuantile(maxDrawdowns, 0.05) * 100,
                            idx: maxDrawdowns.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v)[Math.floor((maxDrawdowns.length - 1) * 0.05)].i,
                            yKde: kdeDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.05) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.05) * 100) ? curr : prev).y,
                            yCdf: cdfDrawdown.reduce((prev, curr) => Math.abs(curr.x - getQuantile(maxDrawdowns, 0.05) * 100) < Math.abs(prev.x - getQuantile(maxDrawdowns, 0.05) * 100) ? curr : prev).y
                        },
                    }
                }
            });
            setMcLoading(false);
        }, 50);
    };

    // Responsive State
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (data && mode === 'RISK_ANALYSIS') {
            runMonteCarlo(mcSimulations);
        }
    }, [data, mcSimulations, mode, mcSource]);

    // Auto-trigger analysis when mode or selectedAccount changes (except for modes that handle it differently)
    useEffect(() => {
        if (mode === 'TICKER' && ticker && ticker !== 'Optimized Portfolio') {
            analyzeTicker();
        } else if (mode === 'PORTFOLIO') {
            analyzeTicker();
        } else if (mode === 'FINANCIALS' && ticker) {
            analyzeFinancials();
        }
    }, [mode, selectedAccount]);

    const [usingBenchmarkFallback, setUsingBenchmarkFallback] = useState(false);

    const analyzeTicker = async (symbol = null, bench = null, period = null) => {
        setLoading(true);
        setError(null);
        setUsingBenchmarkFallback(false);
        try {
            // If the target is "Optimized Portfolio", redirect to custom analysis logic
            if ((symbol || ticker) === 'Optimized Portfolio') {
                analyzeCustomPortfolio();
                return;
            }

            // Determine effective params (overrides vs state)
            const effectiveMode = symbol ? 'TICKER' : mode;
            const targetTicker = effectiveMode === 'PORTFOLIO' ? 'PORTFOLIO' : (symbol || ticker);
            const targetBench = bench || benchmark;

            let queryParams = `?benchmark=${targetBench}&currency=${currency}&benchmarkCurrency=${benchmarkCurrency}&t=${Date.now()}`;

            if (effectiveMode === 'PORTFOLIO' && selectedAccount) {
                queryParams += `&accountId=${selectedAccount}`;
            }

            if (period) {
                queryParams += `&years=${period}`;
            } else if (startDate && endDate) {
                queryParams += `&startDate=${startDate}&endDate=${endDate}`;
            } else {
                queryParams += `&years=${years}`;
            }

            const res = await api.get(`/investments/analyze/${targetTicker}${queryParams}`);
            console.log("Analyze response for", targetTicker, res.data);

            if (res.data.error) {
                // Portfolio has no data → fallback to benchmark
                if (effectiveMode === 'PORTFOLIO') {
                    setUsingBenchmarkFallback(true);
                    const benchRes = await api.get(`/investments/analyze/${targetBench}?benchmark=${targetBench}&currency=${currency}&benchmarkCurrency=${benchmarkCurrency}&years=${period || years}`);
                    if (!benchRes.data.error) {
                        setData(benchRes.data);
                    } else {
                        setError(benchRes.data.error);
                        setData(null);
                    }
                } else {
                    setError(res.data.error);
                    setData(null);
                }
            } else {
                setData(res.data);
            }
        } catch (err) {
            // Portfolio endpoint may throw 400/404 when empty → try benchmark fallback
            if (mode === 'PORTFOLIO' && !symbol) {
                try {
                    setUsingBenchmarkFallback(true);
                    const bmark = bench || benchmark;
                    const bYears = period || years;
                    const benchRes = await api.get(`/investments/analyze/${bmark}?benchmark=${bmark}&currency=${currency}&benchmarkCurrency=${benchmarkCurrency}&years=${bYears}`);
                    if (!benchRes.data.error) {
                        setData(benchRes.data);
                    } else {
                        setError(benchRes.data.error);
                        setData(null);
                    }
                } catch (e) {
                    setError("No hay datos en tu portfolio ni se pudo cargar el benchmark.");
                    setData(null);
                }
            } else {
                console.error(err);
                setError(err.response?.data?.error || err.message || "No se pudo analizar el ticker. Verifica el símbolo.");
                setData(null);
            }
        } finally {
            setLoading(false);
        }
    };

    const analyzeCustomPortfolio = async () => {
        if (!selectedWeights) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.post('/investments/analyze/custom', {
                weights: selectedWeights,
                benchmark: benchmark,
                years: years,
                currency: currency,
                benchmarkCurrency: benchmarkCurrency
            });
            setData(res.data);
            setTicker('Optimized Portfolio');
            setMode('TICKER'); // Switch to main report view
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || "Failed to analyze custom portfolio");
        } finally {
            setLoading(false);
        }
    };



    const analyzeFinancials = async (overrideTicker = null) => {
        setFinLoading(true);
        setError(null);
        const targetTicker = overrideTicker || ticker;
        try {
            const res = await api.get(`/investments/financials/${targetTicker}?period=${finPeriod}`);
            setFinData(res.data);
            if (overrideTicker) setTicker(overrideTicker);
        } catch (err) {
            console.error(err);
            setError("No se pudo obtener datos financieros.");
        } finally {
            setFinLoading(false);
        }
    };

    const handleFinancialSearch = (newTicker) => {
        analyzeFinancials(newTicker);
    };

    // Re-fetch when period changes if already in Financial mode and has ticker
    useEffect(() => {
        if (mode === 'FINANCIALS' && ticker) {
            analyzeFinancials();
        }
    }, [finPeriod]);

    const testConnection = async () => {
        try {
            const res = await api.get('/health');
            alert(`Conexión Exitosa: ${JSON.stringify(res.data)}`);
        } catch (err) {
            alert(`Error de Conexión: ${err.message}`);
        }
    };

    useEffect(() => {
        const initializeReport = async () => {
            setLoading(true);
            try {
                // 1. Fetch accounts
                const accRes = await api.get('/accounts');
                const assetAccounts = accRes.data.filter(a => a.type === 'ASSET');
                setAccounts(assetAccounts);

                // 2. Check for investment trades to decide initial mode
                const tradesRes = await api.get('/investments/portfolio');
                if (tradesRes.data && tradesRes.data.length > 0) {
                    setMode('PORTFOLIO');
                    // analyzeTicker will be triggered by mode change or manually here if needed
                    // But we'll just let the useEffect handle it.
                } else {
                    // Fallback to SPY vs SPY if no trades
                    analyzeTicker('SPY', 'SPY', 5);
                }
            } catch (err) {
                console.error("Initialization error:", err);
                analyzeTicker('SPY', 'SPY', 5);
            } finally {
                setLoading(false);
            }
        };

        initializeReport();
    }, []);

    const distData = useMemo(() => {
        if (!data || !data.strategyPrices || !data.benchmarkPrices) return null;
        try {
            // 1. Calculate Daily Returns
            const getDailyReturns = (prices) => {
                if (!prices || prices.length < 2) return [];
                return prices.slice(1).map((p, i) => {
                    const prev = prices[i];
                    if (prev === 0) return 0;
                    return ((p - prev) / prev) * 100;
                });
            };

            const stratReturns = getDailyReturns(data.strategyPrices);
            const benchReturns = getDailyReturns(data.benchmarkPrices);

            if (stratReturns.length === 0) return null;

            // 2. Define Bins
            const validStrat = stratReturns.filter(v => Number.isFinite(v));
            let min = Math.floor(Math.min(...validStrat, -3));
            let max = Math.ceil(Math.max(...validStrat, 3));

            if (min < -50) min = -50;
            if (max > 50) max = 50;

            const binStep = 0.5;
            const labels = [];
            for (let i = min; i <= max; i += binStep) {
                labels.push(i);
            }

            // 3. Binning
            const getDist = (returns) => {
                const counts = new Array(labels.length).fill(0);
                returns.forEach(val => {
                    let idx = labels.findIndex(l => val >= l && val < l + binStep);
                    if (idx === -1) {
                        if (val < min) idx = 0;
                        else if (val > max) idx = labels.length - 1;
                    }
                    if (idx !== -1) counts[idx]++;
                });
                return counts;
            };

            const stratDist = getDist(stratReturns);
            const benchDist = getDist(benchReturns);

            // 4. Statistics
            const stratMean = stratReturns.reduce((a, b) => a + b, 0) / stratReturns.length;
            const benchMean = benchReturns.reduce((a, b) => a + b, 0) / benchReturns.length;
            const maxFreq = Math.max(...stratDist) * 1.2;

            // 5. KDE
            const gaussianKernel = (u) => (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * u * u);
            const getKDE = (returns, dist) => {
                const validReturns = returns.filter(v => Number.isFinite(v));
                if (validReturns.length === 0) return new Array(labels.length).fill(0);

                const localMean = validReturns.reduce((a, b) => a + b, 0) / validReturns.length;
                const stdDev = Math.sqrt(validReturns.reduce((a, b) => a + Math.pow(b - localMean, 2), 0) / validReturns.length);

                let bandwidth = 1.06 * stdDev * Math.pow(validReturns.length, -0.2);
                if (bandwidth === 0 || isNaN(bandwidth)) bandwidth = 1;

                return labels.map(x => {
                    let sum = 0;
                    for (let i = 0; i < validReturns.length; i++) {
                        const u = (x - validReturns[i]) / bandwidth;
                        sum += gaussianKernel(u);
                    }
                    return (1 / (validReturns.length * bandwidth)) * sum * validReturns.length * binStep;
                });
            };

            const stratKDE = getKDE(stratReturns, stratDist);
            const benchKDE = getKDE(benchReturns, benchDist);

            return {
                labels,
                stratDist,
                benchDist,
                stratKDE,
                benchKDE,
                stratMean,
                benchMean,
                binStep,
                maxFreq
            };
        } catch (err) {
            console.error("DistData Error:", err);
            return null;
        }
    }, [data]);

    const kde3dData = useMemo(() => {
        if (!optData || !optData.points) return null;

        const points = optData.points;
        const n = points.length;
        if (n === 0) return null;

        // Dynamic Metric Mapping: X = Return, Z = Risk (Vol or DD), Y = Occurrences (Height)
        const returns = points.map(p => p.return * 100);
        const risks = points.map(p => (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100);

        const xMin = Math.min(...returns);
        const xMax = Math.max(...returns);
        const yMin = Math.min(...risks);
        const yMax = Math.max(...risks);

        const resolution = 25; // Balanced for performance and smoothness
        const xStep = (xMax - xMin) / resolution;
        const yStep = (yMax - yMin) / resolution;

        const xCoords = [];
        const yCoords = [];
        for (let i = 0; i <= resolution; i++) {
            xCoords.push(xMin + i * xStep);
            yCoords.push(yMin + i * yStep);
        }

        const meanX = returns.reduce((a, b) => a + b, 0) / n;
        const meanY = risks.reduce((a, b) => a + b, 0) / n;

        // Calculate Average Weights for Expected Value
        const avgWeights = {};
        if (points.length > 0 && optData.tickers) {
            optData.tickers.forEach((ticker, i) => {
                const sum = points.reduce((acc, p) => acc + (p.weights[i] || 0), 0);
                avgWeights[ticker] = sum / n;
            });
        }
        const stdX = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - meanX, 2), 0) / n) || 1;
        const stdY = Math.sqrt(risks.reduce((a, b) => a + Math.pow(b - meanY, 2), 0) / n) || 1;

        const hX = 1.06 * stdX * Math.pow(n, -0.2);
        const hY = 1.06 * stdY * Math.pow(n, -0.2);

        const zData = [];
        const gaussian2D = (dx, dy) => {
            return (1 / (2 * Math.PI * hX * hY)) * Math.exp(-0.5 * (Math.pow(dx / hX, 2) + Math.pow(dy / hY, 2)));
        };

        for (let j = 0; j <= resolution; j++) {
            const row = [];
            const y = yCoords[j];
            for (let i = 0; i <= resolution; i++) {
                const x = xCoords[i];
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += gaussian2D(x - returns[k], y - risks[k]);
                }
                row.push(sum / n);
            }
            zData.push(row);
        }

        return { x: xCoords, y: yCoords, z: zData, meanReturn: meanX, meanRisk: meanY, avgWeights };
    }, [optData, optMetric]);

    const handleSearch = (e) => {
        e.preventDefault();
        if (mode === 'OPTIMIZER') {
            handleOptimize();
            return;
        }
        if (mode === 'FINANCIALS') {
            analyzeFinancials();
            return;
        }
        // Allow empty ticker if in Portfolio mode
        if (mode === 'TICKER' && !ticker) return;
        analyzeTicker();
    };

    const handleExportPDF = async () => {
        const input = document.getElementById('report-container');
        if (!input) return;

        try {
            const canvas = await html2canvas(input, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Quant_Report_${ticker}_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (err) {
            console.error("PDF Export failed", err);
            alert("Could not generate PDF");
        }
    };

    // Reusable grid color function for year boundaries
    const yearBoundaryGridColor = function (context) {
        try {
            const { index, chart } = context;
            const scale = chart.scales.x;
            if (!scale) return 'transparent';
            const ticks = scale.ticks;

            if (index === 0) return 'transparent';

            const currentTick = ticks[index];
            const prevTick = ticks[index - 1];

            if (!currentTick || !prevTick) return 'transparent';

            const getYear = (val) => {
                const lbl = scale.getLabelForValue(val);
                if (typeof lbl === 'string' && lbl.match(/^\d{4}-\d{2}-\d{2}$/)) return lbl.substr(0, 4);
                return lbl;
            };

            if (getYear(currentTick.value) !== getYear(prevTick.value)) {
                return '#9ca3af';
            }
            return 'transparent';
        } catch (e) {
            return 'transparent';
        }
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
            y: {
                grid: {
                    display: true,
                    color: '#f5f5f5',
                    drawBorder: false
                },
                ticks: { callback: (val) => val + '%' }
            },
            x: {
                grid: {
                    display: true,
                    color: yearBoundaryGridColor,
                    drawBorder: false,
                    drawOnChartArea: true,
                    drawTicks: true
                },
                ticks: {
                    maxTicksLimit: 50,
                    autoSkip: false,
                    maxRotation: 0,
                    callback: function (val, index, ticks) {
                        const label = this.getLabelForValue(val);
                        // Date Logic (YYYY-MM-DD -> YYYY)
                        if (typeof label === 'string' && label.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const year = label.substr(0, 4);

                            // Check previous tick to dedupe
                            if (index > 0) {
                                const prevLabel = this.getLabelForValue(ticks[index - 1].value);
                                if (typeof prevLabel === 'string' && prevLabel.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                    const prevYear = prevLabel.substr(0, 4);
                                    if (year === prevYear) return ''; // Hide duplicate year label
                                }
                            }
                            return year;
                        }
                        // Year Logic (YYYY -> YYYY)
                        if (typeof label === 'string' && label.match(/^\d{4}$/)) return label;
                        return label;
                    }
                }
            }
        }
    };

    // Dynamic Chart Labels
    const strategyLabel = mode === 'PORTFOLIO' ? 'Portfolio' :
        (mode === 'TICKER' && data && data.isCustom ? 'Selected Portfolio' : `${ticker} (${currency})`);
    const benchmarkLabel = `${benchmark} (${benchmarkCurrency})`;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif", maxWidth: '1600px', margin: '0 auto', padding: isMobile ? '10px' : '20px', background: '#f8f9fa', minHeight: '100vh', overflowX: 'hidden' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <h1 style={{ margin: 0, fontSize: '28px', color: '#111', fontWeight: '800' }}>Reporte Cuantitativo</h1>
            </div>

            {/* Main Layout Container */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '20px', alignItems: 'flex-start' }}>

                {/* Mobile Toggle Button */}
                {isMobile && (
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        style={{ padding: '12px', background: '#333', color: '#fff', borderRadius: '8px', border: 'none', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: '100%', justifyContent: 'center', fontWeight: 'bold' }}
                    >
                        {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
                        {isSidebarOpen ? 'Ocultar Filtros' : 'Mostrar Filtros'}
                    </button>
                )}

                {/* Sidebar */}
                {(isSidebarOpen || !isMobile) && (
                    <div style={{
                        width: isMobile ? '100%' : '280px',
                        flexShrink: 0,
                        background: 'white',
                        padding: '20px',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        position: isMobile ? 'static' : 'sticky',
                        top: '20px',
                        maxHeight: isMobile ? 'none' : 'calc(100vh - 40px)',
                        overflowY: 'auto'
                    }}>
                        <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* Analysis Mode */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Analysis Mode</label>
                                <select
                                    value={mode === 'TICKER' ? 'PORTFOLIO' : (['PORTFOLIO', 'OPTIMIZER', 'RISK_ANALYSIS'].includes(mode) ? mode : 'PORTFOLIO')}
                                    onChange={(e) => {
                                        const newMode = e.target.value;
                                        setMode(newMode);
                                        // Reset ticker if going back to portfolio
                                        if (newMode === 'PORTFOLIO') setTicker('');
                                    }}
                                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', background: '#f8f9fa', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                                >
                                    <option value="PORTFOLIO">Investment Report</option>
                                    <option value="OPTIMIZER">Portfolio Optimizer</option>
                                    <option value="RISK_ANALYSIS">Risk Analysis Montecarlo</option>
                                </select>
                            </div>

                            {/* Investment Report / Risk Analysis Asset Selector */}
                            {(mode === 'PORTFOLIO' || mode === 'TICKER' || mode === 'RISK_ANALYSIS') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Activo a Analizar</label>
                                    <select
                                        value={mode === 'PORTFOLIO' || (mode === 'RISK_ANALYSIS' && !ticker) ? 'portfolio' : ticker}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            if (val === 'portfolio') {
                                                setMode(mode === 'RISK_ANALYSIS' ? 'RISK_ANALYSIS' : 'PORTFOLIO');
                                                setTicker('');
                                                if (mode === 'RISK_ANALYSIS') setMcSource('portfolio');
                                            } else {
                                                setMode(mode === 'RISK_ANALYSIS' ? 'RISK_ANALYSIS' : 'TICKER');
                                                setTicker(val);
                                                if (mode === 'RISK_ANALYSIS') setMcSource('strategy');
                                            }
                                        }}
                                        style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', background: 'white', fontSize: '14px', cursor: 'pointer' }}
                                    >
                                        <option value="portfolio">Mi Portfolio</option>
                                        {portfolioAssets.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Currency */}
                            {mode !== 'OPTIMIZER' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Currency</label>
                                    <div style={{ display: 'flex', background: '#e1e1e6', borderRadius: '8px', padding: '4px' }}>
                                        <button type="button" onClick={() => setCurrency('USD')}
                                            style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: currency === 'USD' ? 'white' : 'transparent', fontWeight: currency === 'USD' ? 'bold' : 'normal', boxShadow: currency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>USD</button>
                                        <button type="button" onClick={() => setCurrency('EUR')}
                                            style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: currency === 'EUR' ? 'white' : 'transparent', fontWeight: currency === 'EUR' ? 'bold' : 'normal', boxShadow: currency === 'EUR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>EUR</button>
                                    </div>
                                </div>
                            )}

                            {/* Benchmark */}
                            {(mode !== 'RISK_ANALYSIS' && mode !== 'OPTIMIZER') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Benchmark</label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input type="text" value={benchmark} onChange={e => setBenchmark(e.target.value.toUpperCase())} placeholder="SPY" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '14px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div style={{ display: 'flex', background: '#e1e1e6', borderRadius: '8px', padding: '4px', marginTop: '2px' }}>
                                        <button type="button" onClick={() => setBenchmarkCurrency('USD')}
                                            style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: benchmarkCurrency === 'USD' ? 'white' : 'transparent', fontWeight: benchmarkCurrency === 'USD' ? 'bold' : 'normal', boxShadow: benchmarkCurrency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>USD</button>
                                        <button type="button" onClick={() => setBenchmarkCurrency('EUR')}
                                            style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: benchmarkCurrency === 'EUR' ? 'white' : 'transparent', fontWeight: benchmarkCurrency === 'EUR' ? 'bold' : 'normal', boxShadow: benchmarkCurrency === 'EUR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>EUR</button>
                                    </div>
                                </div>
                            )}

                            {/* Optimizer Settings */}
                            {mode === 'OPTIMIZER' && (
                                <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Activos de Optimización</label>
                                        <textarea
                                            value={optTickers}
                                            onChange={e => setOptTickers(e.target.value)}
                                            placeholder="AAPL, MSFT, ..."
                                            rows={4}
                                            style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', resize: 'vertical', fontSize: '14px', boxSizing: 'border-box' }}
                                        />
                                        <span style={{ fontSize: '11px', color: '#666', lineHeight: '1.4' }}>*Los activos de tu portfolio se agregan automáticamente al iniciar. Puedes añadir más separados por coma para comparar.</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Currency</label>
                                        <div style={{ display: 'flex', background: '#e1e1e6', borderRadius: '8px', padding: '4px' }}>
                                            <button type="button" onClick={() => setCurrency('USD')}
                                                style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: currency === 'USD' ? 'white' : 'transparent', fontWeight: currency === 'USD' ? 'bold' : 'normal', boxShadow: currency === 'USD' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>USD</button>
                                            <button type="button" onClick={() => setCurrency('EUR')}
                                                style={{ flex: 1, padding: '6px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', background: currency === 'EUR' ? 'white' : 'transparent', fontWeight: currency === 'EUR' ? 'bold' : 'normal', boxShadow: currency === 'EUR' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>EUR</button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '4px 0' }} />

                            {/* Date Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>From / Desde</label>
                                <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setYears(''); }} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '14px', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>To / Hasta</label>
                                <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setYears(''); }} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', width: '100%', fontSize: '14px', boxSizing: 'border-box' }} />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '13px', color: '#444', fontWeight: '600' }}>Years (Auto-Date)</label>
                                <select value={years} onChange={e => { setYears(e.target.value); setStartDate(''); setEndDate(''); }} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box' }}>
                                    <option value="">Custom</option>
                                    <option value="1">1 Year</option>
                                    <option value="3">3 Years</option>
                                    <option value="5">5 Years</option>
                                    <option value="10">10 Years</option>
                                    <option value="15">15 Years</option>
                                </select>
                            </div>

                            <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', marginTop: '8px' }}>
                                <Search size={18} style={{ marginRight: '6px' }} />
                                {loading || optLoading ? 'Analizando...' : (mode === 'OPTIMIZER' ? 'Optimizar' : 'Run Analysis')}
                            </button>

                            <button type="button" onClick={handleExportPDF} disabled={!data} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', opacity: !data ? 0.5 : 1 }}>
                                <Download size={18} style={{ marginRight: '6px' }} />
                                Export PDF
                            </button>
                        </form>
                    </div>
                )}

                {/* Main Content Area */}
                <div style={{ flex: 1, minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {loading && <div style={{ padding: '40px', textAlign: 'center', color: '#666', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>Analizando datos de mercado...</div>}
                    {error && <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', borderRadius: '12px', marginBottom: '20px' }}>{error}</div>}
                    {usingBenchmarkFallback && data && (
                        <div style={{ padding: '14px 20px', background: '#e3f0ff', color: '#1565c0', borderRadius: '10px', border: '1px solid #90caf9', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px' }}>
                            <span style={{ fontSize: '18px' }}>ℹ️</span>
                            <span>
                                <strong>Tu portfolio no tiene datos registrados.</strong> Mostrando datos del benchmark <strong>{benchmark}</strong> como referencia.
                                Añade inversiones desde la sección "Mis Inversiones" para ver tu portfolio.
                            </span>
                        </div>
                    )}




                    {
                        mode === 'OPTIMIZER' && optData && (
                            <>
                                {/* Tab Selector */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                                    <button onClick={() => setOptTab('efficientFrontier')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: optTab === 'efficientFrontier' ? '#1E88E5' : '#e1e1e6', color: optTab === 'efficientFrontier' ? 'white' : '#333', cursor: 'pointer', fontWeight: optTab === 'efficientFrontier' ? 'bold' : 'normal' }}>
                                        Frontera Eficiente
                                    </button>
                                    <button onClick={() => setOptTab('correlation')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: optTab === 'correlation' ? '#1E88E5' : '#e1e1e6', color: optTab === 'correlation' ? 'white' : '#333', cursor: 'pointer', fontWeight: optTab === 'correlation' ? 'bold' : 'normal' }}>
                                        Matriz de Correlación
                                    </button>
                                    <button onClick={() => setOptTab('walkforward')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: optTab === 'walkforward' ? '#1E88E5' : '#e1e1e6', color: optTab === 'walkforward' ? 'white' : '#333', cursor: 'pointer', fontWeight: optTab === 'walkforward' ? 'bold' : 'normal' }}>
                                        Walkforward Analysis
                                    </button>
                                </div>

                                {optTab === 'efficientFrontier' && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '24px' }}>
                                            {/* Scatter Plot */}
                                            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', height: isMobile ? '400px' : '540px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Efficient Frontier (Monte Carlo)</h3>
                                                    <select
                                                        value={optMetric}
                                                        onChange={(e) => setOptMetric(e.target.value)}
                                                        style={{
                                                            padding: '6px 12px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #ddd',
                                                            fontSize: '14px',
                                                            background: '#fff',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <option value="volatility">Volatility (Risk)</option>
                                                        <option value="maxDrawdown">Avg Drawdown</option>
                                                    </select>
                                                </div>
                                                <div style={{ height: 'calc(100% - 60px)' }}>
                                                    <Scatter
                                                        data={{
                                                            datasets: [
                                                                {
                                                                    label: 'Portfolios',
                                                                    data: optData.points.map(p => ({
                                                                        x: (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100,
                                                                        y: p.return * 100
                                                                    })),
                                                                    backgroundColor: 'rgba(97, 138, 201, 0.5)',
                                                                    pointRadius: 2,
                                                                    order: 4
                                                                },
                                                                {
                                                                    label: optMetric === 'volatility' ? 'Max Sharpe' : 'Max RT/Avg DD',
                                                                    data: [{
                                                                        x: (optMetric === 'volatility' ? optData.bestPortfolio.volatility : Math.abs(optData.maxCalmarPortfolio.maxDrawdown)) * 100,
                                                                        y: (optMetric === 'volatility' ? optData.bestPortfolio.return : optData.maxCalmarPortfolio.return) * 100
                                                                    }],
                                                                    backgroundColor: '#dc2626',
                                                                    pointRadius: 9,
                                                                    pointStyle: 'circle',
                                                                    order: 1
                                                                },
                                                                optMetric === 'volatility' ? {
                                                                    label: 'Min Volatility',
                                                                    data: [{
                                                                        x: optData.minVolPortfolio.volatility * 100,
                                                                        y: optData.minVolPortfolio.return * 100
                                                                    }],
                                                                    backgroundColor: '#fbbf24',
                                                                    pointRadius: 9,
                                                                    pointStyle: 'rectRot',
                                                                    order: 2
                                                                } : null,
                                                                optMetric === 'maxDrawdown' ? {
                                                                    label: 'Min Max DD',
                                                                    data: optData.minDrawdownPortfolio ? [{
                                                                        x: Math.abs(optData.minDrawdownPortfolio.maxDrawdown) * 100,
                                                                        y: optData.minDrawdownPortfolio.return * 100
                                                                    }] : [],
                                                                    backgroundColor: '#fbbf24',
                                                                    pointRadius: 10,
                                                                    pointStyle: 'rectRot',
                                                                    order: 2
                                                                } : null,
                                                                kde3dData ? {
                                                                    label: 'Expected Value',
                                                                    data: [{
                                                                        x: kde3dData.meanRisk,
                                                                        y: kde3dData.meanReturn
                                                                    }],
                                                                    backgroundColor: '#8b5cf6',
                                                                    pointRadius: (hoveredPoint?.type === 'expected' ? 14 : 9),
                                                                    pointStyle: 'circle',
                                                                    borderWidth: (hoveredPoint?.type === 'expected' ? 3 : 0),
                                                                    borderColor: 'white',
                                                                    order: 0
                                                                } : null
                                                            ].filter(Boolean)
                                                        }}
                                                        options={{
                                                            responsive: true,
                                                            maintainAspectRatio: false,
                                                            scales: {
                                                                x: {
                                                                    title: {
                                                                        display: true,
                                                                        text: optMetric === 'volatility' ? 'Volatility (Risk) %' : 'Avg Drawdown %'
                                                                    }
                                                                },
                                                                y: { title: { display: true, text: 'Return (CAGR) %' } }
                                                            },
                                                            plugins: {
                                                                tooltip: {
                                                                    callbacks: {
                                                                        label: (ctx) => {
                                                                            const label = ctx.dataset.label || '';
                                                                            const xValue = ctx.raw.x.toFixed(2);
                                                                            const yValue = ctx.raw.y.toFixed(2);
                                                                            const xLabel = optMetric === 'volatility' ? 'Risk' : 'Avg DD';
                                                                            return `${label === 'Portfolios' ? '' : label + ': '}${xLabel}: ${xValue}% | Ret: ${yValue}%`;
                                                                        }
                                                                    }
                                                                }
                                                            },
                                                            onClick: (e, elements) => {
                                                                if (elements && elements.length > 0) {
                                                                    const { datasetIndex, index } = elements[0];
                                                                    let weights = null;
                                                                    let info = null;

                                                                    if (datasetIndex === 0) {
                                                                        // Portfolios dataset
                                                                        const p = optData.points[index];
                                                                        weights = p.weights;
                                                                        info = {
                                                                            return: p.return * 100,
                                                                            risk: (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100,
                                                                            label: 'Custom Selection'
                                                                        };
                                                                    } else if (datasetIndex === 1) {
                                                                        // Max Sharpe/RT
                                                                        const p = optMetric === 'volatility' ? optData.bestPortfolio : optData.maxCalmarPortfolio;
                                                                        weights = p.weights;
                                                                        info = {
                                                                            return: p.return * 100,
                                                                            risk: (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100,
                                                                            label: optMetric === 'volatility' ? 'Max Sharpe' : 'Max RT/Avg DD'
                                                                        };
                                                                    } else if (datasetIndex === 2) {
                                                                        // Min Vol/DD
                                                                        const p = optMetric === 'volatility' ? optData.minVolPortfolio : optData.minDrawdownPortfolio;
                                                                        weights = p.weights;
                                                                        info = {
                                                                            return: p.return * 100,
                                                                            risk: (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100,
                                                                            label: optMetric === 'volatility' ? 'Min Volatility' : 'Min Max DD'
                                                                        };
                                                                    } else if (datasetIndex === 3 && kde3dData) {
                                                                        // Expected Value
                                                                        weights = optData.tickers.map(t => kde3dData.avgWeights[t] || 0);
                                                                        info = {
                                                                            return: kde3dData.meanReturn,
                                                                            risk: kde3dData.meanRisk,
                                                                            label: 'Expected Value'
                                                                        };
                                                                    }

                                                                    if (weights) {
                                                                        // weights can be an array or an object
                                                                        const weightsObj = Array.isArray(weights)
                                                                            ? optData.tickers.reduce((acc, t, i) => ({ ...acc, [t]: weights[i] }), {})
                                                                            : weights;
                                                                        setSelectedWeights(weightsObj);
                                                                        setSelectedPortfolioInfo(info);
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Results Table */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                                {/* Selected Portfolio Card */}
                                                {selectedPortfolioInfo && (
                                                    <div style={{ background: '#f0f4ff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(30, 136, 229, 0.2)', border: '2px solid #1E88E5' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold', color: '#1E88E5' }}>{selectedPortfolioInfo.label}</h3>
                                                            <button
                                                                onClick={analyzeCustomPortfolio}
                                                                className="btn"
                                                                style={{ padding: '6px 12px', fontSize: '12px' }}
                                                            >
                                                                Apply to Report
                                                            </button>
                                                        </div>
                                                        <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                                                            <strong>Ret:</strong> {selectedPortfolioInfo.return.toFixed(2)}% |
                                                            <strong> {optMetric === 'volatility' ? 'Vol' : 'Avg DD'}:</strong> {selectedPortfolioInfo.risk.toFixed(2)}%
                                                        </div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid #c0d1eb' }}><th style={{ textAlign: 'left', padding: '4px' }}>Ticker</th><th style={{ textAlign: 'right', padding: '4px' }}>Weight</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {Object.entries(selectedWeights).sort(([, a], [, b]) => b - a).map(([k, v]) => (
                                                                    <tr key={k}>
                                                                        <td style={{ padding: '4px' }}>{k}</td>
                                                                        <td style={{ padding: '4px', textAlign: 'right' }}>{(v * 100).toFixed(1)}%</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* Optimization Target Card */}
                                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#dc2626' }}>
                                                        {optMetric === 'volatility' ? 'Max Sharpe Ratio' : 'Max RT/Avg DD'}
                                                    </h3>
                                                    <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                                                        {(() => {
                                                            const p = optMetric === 'volatility' ? optData.bestPortfolio : optData.maxCalmarPortfolio;
                                                            const metricLabel = optMetric === 'volatility' ? 'Sharpe' : 'RT/Avg DD';
                                                            const metricValue = optMetric === 'volatility' ? p.sharpe : (p.return / Math.abs(p.avgDrawdown || p.maxDrawdown || 0.001));
                                                            return (
                                                                <>
                                                                    <strong>Ret:</strong> {(p.return * 100).toFixed(2)}% |
                                                                    <strong> {optMetric === 'volatility' ? 'Vol' : 'Avg DD'}:</strong> {((optMetric === 'volatility' ? p.volatility : Math.abs(p.avgDrawdown || p.maxDrawdown)) * 100).toFixed(2)}% |
                                                                    <strong> {metricLabel}:</strong> {metricValue.toFixed(2)}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '1px solid #eee' }}><th style={{ textAlign: 'left', padding: '4px' }}>Ticker</th><th style={{ textAlign: 'right', padding: '4px' }}>Weight</th></tr>
                                                        </thead>
                                                        <tbody>
                                                            {Object.entries((optMetric === 'volatility' ? optData.bestPortfolio : optData.maxCalmarPortfolio).weights).sort(([, a], [, b]) => b - a).map(([k, v]) => (
                                                                <tr key={k}>
                                                                    <td style={{ padding: '4px' }}>{k}</td>
                                                                    <td style={{ padding: '4px', textAlign: 'right' }}>{(v * 100).toFixed(1)}%</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Secondary Optimal Portfolio Card (Min Vol or Min DD) */}
                                                {(() => {
                                                    const targetPort = optMetric === 'volatility' ? optData.minVolPortfolio : optData.minDrawdownPortfolio;
                                                    if (!targetPort) return null;
                                                    const title = optMetric === 'volatility' ? 'Minimum Volatility' : 'Minimum Max Drawdown';
                                                    const color = '#fbbf24';

                                                    return (
                                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: color }}>{title}</h3>
                                                            <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                                                                <strong>Ret:</strong> {(targetPort.return * 100).toFixed(2)}% |
                                                                <strong> {optMetric === 'volatility' ? 'Vol' : 'Max DD'}:</strong> {((optMetric === 'volatility' ? (targetPort.volatility || 0) : Math.abs(targetPort.maxDrawdown || 0)) * 100).toFixed(2)}%
                                                            </div>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                                <thead>
                                                                    <tr style={{ borderBottom: '1px solid #eee' }}><th style={{ textAlign: 'left', padding: '4px' }}>Ticker</th><th style={{ textAlign: 'right', padding: '4px' }}>Weight</th></tr>
                                                                </thead>
                                                                <tbody>
                                                                    {Object.entries(targetPort.weights).sort(([, a], [, b]) => b - a).map(([k, v]) => (
                                                                        <tr key={k}>
                                                                            <td style={{ padding: '4px' }}>{k}</td>
                                                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(v * 100).toFixed(1)}%</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    );
                                                })()}
                                                {/* Expected Value Card */}
                                                {kde3dData && (
                                                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                                        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#8b5cf6' }}>Expected Value (Mean)</h3>
                                                        <div style={{ marginBottom: '12px', fontSize: '14px' }}>
                                                            <strong>Ret:</strong> {kde3dData.meanReturn.toFixed(2)}% |
                                                            <strong> {optMetric === 'volatility' ? 'Vol' : 'Max DD'}:</strong> {kde3dData.meanRisk.toFixed(2)}%
                                                        </div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid #eee' }}><th style={{ textAlign: 'left', padding: '4px' }}>Ticker</th><th style={{ textAlign: 'right', padding: '4px' }}>Weight</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {Object.entries(kde3dData.avgWeights).sort(([, a], [, b]) => b - a).map(([k, v]) => (
                                                                    <tr key={k}>
                                                                        <td style={{ padding: '4px' }}>{k}</td>
                                                                        <td style={{ padding: '4px', textAlign: 'right' }}>{(v * 100).toFixed(1)}%</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {kde3dData && (
                                            <div style={{ marginTop: '24px', background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', height: isMobile ? '500px' : '850px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Distribución de Portafolios (3D KDE)</h3>
                                                    <div style={{ fontSize: '12px', color: '#666' }}>
                                                        Eje X: Retorno | Eje Z: {optMetric === 'volatility' ? 'Volatilidad' : 'Max Drawdown'} | Eje Y: Ocurrencias
                                                    </div>
                                                </div>
                                                <div style={{ height: 'calc(100% - 60px)' }}>
                                                    <Plot
                                                        data={[
                                                            {
                                                                z: kde3dData.z,
                                                                x: kde3dData.x,
                                                                y: kde3dData.y,
                                                                type: 'surface',
                                                                colorscale: 'Portland',
                                                                showscale: true,
                                                                colorbar: { title: 'Densidad', thickness: 15, len: 0.5 },
                                                                lighting: { ambient: 0.6, diffuse: 0.8, specular: 0.2, roughness: 0.5 },
                                                                name: 'Distribución KDE',
                                                                hovertemplate: 'Ret: %{x:.2f}%<br>Risk: %{y:.2f}%<br>Dens: %{z:.4f}<extra></extra>'
                                                            },
                                                            {
                                                                // Expected Value Vertical Line (Pole)
                                                                x: [kde3dData.meanReturn, kde3dData.meanReturn],
                                                                y: [kde3dData.meanRisk, kde3dData.meanRisk],
                                                                z: [0, (() => {
                                                                    const returns = optData.points.map(p => p.return * 100);
                                                                    const risks = optData.points.map(p => (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100);
                                                                    const n = returns.length;
                                                                    const stdX = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - kde3dData.meanReturn, 2), 0) / n) || 1;
                                                                    const stdY = Math.sqrt(risks.reduce((a, b) => a + Math.pow(b - kde3dData.meanRisk, 2), 0) / n) || 1;
                                                                    const hX = 1.06 * stdX * Math.pow(n, -0.2);
                                                                    const hY = 1.06 * stdY * Math.pow(n, -0.2);
                                                                    let sum = 0;
                                                                    const g2 = (dx, dy) => (1 / (2 * Math.PI * hX * hY)) * Math.exp(-0.5 * (Math.pow(dx / hX, 2) + Math.pow(dy / hY, 2)));
                                                                    for (let k = 0; k < n; k++) sum += g2(kde3dData.meanReturn - returns[k], kde3dData.meanRisk - risks[k]);
                                                                    return (sum / n) * 1.5;
                                                                })()],
                                                                mode: 'lines',
                                                                type: 'scatter3d',
                                                                line: { color: '#8b5cf6', width: 6 },
                                                                name: 'Expected Value'
                                                            },
                                                            {
                                                                x: [(optMetric === 'volatility' ? optData.bestPortfolio.return : optData.maxCalmarPortfolio.return) * 100],
                                                                y: [(optMetric === 'volatility' ? optData.bestPortfolio.volatility : Math.abs(optData.maxCalmarPortfolio.maxDrawdown)) * 100],
                                                                z: [(() => {
                                                                    const returns = optData.points.map(p => p.return * 100);
                                                                    const risks = optData.points.map(p => (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100);
                                                                    const n = returns.length;
                                                                    const meanX = returns.reduce((a, b) => a + b, 0) / n;
                                                                    const meanY = risks.reduce((a, b) => a + b, 0) / n;
                                                                    const stdX = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - meanX, 2), 0) / n) || 1;
                                                                    const stdY = Math.sqrt(risks.reduce((a, b) => a + Math.pow(b - meanY, 2), 0) / n) || 1;
                                                                    const hX = 1.06 * stdX * Math.pow(n, -0.2);
                                                                    const hY = 1.06 * stdY * Math.pow(n, -0.2);
                                                                    let sum = 0;
                                                                    const g2 = (dx, dy) => (1 / (2 * Math.PI * hX * hY)) * Math.exp(-0.5 * (Math.pow(dx / hX, 2) + Math.pow(dy / hY, 2)));
                                                                    const targetP = optMetric === 'volatility' ? optData.bestPortfolio : optData.maxCalmarPortfolio;
                                                                    const targetX = targetP.return * 100;
                                                                    const targetY = (optMetric === 'volatility' ? targetP.volatility : Math.abs(targetP.maxDrawdown)) * 100;
                                                                    for (let k = 0; k < n; k++) sum += g2(targetX - returns[k], targetY - risks[k]);
                                                                    return (sum / n) * 1.1;
                                                                })()],
                                                                mode: 'markers',
                                                                type: 'scatter3d',
                                                                marker: { color: '#dc2626', size: 10, symbol: 'diamond', line: { color: 'white', width: 2 } },
                                                                name: optMetric === 'volatility' ? 'Max Sharpe' : 'Max RT/Avg DD'
                                                            },
                                                            (() => {
                                                                const targetPort = optMetric === 'volatility' ? optData.minVolPortfolio : optData.minDrawdownPortfolio;
                                                                if (!targetPort) return null;
                                                                return {
                                                                    x: [targetPort.return * 100],
                                                                    y: [(optMetric === 'volatility' ? targetPort.volatility : Math.abs(targetPort.maxDrawdown)) * 100],
                                                                    z: [(() => {
                                                                        const returns = optData.points.map(p => p.return * 100);
                                                                        const risks = optData.points.map(p => (optMetric === 'volatility' ? p.volatility : Math.abs(p.maxDrawdown)) * 100);
                                                                        const n = returns.length;
                                                                        const meanX = returns.reduce((a, b) => a + b, 0) / n;
                                                                        const meanY = risks.reduce((a, b) => a + b, 0) / n;
                                                                        const stdX = Math.sqrt(returns.reduce((a, b) => a + Math.pow(b - meanX, 2), 0) / n) || 1;
                                                                        const stdY = Math.sqrt(risks.reduce((a, b) => a + Math.pow(b - meanY, 2), 0) / n) || 1;
                                                                        const hX = 1.06 * stdX * Math.pow(n, -0.2);
                                                                        const hY = 1.06 * stdY * Math.pow(n, -0.2);
                                                                        let sum = 0;
                                                                        const g2 = (dx, dy) => (1 / (2 * Math.PI * hX * hY)) * Math.exp(-0.5 * (Math.pow(dx / hX, 2) + Math.pow(dy / hY, 2)));
                                                                        const tX = targetPort.return * 100;
                                                                        const tY = (optMetric === 'volatility' ? targetPort.volatility : Math.abs(targetPort.maxDrawdown)) * 100;
                                                                        for (let k = 0; k < n; k++) sum += g2(tX - returns[k], tY - risks[k]);
                                                                        return (sum / n) * 1.1;
                                                                    })()],
                                                                    mode: 'markers',
                                                                    type: 'scatter3d',
                                                                    marker: { color: '#fbbf24', size: 10, symbol: 'square', line: { color: 'white', width: 2 } },
                                                                    name: optMetric === 'volatility' ? 'Min Volatility' : 'Min Avg Drawdown'
                                                                };
                                                            })()
                                                        ].filter(Boolean)}
                                                        layout={{
                                                            autosize: true,
                                                            margin: { l: 0, r: 0, b: 0, t: 40 },
                                                            paper_bgcolor: 'rgba(0,0,0,0)',
                                                            plot_bgcolor: 'rgba(0,0,0,0)',
                                                            scene: {
                                                                xaxis: { title: 'Retorno %', gridcolor: '#eee' },
                                                                yaxis: { title: (optMetric === 'volatility' ? 'Volatilidad' : 'Avg Drawdown') + ' %', gridcolor: '#eee' },
                                                                zaxis: { title: 'Densidad', gridcolor: '#eee' },
                                                                camera: { eye: { x: 1.8, y: 1.8, z: 1.2 } },
                                                                backgroundColor: 'white'
                                                            },
                                                            legend: { orientation: 'h', y: 1.1 }
                                                        }}
                                                        style={{ width: "100%", height: "100%" }}
                                                        config={{ responsive: true, displayModeBar: true, displaylogo: false }}
                                                        onHover={(event) => {
                                                            const p = event.points[0];
                                                            if (p.fullData.name === 'Expected Value') {
                                                                setHoveredPoint({ type: 'expected' });
                                                            }
                                                        }}
                                                        onUnhover={() => setHoveredPoint(null)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {optTab === 'correlation' && (
                                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Matriz de Correlación</h3>
                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                <select
                                                    value={correlationPeriod}
                                                    onChange={(e) => setCorrelationPeriod(e.target.value)}
                                                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', background: '#f8f9fa' }}
                                                >
                                                    <option value="daily">Diaria</option>
                                                    <option value="monthly">Mensual</option>
                                                    <option value="annual">Anual</option>
                                                </select>
                                                <select
                                                    value={correlationType}
                                                    onChange={(e) => setCorrelationType(e.target.value)}
                                                    style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', background: '#f8f9fa' }}
                                                >
                                                    <option value="returns">Retornos</option>
                                                    <option value="drawdowns">Drawdowns</option>
                                                </select>
                                            </div>
                                        </div>
                                        {correlationLoading ? <p>Cargando matriz...</p> : correlationData ? (
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '14px' }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ padding: '8px', borderBottom: '2px solid #ddd' }}></th>
                                                            {correlationData.tickers.map(t => <th key={t} style={{ padding: '8px', borderBottom: '2px solid #ddd' }}>{t}</th>)}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {correlationData.tickers.map((t1, i) => (
                                                            <tr key={t1}>
                                                                <td style={{ padding: '8px', borderBottom: '1px solid #eee', fontWeight: 'bold', textAlign: 'left' }}>{t1}</td>
                                                                {correlationData.tickers.map((t2, j) => {
                                                                    const val = correlationData.matrix[i][j];
                                                                    // Green (negative corr) → White (no corr) → Red (positive corr)
                                                                    let color, textColor;
                                                                    if (i === j) {
                                                                        color = '#4caf50'; textColor = 'white'; // diagonal = perfect 1.0 = dark green
                                                                    } else if (val > 0) {
                                                                        const intensity = Math.min(val, 1);
                                                                        const r = Math.round(255);
                                                                        const g = Math.round(255 - 180 * intensity);
                                                                        const b = Math.round(255 - 180 * intensity);
                                                                        color = `rgb(${r},${g},${b})`;
                                                                        textColor = intensity > 0.5 ? 'white' : '#333';
                                                                    } else {
                                                                        const intensity = Math.min(Math.abs(val), 1);
                                                                        const r = Math.round(255 - 180 * intensity);
                                                                        const g = Math.round(255);
                                                                        const b = Math.round(255 - 180 * intensity);
                                                                        color = `rgb(${r},${g},${b})`;
                                                                        textColor = intensity > 0.5 ? 'white' : '#333';
                                                                    }
                                                                    return (
                                                                        <td key={t2} style={{ padding: '8px', borderBottom: '1px solid #eee', color: textColor, background: color }}>
                                                                            {val.toFixed(2)}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : <p>No hay datos de correlación disponibles. Ejecute la optimización primero.</p>}
                                    </div>
                                )}

                                {optTab === 'walkforward' && (
                                    <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Walkforward Analysis</h3>
                                        </div>
                                        {walkforwardLoading ? <p>Cargando análisis walkforward...</p> : walkforwardData ? (
                                            <div>
                                                <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>Simula una estrategia que se rebalancea periódicamente (rebalanceo mensual) usando los pesos de la optimización (Max Sharpe).</p>
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                                                    <div style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}>
                                                        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Retorno Total</div>
                                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: walkforwardData.metrics?.portfolioReturn >= 0 ? '#10b981' : '#ef4444' }}>
                                                            {((walkforwardData.metrics?.portfolioReturn || 0) * 100).toFixed(2)}%
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}>
                                                        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Max Drawdown</div>
                                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>
                                                            {((walkforwardData.metrics?.portfolioMaxDrawdown || 0) * 100).toFixed(2)}%
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '16px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #eee' }}>
                                                        <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Benchmark Retorno</div>
                                                        <div style={{ fontSize: '20px', fontWeight: 'bold', color: walkforwardData.metrics?.benchmarkReturn >= 0 ? '#10b981' : '#ef4444' }}>
                                                            {((walkforwardData.metrics?.benchmarkReturn || 0) * 100).toFixed(2)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ height: isMobile ? '280px' : '380px', width: '100%' }}>
                                                    <Line
                                                        data={{
                                                            labels: walkforwardData.dates || [],
                                                            datasets: [
                                                                {
                                                                    label: 'Portfolio (Walkforward)',
                                                                    data: walkforwardData.portfolioEquity || [],
                                                                    borderColor: '#1e88e5',
                                                                    backgroundColor: 'rgba(30, 136, 229, 0.1)',
                                                                    fill: true,
                                                                    borderWidth: 2,
                                                                    pointRadius: 0
                                                                },
                                                                {
                                                                    label: 'Benchmark',
                                                                    data: walkforwardData.benchmarkEquity || [],
                                                                    borderColor: '#fbbf24',
                                                                    backgroundColor: 'transparent',
                                                                    fill: false,
                                                                    borderWidth: 2,
                                                                    pointRadius: 0
                                                                }
                                                            ]
                                                        }}
                                                        options={{
                                                            responsive: true,
                                                            maintainAspectRatio: false,
                                                            plugins: {
                                                                legend: { display: true, position: 'top' },
                                                                tooltip: { mode: 'index', intersect: false }
                                                            },
                                                            scales: {
                                                                x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
                                                                y: { grid: { color: '#f5f5f5' }, title: { display: true, text: 'Capital (€)' } }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ padding: '24px', background: '#f0f4ff', borderRadius: '10px', border: '1px solid #c7d7f8', color: '#334' }}>
                                                <h4 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#1e3a8a' }}>⚠️ Sin datos de Walkforward</h4>
                                                <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6' }}>
                                                    El análisis Walkforward simula rebalanceos periódicos usando los pesos del portfolio óptimo (Max Sharpe).
                                                    Para generar estos datos, primero debe ejecutar la optimización haciendo clic en el botón <strong>"Optimizar"</strong> del sidebar.
                                                    Una vez completada la optimización, los datos de Walkforward se cargarán automáticamente.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )
                    }

                    {
                        mode === 'RISK_ANALYSIS' && (
                            <div style={{}}>
                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
                                    <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>
                                        Monte Carlo Simulation
                                    </h2>
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <label style={{ fontSize: '12px', color: '#666' }}>Fuente de Datos</label>
                                            <select
                                                value={mcSource}
                                                onChange={(e) => setMcSource(e.target.value)}
                                                style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', background: '#f8f9fa' }}
                                            >
                                                <option value="strategy">{ticker ? ticker : 'Mi Portfolio'}</option>
                                                {!ticker && portfolioAssets.length === 0 && <option value="benchmark">{benchmark || 'Benchmark'}</option>}
                                                {portfolioAssets.length > 0 && <option value="portfolio">Mi Portfolio (Completo)</option>}
                                                <option value="benchmark">{benchmark || 'Benchmark'}</option>
                                                {optData && <option value="optimizer">Optimizer Portfolio</option>}
                                            </select>
                                        </div>
                                        {mcSource === 'optimizer' && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <label style={{ fontSize: '12px', color: '#666' }}>Tipo de Optimizer</label>
                                                <select
                                                    value={optimizerPortfolio}
                                                    onChange={(e) => setOptimizerPortfolio(e.target.value)}
                                                    style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', background: '#f8f9fa' }}
                                                >
                                                    <option value="maxSharpe">Max Sharpe Ratio</option>
                                                    <option value="minVol">Min Volatility</option>
                                                    <option value="minDrawdown">Min Max Drawdown</option>
                                                    {kde3dData && <option value="expectedValue">Expected Value (Mean)</option>}
                                                </select>
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <label style={{ fontSize: '12px', color: '#666' }}>Simulaciones</label>
                                            <input
                                                type="number"
                                                value={mcSimulations}
                                                onChange={e => setMcSimulations(Math.min(500, Math.max(10, parseInt(e.target.value))))}
                                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid #ddd', width: '100px' }}
                                            />
                                        </div>
                                        <button
                                            onClick={runMonteCarlo}
                                            disabled={mcLoading}
                                            style={{
                                                padding: '8px 24px', background: '#1E88E5', color: 'white', borderRadius: '6px', border: 'none',
                                                cursor: 'pointer', opacity: mcLoading ? 0.7 : 1, alignSelf: 'flex-end'
                                            }}>
                                            {mcLoading ? 'Running...' : 'Run Simulation'}
                                        </button>
                                    </div>

                                    {mcData && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                            {/* Paths Chart */}
                                            <div style={{ height: isMobile ? '300px' : '400px' }}>
                                                <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Simulated Return Paths ({mcData.paths.length} runs)</h3>
                                                <Line
                                                    data={{
                                                        labels: mcData.labels,
                                                        datasets: [
                                                            ...mcData.paths.map((p, i) => ({
                                                                label: `Sim ${i}`,
                                                                data: p,
                                                                borderColor: hoveredPath !== null
                                                                    ? (hoveredPath === i ? `hsla(${i * 137.5 % 360}, 70%, 50%, 1.0)` : 'rgba(200, 200, 200, 0.05)')
                                                                    : `hsla(${i * 137.5 % 360}, 70%, 50%, 0.4)`,
                                                                borderWidth: hoveredPath === i ? 4 : 1,
                                                                pointRadius: 0,
                                                                fill: false,
                                                                order: hoveredPath === i ? -2 : 0
                                                            })),
                                                            {
                                                                label: 'Original Path (Actual)',
                                                                data: mcData.originalPath,
                                                                borderColor: '#dc2626', // Red
                                                                borderWidth: 3,
                                                                pointRadius: 0,
                                                                order: -1
                                                            }
                                                        ]
                                                    }}
                                                    options={{
                                                        ...chartOptions,
                                                        plugins: { legend: { display: false } }, // Hide legend as it would be huge
                                                        scales: {
                                                            y: {
                                                                title: { display: true, text: 'Cumulative Return %' },
                                                                grid: { display: false }
                                                            },
                                                            x: {
                                                                ...chartOptions.scales.x,
                                                                display: true,
                                                                grid: { display: false }
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '24px' }}>
                                                {/* Charts on the left */}
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px' }}>
                                                    {/* Distribution (PDF) */}
                                                    <div style={{ height: isMobile ? '300px' : '450px' }}>
                                                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Terminal Value Distribution (KDE)</h3>
                                                        <Line
                                                            data={{
                                                                datasets: [{
                                                                    label: 'Density',
                                                                    data: mcData.kdeData,
                                                                    borderColor: '#1E88E5',
                                                                    backgroundColor: 'rgba(30, 136, 229, 0.2)',
                                                                    fill: true,
                                                                    pointRadius: 0,
                                                                    borderWidth: 2,
                                                                    tension: 0.4
                                                                }]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                maintainAspectRatio: false,
                                                                layout: {
                                                                    padding: { bottom: 40, left: 10, right: 10, top: 10 }
                                                                },
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false,
                                                                },
                                                                scales: {
                                                                    y: {
                                                                        title: { display: true, text: 'Density' },
                                                                        grid: { display: false },
                                                                        beginAtZero: true
                                                                    },
                                                                    x: {
                                                                        type: 'linear',
                                                                        title: { display: true, text: 'Return %' },
                                                                        grid: { display: false }
                                                                    }
                                                                },
                                                                plugins: {
                                                                    annotation: {
                                                                        annotations: {
                                                                            expectedLine: {
                                                                                type: 'line',
                                                                                xMin: mcData.meanReturn,
                                                                                xMax: mcData.meanReturn,
                                                                                borderColor: '#ef4444',
                                                                                borderWidth: 2,
                                                                                borderDash: [6, 6],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `Exp: ${mcData.meanReturn.toFixed(1)}%`,
                                                                                    position: 'start',
                                                                                    yAdjust: -20,
                                                                                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                                                                    color: 'white',
                                                                                    font: { size: 10, weight: 'bold' }
                                                                                }
                                                                            },
                                                                            actualLine: {
                                                                                type: 'line',
                                                                                xMin: mcData.originalReturn,
                                                                                xMax: mcData.originalReturn,
                                                                                borderColor: '#000000',
                                                                                borderWidth: 2,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `Actual: ${mcData.originalReturn.toFixed(1)}%`,
                                                                                    position: 'end',
                                                                                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                                                                    color: 'white',
                                                                                    font: { size: 10, weight: 'bold' }
                                                                                }
                                                                            },
                                                                            hoverPointX: hoveredQuantileType === 'returns' && hoveredQuantileVal !== null ? {
                                                                                type: 'line',
                                                                                xMin: hoveredQuantileVal,
                                                                                xMax: hoveredQuantileVal,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 3,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileVal.toFixed(1)}%`,
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null,
                                                                            hoverPointY: hoveredQuantileType === 'returns' && hoveredQuantileY?.kde !== undefined ? {
                                                                                type: 'line',
                                                                                yMin: hoveredQuantileY.kde,
                                                                                yMax: hoveredQuantileY.kde,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 2,
                                                                                borderDash: [4, 4],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: hoveredQuantileY.kde.toFixed(4),
                                                                                    position: 'start',
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null
                                                                        }
                                                                    },
                                                                    tooltip: {
                                                                        callbacks: {
                                                                            label: (context) => `Density: ${context.parsed.y.toFixed(4)}`
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Cumulative Probability (CDF) */}
                                                    <div style={{ height: isMobile ? '300px' : '450px' }}>
                                                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Cumulative Probability (CDF)</h3>
                                                        <Line
                                                            data={{
                                                                datasets: [{
                                                                    label: 'Probability <= X',
                                                                    data: mcData.cdfData,
                                                                    borderColor: '#3b82f6',
                                                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                                                    fill: true,
                                                                    pointRadius: 0,
                                                                    borderWidth: 2
                                                                }]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false
                                                                },
                                                                layout: {
                                                                    padding: { bottom: 40, left: 10, right: 10, top: 10 }
                                                                },
                                                                scales: {
                                                                    x: {
                                                                        type: 'linear',
                                                                        title: { display: true, text: 'Return %' },
                                                                        grid: { display: false }
                                                                    },
                                                                    y: {
                                                                        title: { display: true, text: 'Probability %' },
                                                                        max: 100,
                                                                        grid: { display: false }
                                                                    }
                                                                },
                                                                plugins: {
                                                                    annotation: {
                                                                        annotations: {
                                                                            hoverPointX: hoveredQuantileType === 'returns' && hoveredQuantileVal !== null ? {
                                                                                type: 'line',
                                                                                xMin: hoveredQuantileVal,
                                                                                xMax: hoveredQuantileVal,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 3,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileVal.toFixed(1)}%`,
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null,
                                                                            hoverPointY: hoveredQuantileType === 'returns' && hoveredQuantileY?.cdf !== undefined ? {
                                                                                type: 'line',
                                                                                yMin: hoveredQuantileY.cdf,
                                                                                yMax: hoveredQuantileY.cdf,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 2,
                                                                                borderDash: [4, 4],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileY.cdf.toFixed(1)}%`,
                                                                                    position: 'start',
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null
                                                                        }
                                                                    },
                                                                    tooltip: {
                                                                        callbacks: {
                                                                            label: (ctx) => `Prob: ${ctx.raw.y.toFixed(1)}% of return <= ${ctx.raw.x.toFixed(1)}%`
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Table on the right */}
                                                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #eee' }}>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#333' }}>Returns Analysis (Quantiles)</h3>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                                                                <th style={{ textAlign: 'left', padding: '8px' }}>Quantile</th>
                                                                <th style={{ textAlign: 'right', padding: '8px' }}>Expected Return</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {[5, 25, 50, 75, 95].map(q => (
                                                                <tr key={q}
                                                                    onMouseEnter={() => {
                                                                        setHoveredPath(mcData.quantiles.returns[q].idx);
                                                                        setHoveredQuantileVal(mcData.quantiles.returns[q].val);
                                                                        setHoveredQuantileY({ kde: mcData.quantiles.returns[q].yKde, cdf: mcData.quantiles.returns[q].yCdf });
                                                                        setHoveredQuantileType('returns');
                                                                    }}
                                                                    onMouseLeave={() => {
                                                                        setHoveredPath(null);
                                                                        setHoveredQuantileVal(null);
                                                                        setHoveredQuantileY(null);
                                                                        setHoveredQuantileType(null);
                                                                    }}
                                                                    style={{
                                                                        borderBottom: '1px solid #eee',
                                                                        background: q === 95 ? '#eef2ff' : 'transparent',
                                                                        fontWeight: q === 95 ? 'bold' : 'normal',
                                                                        cursor: 'pointer',
                                                                        transition: 'background 0.2s'
                                                                    }}>
                                                                    <td style={{ padding: '8px' }}>{q}% {q === 95 ? '(95% Confidence)' : ''}</td>
                                                                    <td style={{ textAlign: 'right', padding: '8px', color: '#333' }}>
                                                                        {mcData.quantiles.returns[q].val.toFixed(2)}%
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            <tr style={{ borderTop: '2px solid #dee2e6', fontWeight: 'bold', background: '#eef2ff' }}>
                                                                <td style={{ padding: '8px' }}>Esperanza Matematica (Mean)</td>
                                                                <td style={{ textAlign: 'right', padding: '8px', color: '#333' }}>
                                                                    {mcData.meanReturn.toFixed(2)}%
                                                                </td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '24px', marginTop: '24px' }}>
                                                {/* Charts on the left */}
                                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '24px' }}>
                                                    {/* Max Drawdown Distribution (KDE) */}
                                                    <div style={{ height: isMobile ? '300px' : '450px' }}>
                                                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Max Drawdown Distribution (KDE)</h3>
                                                        <Line
                                                            data={{
                                                                datasets: [{
                                                                    label: 'DD Density',
                                                                    data: mcData.kdeDrawdown,
                                                                    borderColor: '#ef4444',
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                                    fill: true,
                                                                    pointRadius: 0,
                                                                    borderWidth: 2,
                                                                    tension: 0.4
                                                                }]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                maintainAspectRatio: false,
                                                                layout: {
                                                                    padding: { bottom: 40, left: 10, right: 10, top: 10 }
                                                                },
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false,
                                                                },
                                                                scales: {
                                                                    y: {
                                                                        title: { display: true, text: 'Density' },
                                                                        grid: { display: false },
                                                                        beginAtZero: true
                                                                    },
                                                                    x: {
                                                                        type: 'linear',
                                                                        title: { display: true, text: 'Max Drawdown %' },
                                                                        grid: { display: false }
                                                                    }
                                                                },
                                                                plugins: {
                                                                    annotation: {
                                                                        annotations: {
                                                                            expectedLine: {
                                                                                type: 'line',
                                                                                xMin: mcData.meanDrawdown,
                                                                                xMax: mcData.meanDrawdown,
                                                                                borderColor: '#ef4444',
                                                                                borderWidth: 2,
                                                                                borderDash: [6, 6],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `Exp: ${mcData.meanDrawdown.toFixed(1)}%`,
                                                                                    position: 'start',
                                                                                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                                                                    color: 'white',
                                                                                    font: { size: 10, weight: 'bold' }
                                                                                }
                                                                            },
                                                                            actualLine: {
                                                                                type: 'line',
                                                                                xMin: mcData.originalMaxDD,
                                                                                xMax: mcData.originalMaxDD,
                                                                                borderColor: '#000000',
                                                                                borderWidth: 2,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `Actual: ${mcData.originalMaxDD.toFixed(1)}%`,
                                                                                    position: 'end',
                                                                                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                                                                                    color: 'white',
                                                                                    font: { size: 10, weight: 'bold' }
                                                                                }
                                                                            },
                                                                            hoverPointX: hoveredQuantileType === 'drawdown' && hoveredQuantileVal !== null ? {
                                                                                type: 'line',
                                                                                xMin: hoveredQuantileVal,
                                                                                xMax: hoveredQuantileVal,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 3,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileVal.toFixed(1)}%`,
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null,
                                                                            hoverPointY: hoveredQuantileType === 'drawdown' && hoveredQuantileY?.kde !== undefined ? {
                                                                                type: 'line',
                                                                                yMin: hoveredQuantileY.kde,
                                                                                yMax: hoveredQuantileY.kde,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 2,
                                                                                borderDash: [4, 4],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: hoveredQuantileY.kde.toFixed(4),
                                                                                    position: 'start',
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null
                                                                        }
                                                                    },
                                                                    tooltip: {
                                                                        callbacks: {
                                                                            label: (context) => `Density: ${context.parsed.y.toFixed(4)}`
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Cumulative Probability of Max Drawdown (CDF) */}
                                                    <div style={{ height: isMobile ? '300px' : '450px' }}>
                                                        <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Cumulative Drawdown Probability (CDF)</h3>
                                                        <Line
                                                            data={{
                                                                datasets: [{
                                                                    label: 'Prob DD <= X',
                                                                    data: mcData.cdfDrawdown,
                                                                    borderColor: '#ef4444',
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                                    fill: true,
                                                                    pointRadius: 0,
                                                                    borderWidth: 2
                                                                }]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false
                                                                },
                                                                layout: {
                                                                    padding: { bottom: 40, left: 10, right: 10, top: 10 }
                                                                },
                                                                scales: {
                                                                    x: {
                                                                        type: 'linear',
                                                                        title: { display: true, text: 'Max Drawdown %' },
                                                                        grid: { display: false }
                                                                    },
                                                                    y: {
                                                                        title: { display: true, text: 'Probability %' },
                                                                        max: 100,
                                                                        grid: { display: false }
                                                                    }
                                                                },
                                                                plugins: {
                                                                    annotation: {
                                                                        annotations: {
                                                                            hoverPointX: hoveredQuantileType === 'drawdown' && hoveredQuantileVal !== null ? {
                                                                                type: 'line',
                                                                                xMin: hoveredQuantileVal,
                                                                                xMax: hoveredQuantileVal,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 3,
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileVal.toFixed(1)}%`,
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null,
                                                                            hoverPointY: hoveredQuantileType === 'drawdown' && hoveredQuantileY?.cdf !== undefined ? {
                                                                                type: 'line',
                                                                                yMin: hoveredQuantileY.cdf,
                                                                                yMax: hoveredQuantileY.cdf,
                                                                                borderColor: '#3b82f6',
                                                                                borderWidth: 2,
                                                                                borderDash: [4, 4],
                                                                                label: {
                                                                                    display: true,
                                                                                    content: `${hoveredQuantileY.cdf.toFixed(1)}%`,
                                                                                    position: 'start',
                                                                                    backgroundColor: '#3b82f6',
                                                                                    color: 'white'
                                                                                }
                                                                            } : null
                                                                        }
                                                                    },
                                                                    tooltip: {
                                                                        callbacks: {
                                                                            label: (ctx) => `Prob: ${ctx.raw.y.toFixed(1)}% of DD <= ${ctx.raw.x.toFixed(1)}%`
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Table on the right */}
                                                <div style={{ background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #eee' }}>
                                                    <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: '#333' }}>Drawdown Analysis (Quantiles)</h3>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                                        <thead>
                                                            <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                                                                <th style={{ textAlign: 'left', padding: '8px' }}>Quantile</th>
                                                                <th style={{ textAlign: 'right', padding: '8px' }}>Max Drawdown</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {[5, 25, 50, 75, 95].map(q => (
                                                                <tr key={q}
                                                                    onMouseEnter={() => {
                                                                        setHoveredPath(mcData.quantiles.drawdown[q].idx);
                                                                        setHoveredQuantileVal(mcData.quantiles.drawdown[q].val);
                                                                        setHoveredQuantileY({ kde: mcData.quantiles.drawdown[q].yKde, cdf: mcData.quantiles.drawdown[q].yCdf });
                                                                        setHoveredQuantileType('drawdown');
                                                                    }}
                                                                    onMouseLeave={() => {
                                                                        setHoveredPath(null);
                                                                        setHoveredQuantileVal(null);
                                                                        setHoveredQuantileY(null);
                                                                        setHoveredQuantileType(null);
                                                                    }}
                                                                    style={{
                                                                        borderBottom: '1px solid #eee',
                                                                        background: q === 95 ? '#eef2ff' : 'transparent',
                                                                        fontWeight: q === 95 ? 'bold' : 'normal',
                                                                        cursor: 'pointer',
                                                                        transition: 'background 0.2s'
                                                                    }}>
                                                                    <td style={{ padding: '8px' }}>{q}% {q === 95 ? '(95% Confidence)' : ''}</td>
                                                                    <td style={{ textAlign: 'right', padding: '8px', color: '#333' }}>
                                                                        {mcData.quantiles.drawdown[q].val.toFixed(2)}%
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            <tr style={{ borderTop: '2px solid #dee2e6', fontWeight: 'bold', background: '#fff5f5' }}>
                                                                <td style={{ padding: '8px' }}>Esperanza Matematica (Mean)</td>
                                                                <td style={{ textAlign: 'right', padding: '8px', color: '#c53030' }}>
                                                                    {mcData.meanDrawdown.toFixed(2)}%
                                                                </td>
                                                            </tr>
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>


                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    }

                    {
                        data && mode !== 'OPTIMIZER' && mode !== 'RISK_ANALYSIS' && mode !== 'MACHINE_LEARNING' && mode !== 'FINANCIALS' && (
                            <>
                                {/* CHARTS SECTION */}
                                {/* CHARTS SECTION */}
                                <div style={{
                                    display: isMobile ? 'flex' : 'grid',
                                    flexDirection: isMobile ? 'column' : 'row',
                                    gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
                                    gap: '24px',
                                    marginBottom: '40px',
                                    alignItems: 'start'
                                }}>
                                    {/* LEFT COLUMN: CHARTS */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0, width: '100%', overflow: 'hidden' }}>
                                        {/* Cumulative Returns - Normal Scale */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Cumulative Returns vs Benchmark</h3>
                                            <div style={{ height: isMobile ? '240px' : '340px', width: '100%' }}>
                                                <Line
                                                    data={{
                                                        labels: data.cumulativeReturns?.map(d => d.date) || [],
                                                        datasets: [
                                                            {
                                                                label: strategyLabel,
                                                                data: data.cumulativeReturns?.map(d => d.value * 100) || [],
                                                                borderColor: '#1E88E5',
                                                                backgroundColor: 'rgba(30, 136, 229, 0.1)',
                                                                borderWidth: 2,
                                                                tension: 0.1,
                                                                pointRadius: 0
                                                            },
                                                            {
                                                                label: benchmarkLabel,
                                                                data: data.benchmarkCumulativeReturns?.map(d => d.value * 100) || [],
                                                                borderColor: '#fbbf24',
                                                                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                                                                borderWidth: 2,
                                                                tension: 0.1,
                                                                pointRadius: 0
                                                            }
                                                        ]
                                                    }}
                                                    options={{
                                                        ...chartOptions,
                                                        plugins: {
                                                            ...chartOptions.plugins,
                                                            tooltip: { mode: 'index', intersect: false }
                                                        },
                                                        interaction: {
                                                            mode: 'nearest',
                                                            axis: 'x',
                                                            intersect: false
                                                        },
                                                        scales: {
                                                            y: {
                                                                ...chartOptions.scales.y,
                                                                title: { display: true, text: 'Return (%)' }
                                                            },
                                                            x: chartOptions.scales.x
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>



                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
                                            {/* EOY Returns Chart */}
                                            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>EOY Returns vs Benchmark</h3>
                                                <div style={{ height: isMobile ? '240px' : '340px', width: '100%' }}>
                                                    <Bar
                                                        data={(() => {
                                                            // EOY Returns + Current YTD
                                                            const annuals = [...(data.eoyReturns || [])].sort((a, b) => parseInt(a.year) - parseInt(b.year));


                                                            // Calculate YTD
                                                            const prices = data.strategyPrices || [];
                                                            const dates = data.cumulativeReturns?.map(d => d.date) || [];
                                                            const currentYear = new Date().getFullYear();

                                                            // Ensure eoyReturns doesn't already have current year (usually backend provides full past years)
                                                            const hasCurrent = annuals.find(a => a.year == currentYear);

                                                            if (!hasCurrent && prices.length > 0 && dates.length > 0) {
                                                                const startOfYearDate = `${currentYear}-01-01`;
                                                                // Find first index >= startOfYear
                                                                let startIdx = dates.findIndex(d => d >= startOfYearDate);

                                                                if (startIdx === -1) {
                                                                    // Fallback: if data starts mid-year
                                                                    if (dates[0] >= startOfYearDate) startIdx = 0;
                                                                }

                                                                if (startIdx !== -1) {
                                                                    const startPrice = prices[startIdx];
                                                                    const currentPrice = prices[prices.length - 1];
                                                                    const benchPrices = data.benchmarkPrices || [];
                                                                    const startBench = benchPrices[startIdx];
                                                                    const currentBench = benchPrices[benchPrices.length - 1];

                                                                    if (startPrice && currentPrice) {
                                                                        const ytdStrat = ((currentPrice - startPrice) / startPrice) * 100;
                                                                        const ytdBench = startBench ? ((currentBench - startBench) / startBench) * 100 : 0;

                                                                        annuals.push({
                                                                            year: currentYear.toString() + " (YTD)",
                                                                            strategy: ytdStrat.toFixed(2),
                                                                            benchmark: ytdBench.toFixed(2)
                                                                        });
                                                                    }
                                                                }
                                                            }

                                                            // Calculate Average of this new full set
                                                            const vals = annuals.map(a => parseFloat(a.strategy)).filter(v => !isNaN(v));
                                                            const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
                                                            const avgLine = new Array(annuals.length).fill(avg);

                                                            return {
                                                                labels: annuals.map(r => r.year.toString()),
                                                                datasets: [
                                                                    {
                                                                        label: benchmarkLabel,
                                                                        data: annuals.map(r => parseFloat(r.benchmark)),
                                                                        backgroundColor: '#fbbf24',
                                                                        order: 2
                                                                    },
                                                                    {
                                                                        label: strategyLabel,
                                                                        data: annuals.map(r => parseFloat(r.strategy)),
                                                                        backgroundColor: '#1E88E5',
                                                                        order: 3
                                                                    },
                                                                    {
                                                                        type: 'line',
                                                                        label: 'Average (Strategy)',
                                                                        data: avgLine,
                                                                        borderColor: '#dc2626',
                                                                        borderWidth: 2,
                                                                        borderDash: [5, 5],
                                                                        pointRadius: 0,
                                                                        order: 1
                                                                    }
                                                                ]
                                                            };
                                                        })()}
                                                        options={{
                                                            ...chartOptions,
                                                            plugins: {
                                                                ...chartOptions.plugins,
                                                                tooltip: { mode: 'index', intersect: false }
                                                            },
                                                            interaction: {
                                                                mode: 'nearest',
                                                                axis: 'x',
                                                                intersect: false
                                                            },
                                                            scales: {
                                                                y: chartOptions.scales.y,
                                                                x: {
                                                                    ...chartOptions.scales.x,
                                                                    grid: {
                                                                        display: false
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Daily Return Distribution */}
                                            <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', height: isMobile ? '300px' : '400px' }}>
                                                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Daily Return Distribution (Gaussian)</h3>
                                                <div style={{ height: 'calc(100% - 40px)' }}>
                                                    <Chart
                                                        type='bar'
                                                        data={(() => {
                                                            if (!distData) return { labels: [], datasets: [] };
                                                            return {
                                                                labels: distData.labels.map(l => l.toFixed(1) + '%'),
                                                                datasets: [
                                                                    // Strategy KDE
                                                                    {
                                                                        type: 'line',
                                                                        label: `${strategyLabel} (KDE)`,
                                                                        data: distData.stratKDE,
                                                                        borderColor: '#000000',
                                                                        borderWidth: 1,
                                                                        tension: 0.4,
                                                                        pointRadius: 0,
                                                                        order: 1
                                                                    },
                                                                    // Benchmark KDE
                                                                    {
                                                                        type: 'line',
                                                                        label: `${benchmarkLabel} (KDE)`,
                                                                        data: distData.benchKDE,
                                                                        borderColor: '#fbbf24',
                                                                        borderWidth: 1,
                                                                        tension: 0.4,
                                                                        pointRadius: 0,
                                                                        order: 2
                                                                    },
                                                                    // Strategy Bars
                                                                    {
                                                                        type: 'bar',
                                                                        label: strategyLabel,
                                                                        data: distData.stratDist,
                                                                        backgroundColor: '#1E88E5',
                                                                        borderColor: 'white',
                                                                        borderWidth: 1,
                                                                        categoryPercentage: 1.0,
                                                                        barPercentage: 1.0,
                                                                        order: 3
                                                                    },
                                                                    // Benchmark Bars
                                                                    {
                                                                        type: 'bar',
                                                                        label: benchmarkLabel,
                                                                        data: distData.benchDist,
                                                                        backgroundColor: 'rgba(251, 191, 36, 0.6)',
                                                                        borderColor: 'white',
                                                                        borderWidth: 1,
                                                                        categoryPercentage: 1.0,
                                                                        barPercentage: 1.0,
                                                                        order: 4
                                                                    }
                                                                ]
                                                            };
                                                        })()}
                                                        options={{
                                                            ...chartOptions,
                                                            layout: {
                                                                padding: {
                                                                    top: 40,
                                                                    bottom: 10
                                                                }
                                                            },
                                                            plugins: {
                                                                ...chartOptions.plugins,
                                                                legend: {
                                                                    display: true,
                                                                    position: 'top',
                                                                    align: 'end',
                                                                    labels: {
                                                                        boxWidth: 12,
                                                                        padding: 15,
                                                                        usePointStyle: true,
                                                                        font: { size: 11 }
                                                                    }
                                                                },
                                                                tooltip: { mode: 'index', intersect: false },
                                                                annotation: {
                                                                    annotations: {
                                                                        stratMean: distData ? {
                                                                            type: 'line',
                                                                            scaleID: 'x',
                                                                            value: distData.labels.find(l => distData.stratMean >= l && distData.stratMean < l + distData.binStep)?.toFixed(1) + '%',
                                                                            borderColor: '#dc2626',
                                                                            borderWidth: 2,
                                                                            borderDash: [6, 6],
                                                                            label: {
                                                                                display: true,
                                                                                content: `Exp: ${distData.stratMean.toFixed(2)}%`,
                                                                                position: 'center',
                                                                                yAdjust: -50,
                                                                                backgroundColor: 'rgba(220, 38, 38, 0.8)',
                                                                                color: 'white',
                                                                                font: { size: 10, weight: 'bold' }
                                                                            }
                                                                        } : undefined,
                                                                        benchMean: distData ? {
                                                                            type: 'line',
                                                                            scaleID: 'x',
                                                                            value: distData.labels.find(l => distData.benchMean >= l && distData.benchMean < l + distData.binStep)?.toFixed(1) + '%',
                                                                            borderColor: '#fbbf24',
                                                                            borderWidth: 2,
                                                                            borderDash: [2, 3],
                                                                            display: false // Hiding benchmark mean by default to avoid clutter unless requested
                                                                        } : undefined
                                                                    }
                                                                }
                                                            },
                                                            interaction: {
                                                                mode: 'nearest',
                                                                axis: 'x',
                                                                intersect: false
                                                            },
                                                            scales: {
                                                                y: {
                                                                    grid: { display: false },
                                                                    title: { display: true, text: 'Frequency' }
                                                                },
                                                                x: {
                                                                    ...chartOptions.scales.x,
                                                                    grid: { display: false },
                                                                    ticks: {
                                                                        maxTicksLimit: 10,
                                                                        callback: function (val, index) {
                                                                            return this.getLabelForValue(val);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Daily Active Returns */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', height: isMobile ? '300px' : '400px' }}>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Daily Active Returns</h3>
                                            <div style={{ height: 'calc(100% - 40px)' }}>
                                                <Bar
                                                    data={{
                                                        labels: (data.strategyPrices || [])
                                                            .slice(1)
                                                            .map((_, i) => (data.cumulativeReturns && data.cumulativeReturns[i + 1] ? data.cumulativeReturns[i + 1].date : '')),
                                                        datasets: [{
                                                            label: 'Daily Return',
                                                            data: (() => {
                                                                const prices = data.strategyPrices || [];
                                                                return prices.slice(1).map((p, i) => {
                                                                    const prev = prices[i];
                                                                    return ((p - prev) / prev) * 100;
                                                                });
                                                            })(),
                                                            backgroundColor: '#618ac9'
                                                        }]
                                                    }}
                                                    options={{
                                                        ...chartOptions,
                                                        plugins: {
                                                            legend: { display: false },
                                                            tooltip: { mode: 'index', intersect: false },
                                                            zoom: {
                                                                pan: { enabled: true, mode: 'x' },
                                                                zoom: {
                                                                    wheel: { enabled: true },
                                                                    pinch: { enabled: true },
                                                                    mode: 'x'
                                                                }
                                                            }
                                                        },
                                                        interaction: {
                                                            mode: 'nearest',
                                                            axis: 'x',
                                                            intersect: false
                                                        },
                                                        scales: {
                                                            x: { display: false },
                                                            y: { title: { display: true, text: 'Return %' } }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Underwater Plot */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', height: isMobile ? '300px' : '400px' }}>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Underwater Plot (Drawdowns)</h3>
                                            <div style={{ height: 'calc(100% - 40px)' }}>
                                                <Line
                                                    data={{
                                                        labels: data.cumulativeReturns?.map(d => d.date) || [],
                                                        datasets: [
                                                            {
                                                                type: 'line',
                                                                label: strategyLabel,
                                                                data: (() => {
                                                                    const prices = data.strategyPrices || [];
                                                                    let peak = prices[0];
                                                                    return prices.map(p => {
                                                                        if (p > peak) peak = p;
                                                                        return ((p - peak) / peak) * 100;
                                                                    });
                                                                })(),
                                                                borderColor: '#1E88E5', // Extracted Blue
                                                                backgroundColor: 'rgba(30, 136, 229, 0.2)', // Subtle shadow
                                                                fill: true,
                                                                borderWidth: 2,
                                                                tension: 0.1,
                                                                pointRadius: 0,
                                                                order: 2
                                                            },
                                                            {
                                                                type: 'line',
                                                                label: benchmarkLabel,
                                                                data: (() => {
                                                                    const prices = data.benchmarkPrices || [];
                                                                    let peak = prices[0];
                                                                    return prices.map(p => {
                                                                        if (p > peak) peak = p;
                                                                        return ((p - peak) / peak) * 100;
                                                                    });
                                                                })(),
                                                                borderColor: '#fbbf24', // Yellow
                                                                backgroundColor: 'rgba(251, 191, 36, 0.05)',
                                                                fill: true,
                                                                borderWidth: 2,
                                                                tension: 0.1,
                                                                pointRadius: 0,
                                                                hidden: false,
                                                                order: 3
                                                            },
                                                            {
                                                                type: 'line',
                                                                label: 'Avg Drawdown',
                                                                data: (() => {
                                                                    const prices = data.strategyPrices || [];
                                                                    let peak = prices[0];
                                                                    const drawdowns = prices.map(p => {
                                                                        if (p > peak) peak = p;
                                                                        return ((p - peak) / peak) * 100;
                                                                    });
                                                                    const sum = drawdowns.reduce((a, b) => a + b, 0);
                                                                    const avg = sum / drawdowns.length;
                                                                    return new Array(drawdowns.length).fill(avg);
                                                                })(),
                                                                borderColor: '#dc2626', // Red (Average)
                                                                borderWidth: 2,
                                                                borderDash: [5, 5],
                                                                pointRadius: 0,
                                                                fill: false,
                                                                order: 1
                                                            }
                                                        ]
                                                    }}
                                                    options={{
                                                        ...chartOptions,
                                                        plugins: {
                                                            legend: { display: true },
                                                            tooltip: { mode: 'index', intersect: false }
                                                        },
                                                        interaction: {
                                                            mode: 'nearest',
                                                            axis: 'x',
                                                            intersect: false
                                                        },
                                                        scales: {
                                                            y: {
                                                                grid: {
                                                                    display: true,
                                                                    color: '#f5f5f5',
                                                                    drawBorder: false
                                                                },
                                                                max: 0,
                                                                title: { display: true, text: 'Drawdown (%)' }
                                                            },
                                                            x: {
                                                                grid: chartOptions.scales.x.grid,
                                                                title: chartOptions.scales.x.title,
                                                                ticks: {
                                                                    ...chartOptions.scales.x.ticks,
                                                                    maxTicksLimit: 12
                                                                }
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Rolling Metrics Charts - Only show if data available */}
                                        {data.rollingMetrics && data.rollingMetrics.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '24px' }}>
                                                {/* Rolling Beta */}
                                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Rolling Beta (6M & 12M)</h3>
                                                    <div style={{ height: isMobile ? '220px' : '300px', width: '100%' }}>
                                                        <Line
                                                            data={{
                                                                labels: data.rollingMetrics.map(d => d.date),
                                                                datasets: [
                                                                    {
                                                                        label: `6-Month Beta (${strategyLabel})`,
                                                                        data: data.rollingMetrics.map(d => d.beta),
                                                                        borderColor: '#1E88E5',
                                                                        borderWidth: 2,
                                                                        tension: 0.1,
                                                                        pointRadius: 0
                                                                    },
                                                                    {
                                                                        label: `12-Month Beta (${strategyLabel})`,
                                                                        data: data.rollingMetrics.map(d => d.beta12m),
                                                                        borderColor: '#9e9e9e', // Gray
                                                                        borderWidth: 2,
                                                                        tension: 0.1,
                                                                        pointRadius: 0,
                                                                        spanGaps: true
                                                                    },
                                                                    {
                                                                        label: 'Avg (6M)',
                                                                        data: data.rollingMetrics.map(() => {
                                                                            const valid = data.rollingMetrics.map(d => d.beta).filter(v => typeof v === 'number' && !isNaN(v));
                                                                            return valid.reduce((a, b) => a + b, 0) / valid.length;
                                                                        }),
                                                                        borderColor: '#dc2626', // Red
                                                                        borderWidth: 1,
                                                                        borderDash: [5, 5],
                                                                        tension: 0,
                                                                        pointRadius: 0
                                                                    }
                                                                ]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                plugins: {
                                                                    ...chartOptions.plugins,
                                                                    tooltip: { mode: 'index', intersect: false }
                                                                },
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false
                                                                },
                                                                scales: {
                                                                    y: {
                                                                        grid: {
                                                                            display: true,
                                                                            color: '#f5f5f5',
                                                                            drawBorder: false
                                                                        },
                                                                        title: { display: true, text: 'Beta' }
                                                                    },
                                                                    x: chartOptions.scales.x
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Rolling Volatility */}
                                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Rolling Volatility (6-Months)</h3>
                                                    <div style={{ height: isMobile ? '220px' : '300px', width: '100%' }}>
                                                        <Line
                                                            data={{
                                                                labels: data.rollingMetrics.map(d => d.date),
                                                                datasets: [
                                                                    {
                                                                        label: strategyLabel,
                                                                        data: data.rollingMetrics.map(d => d.volatility * 100),
                                                                        borderColor: '#618ac9',
                                                                        borderWidth: 2,
                                                                        tension: 0.1,
                                                                        pointRadius: 0
                                                                    },
                                                                    {
                                                                        label: benchmarkLabel,
                                                                        data: data.rollingMetrics.map(d => d.benchVolatility * 100),
                                                                        borderColor: '#fbbf24', // Amber/Yellow
                                                                        borderWidth: 2,
                                                                        tension: 0.1,
                                                                        pointRadius: 0
                                                                    },
                                                                    {
                                                                        label: 'Average (Strat)',
                                                                        data: data.rollingMetrics.map(() => {
                                                                            const valid = data.rollingMetrics.map(d => d.volatility * 100).filter(v => !isNaN(v));
                                                                            return valid.reduce((a, b) => a + b, 0) / valid.length;
                                                                        }),
                                                                        borderColor: '#dc2626', // Red
                                                                        borderWidth: 1,
                                                                        borderDash: [5, 5],
                                                                        tension: 0,
                                                                        pointRadius: 0
                                                                    }
                                                                ]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                plugins: {
                                                                    ...chartOptions.plugins,
                                                                    tooltip: { mode: 'index', intersect: false }
                                                                },
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false
                                                                },
                                                                scales: {
                                                                    y: {
                                                                        grid: {
                                                                            display: true,
                                                                            color: '#f5f5f5',
                                                                            drawBorder: false
                                                                        },
                                                                        title: { display: true, text: 'Volatility (%)' }
                                                                    },
                                                                    x: chartOptions.scales.x
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Rolling Sharpe */}
                                                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                                                    <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Rolling Sharpe (6-Months)</h3>
                                                    <div style={{ height: isMobile ? '220px' : '300px', width: '100%' }}>
                                                        <Line
                                                            data={{
                                                                labels: data.rollingMetrics.map(d => d.date),
                                                                datasets: [
                                                                    {
                                                                        label: `Sharpe Ratio (${strategyLabel})`,
                                                                        data: data.rollingMetrics.map(d => d.sharpe),
                                                                        borderColor: '#618ac9',
                                                                        borderWidth: 2,
                                                                        tension: 0.1,
                                                                        pointRadius: 0
                                                                    },
                                                                    {
                                                                        label: 'Average',
                                                                        data: data.rollingMetrics.map(() => {
                                                                            const valid = data.rollingMetrics.map(d => d.sharpe).filter(v => !isNaN(v));
                                                                            return valid.reduce((a, b) => a + b, 0) / valid.length;
                                                                        }),
                                                                        borderColor: '#dc2626',
                                                                        borderWidth: 2,
                                                                        borderDash: [5, 5],
                                                                        tension: 0,
                                                                        pointRadius: 0
                                                                    }
                                                                ]
                                                            }}
                                                            options={{
                                                                ...chartOptions,
                                                                plugins: {
                                                                    ...chartOptions.plugins,
                                                                    tooltip: { mode: 'index', intersect: false }
                                                                },
                                                                interaction: {
                                                                    mode: 'nearest',
                                                                    axis: 'x',
                                                                    intersect: false
                                                                },
                                                                scales: {
                                                                    y: {
                                                                        grid: {
                                                                            display: true,
                                                                            color: '#f5f5f5',
                                                                            drawBorder: false
                                                                        },
                                                                        title: { display: true, text: 'Sharpe Ratio' }
                                                                    },
                                                                    x: chartOptions.scales.x
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>


                                            </div>
                                        )}



                                        {/* Monthly Returns Heatmap */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', marginBottom: '24px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>Strategy - Monthly Active Returns (%)</h3>
                                            <div style={{ overflowX: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', textAlign: 'center' }}>
                                                    <thead>
                                                        <tr>
                                                            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>Year</th>
                                                            {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map(m => (
                                                                <th key={m} style={{ padding: '8px', border: '1px solid #ddd', background: '#f5f5f5' }}>{m}</th>
                                                            ))}
                                                            <th style={{ padding: '8px', border: '1px solid #ddd', background: '#e0e0e0', fontWeight: 'bold' }}>TOTAL</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(() => {
                                                            const yearMonthMap = {};
                                                            (data.monthlyReturns || []).forEach(m => {
                                                                if (!m.month) return;
                                                                const parts = m.month.split('-');
                                                                if (parts.length < 2) return;
                                                                const [year, month] = parts;
                                                                if (!yearMonthMap[year]) yearMonthMap[year] = {};
                                                                yearMonthMap[year][parseInt(month)] = m.return;
                                                            });

                                                            return Object.keys(yearMonthMap).sort().map(year => {
                                                                // Find matching yearly total
                                                                const yearTotalObj = data.eoyReturns?.find(y => y.year === parseInt(year));
                                                                const yearTotalStr = yearTotalObj ? yearTotalObj.strategy : '-';

                                                                return (
                                                                    <tr key={year}>
                                                                        <td style={{ padding: '8px', border: '1px solid #ddd', fontWeight: 'bold' }}>{year}</td>
                                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(month => {
                                                                            const val = yearMonthMap[year][month];
                                                                            const pct = val ? (val * 100).toFixed(2) : '-';
                                                                            const bgColor = val > 0 ? `rgba(34, 197, 94, ${Math.min(Math.abs(val * 10), 1)})` :
                                                                                val < 0 ? `rgba(239, 68, 68, ${Math.min(Math.abs(val * 10), 1)})` : '#fff';
                                                                            return (
                                                                                <td key={month} style={{
                                                                                    padding: '8px',
                                                                                    border: '1px solid #ddd',
                                                                                    background: bgColor,
                                                                                    color: Math.abs(val) > 0.05 ? '#fff' : '#000',
                                                                                    fontWeight: Math.abs(val) > 0.1 ? 'bold' : 'normal'
                                                                                }}>
                                                                                    {pct}
                                                                                </td>
                                                                            );
                                                                        })}
                                                                        <td style={{
                                                                            padding: '8px',
                                                                            border: '1px solid #ddd',
                                                                            background: yearTotalStr.includes('-') ? '#ffebee' : '#e8f5e9',
                                                                            fontWeight: 'bold',
                                                                            color: yearTotalStr.includes('-') ? '#c62828' : '#2e7d32'
                                                                        }}>
                                                                            {yearTotalStr}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            });
                                                        })()}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                    {/* END LEFT COLUMN */}

                                    {/* RIGHT COLUMN: METRICS AND TABLES */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '24px',
                                        position: isMobile ? 'static' : 'sticky',
                                        top: '20px',
                                        alignSelf: 'start',
                                        width: isMobile ? '100%' : 'auto'
                                    }}>
                                        {/* COLUMN 1: METRICS */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                            <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>Key Performance Metrics</h3>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f0f0f0', borderBottom: '1px solid #ddd' }}>
                                                        <td style={{ padding: '8px', fontWeight: '600', color: '#333' }}>Metric</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>{strategyLabel}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>{benchmarkLabel}</td>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {((data.metrics && data.metrics.length > 0) ? data.metrics : [
                                                        { metric: "Metric Data Loading...", strategy: "...", benchmark: "..." },
                                                        { isHeader: true },
                                                        { metric: "Risk-Free Rate", strategy: "-", benchmark: "-" },
                                                        { metric: "CAGR%", strategy: "-", benchmark: "-" },
                                                        { metric: "Sharpe", strategy: "-", benchmark: "-" },
                                                        { metric: "Sortino", strategy: "-", benchmark: "-" },
                                                        { metric: "Max Drawdown", strategy: "-", benchmark: "-" },
                                                        { metric: "Current Drawdown", strategy: "-", benchmark: "-" },
                                                        { metric: "Current DD Days", strategy: "-", benchmark: "-" },
                                                        { metric: "Longest DD Days", strategy: "-", benchmark: "-" },
                                                        { metric: "Volatility", strategy: "-", benchmark: "-" },
                                                        { metric: "R^2", strategy: "-", benchmark: "-" },
                                                        { metric: "Calmar", strategy: "-", benchmark: "-" },
                                                        { metric: "Kelly", strategy: "-", benchmark: "-" },
                                                        { metric: "Ulcer Index", strategy: "-", benchmark: "-" },
                                                        { metric: "Risk of Ruin", strategy: "-", benchmark: "-" },
                                                        { metric: "CPC Index", strategy: "-", benchmark: "-" },
                                                        { metric: "Tail Ratio", strategy: "-", benchmark: "-" },
                                                        { metric: "Daily VaR", strategy: "-", benchmark: "-" },
                                                        { metric: "Profit Factor", strategy: "-", benchmark: "-" },
                                                        { metric: "Gain/Pain", strategy: "-", benchmark: "-" },
                                                        { metric: "Payoff Ratio", strategy: "-", benchmark: "-" },
                                                        { metric: "MTD", strategy: "-", benchmark: "-" },
                                                        { metric: "YTD", strategy: "-", benchmark: "-" },
                                                        { metric: "1Y", strategy: "-", benchmark: "-" },
                                                        { metric: "3Y", strategy: "-", benchmark: "-" },
                                                        { metric: "All-time (ann)", strategy: "-", benchmark: "-" },
                                                        { isHeader: true },
                                                        { metric: "Win Days %", strategy: "-", benchmark: "-" },
                                                        { metric: "Win Month %", strategy: "-", benchmark: "-" },
                                                        { metric: "Win Quarter %", strategy: "-", benchmark: "-" },
                                                        { metric: "Win Year %", strategy: "-", benchmark: "-" },
                                                        { metric: "Max Consec. Gain Days", strategy: "-", benchmark: "-" },
                                                        { metric: "Max Consec. Loss Days", strategy: "-", benchmark: "-" },
                                                        { metric: "Cons. Win Months", strategy: "-", benchmark: "-" },
                                                        { metric: "Cons. Loss Months", strategy: "-", benchmark: "-" },
                                                        { metric: "Cons. Win Years", strategy: "-", benchmark: "-" },
                                                        { metric: "Cons. Loss Years", strategy: "-", benchmark: "-" },
                                                        { metric: "Beta", strategy: "-", benchmark: "-" },
                                                        { metric: "Alpha", strategy: "-", benchmark: "-" },
                                                    ]).map((row, i) => {
                                                        if (row.isHeader) {
                                                            return (
                                                                <tr key={i} style={{ height: '8px' }}>
                                                                    <td colSpan="3"></td>
                                                                </tr>
                                                            );
                                                        }

                                                        return (
                                                            <tr key={i}>
                                                                <td style={{ padding: '6px 8px', color: '#333', fontSize: '11px', borderBottom: '1px solid #f5f5f5' }}>{row.metric}</td>
                                                                <td style={{
                                                                    padding: '6px 8px',
                                                                    textAlign: 'right',
                                                                    color: '#333',
                                                                    fontSize: '11px',
                                                                    borderLeft: '1px solid #f0f0f0',
                                                                    borderBottom: '1px solid #f5f5f5'
                                                                }}>{row.strategy}</td>
                                                                <td style={{
                                                                    padding: '6px 8px',
                                                                    textAlign: 'right',
                                                                    color: '#333',
                                                                    fontSize: '11px',
                                                                    borderLeft: '1px solid #f0f0f0',
                                                                    borderBottom: '1px solid #f5f5f5'
                                                                }}>{row.benchmark}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* COLUMN 2: EOY RETURNS */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
                                            <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>EOY Returns vs Benchmark</h3>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f0f0f0', borderBottom: '1px solid #ddd' }}>
                                                        <td style={{ padding: '8px', fontWeight: '600', color: '#333' }}>Year</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>{benchmarkLabel}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>{strategyLabel}</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>Multiplier</td>
                                                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>Won</td>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(data.eoyReturns || []).map((row, i) => (
                                                        <tr key={i}>
                                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f5f5', color: '#333', fontSize: '11px' }}>{row.year}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{row.benchmark}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{row.strategy}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{row.multiplier}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{row.won}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* WORST 10 DRAWDOWNS */}
                                        <div style={{ background: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                                            <h3 style={{ fontSize: '13px', fontWeight: '600', color: '#333', marginBottom: '12px' }}>Worst 10 Drawdowns</h3>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                                <thead>
                                                    <tr style={{ background: '#f0f0f0', borderBottom: '1px solid #ddd' }}>
                                                        <td style={{ padding: '8px', fontWeight: '600', color: '#333' }}>Started</td>
                                                        <td style={{ padding: '8px', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>Recovered</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>Drawdown</td>
                                                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: '#333', borderLeft: '1px solid #e0e0e0' }}>Days</td>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(data.worstDrawdowns || []).slice(0, 10).map((dd, i) => (
                                                        <tr key={i}>
                                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f5f5', color: '#333', fontSize: '11px' }}>{dd.started}</td>
                                                            <td style={{ padding: '6px 8px', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{dd.recovered}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{dd.drawdown}</td>
                                                            <td style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f5f5f5', borderLeft: '1px solid #f0f0f0', color: '#333', fontSize: '11px' }}>{dd.days}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                                {/* END GRID CONTAINER */}
                            </>
                        )
                    }
                    {mode === 'MACHINE_LEARNING' && data && (
                        <div style={{ padding: '0 0 40px 0' }}>
                            <QuantMachineLearning
                                data={data.strategyPrices.map((p, i) => ({
                                    close: p,
                                    date: data.cumulativeReturns[i]?.date
                                }))}
                                symbol={ticker}
                            />
                        </div>
                    )}

                    {mode === 'FINANCIALS' && (
                        <FinancialAnalysis
                            data={finData}
                            loading={finLoading}
                            period={finPeriod}
                            setPeriod={setFinPeriod}
                            onSearch={handleFinancialSearch}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default QuantReport;
