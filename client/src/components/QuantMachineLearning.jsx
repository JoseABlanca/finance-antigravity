
import React, { useState, useEffect, useMemo } from 'react';
import { Line, Scatter } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { DecisionTreeRegression, DecisionTreeClassifier } from 'ml-cart';
import { SimpleLinearRegression } from 'ml-regression';
import SVM from 'ml-svm';
import { ConfusionMatrix } from 'ml-confusion-matrix';
import { Brain, Play, AlertCircle } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const QuantMachineLearning = ({ data, symbol }) => {
    const [config, setConfig] = useState({
        modelType: 'linear_regression', // linear_regression, svm, decision_tree
        predictionType: 'regression', // regression, classification
        testSize: 0.2,
        lookback: 1, // Number of past days to use as features
    });

    const [results, setResults] = useState(null);
    const [isTraining, setIsTraining] = useState(false);
    const [error, setError] = useState(null);

    // Prepare Data
    const processedData = useMemo(() => {
        if (!data || data.length === 0) return null;

        // data is likely an array of { date, close } or similar.
        // We need returns for stationarity usually, but let's allow predicting Price or Return.
        // For simplicity in this financial context, we'll predict RETURNS (Regression) or DIRECTION (Classification).

        const prices = data.map(d => d.close);
        const dates = data.map(d => d.date);
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        // Align dates with returns (starting from index 1)
        const returnDates = dates.slice(1);

        return { prices, dates, returns, returnDates };
    }, [data]);

    const trainModel = async () => {
        setIsTraining(true);
        setError(null);
        setResults(null);

        try {
            if (!processedData) throw new Error("No data available");

            // 1. Create Features (X) and Target (y)
            const { returns, returnDates } = processedData;
            const X = [];
            const y = [];
            const dates = [];

            // We need 'lookback' prior days to predict the NEXT day.
            // i starts at lookback.
            // Target is returns[i] (prediction for today)
            // Features are returns[i-lookback ... i-1] (past values)

            for (let i = config.lookback; i < returns.length; i++) {
                const featureRow = [];
                for (let j = 1; j <= config.lookback; j++) {
                    featureRow.push(returns[i - j]);
                }
                X.push(featureRow);

                // Target
                if (config.predictionType === 'regression') {
                    y.push(returns[i]);
                } else {
                    // Classification: 1 if Up, 0 if Down
                    y.push(returns[i] > 0 ? 1 : 0);
                }
                dates.push(returnDates[i]);
            }

            // Split Train/Test
            const splitIdx = Math.floor(X.length * (1 - config.testSize));
            const X_train = X.slice(0, splitIdx);
            const y_train = y.slice(0, splitIdx);
            const X_test = X.slice(splitIdx);
            const y_test = y.slice(splitIdx);
            const dates_test = dates.slice(splitIdx);

            let model;
            let predictions = [];

            // 2. Train Model
            if (config.modelType === 'linear_regression') {
                if (config.predictionType !== 'regression') throw new Error("Linear Regression only supports Regression mode.");

                // ml-regression-simple-linear expects 1D X array if 1 feature, but usually standard is X, y. 
                // However, SimpleLinearRegression is usually univariate. For multivariate, use multivariate-linear-regression (not installed yet).
                // Let's stick to univariate (lookback=1) for SimpleLR or implement Multi manually or use ml-regression-multivariate if available.
                // Re-checking libraries: I installed ml-regression. It contains multiple. check exports.
                // Assuming 'ml-regression' package export pattern. commonly: import { SimpleLinearRegression } from 'ml-regression';

                // For safety with the requested libraries:
                // If lookback > 1, SimpleLinearRegression won't work well simply. 
                // Let's enforce lookback=1 for SimpleLR or use DecisionTreeRegression.

                if (config.lookback === 1) {
                    const x_flat = X_train.map(row => row[0]);
                    model = new SimpleLinearRegression(x_flat, y_train);
                    const x_test_flat = X_test.map(row => row[0]);
                    predictions = x_test_flat.map(val => model.predict(val));
                } else {
                    // Fallback or Error for now
                    throw new Error("Simple Linear Regression requires Lookback = 1.");
                }

            } else if (config.modelType === 'decision_tree') {
                if (config.predictionType === 'regression') {
                    model = new DecisionTreeRegression();
                    model.train(X_train, y_train);
                    predictions = model.predict(X_test);
                } else {
                    model = new DecisionTreeClassifier();
                    model.train(X_train, y_train);
                    predictions = model.predict(X_test);
                }
            } else if (config.modelType === 'svm') {
                if (config.predictionType !== 'classification') throw new Error("SVM implementation provided supports Classification.");

                model = new SVM({
                    kernel: 'rbf',
                    type: 'C_SVC',
                    gamma: 0.1,
                    cost: 1
                });
                model.train(X_train, y_train);
                predictions = model.predict(X_test);
            }

            // 3. Calculate Metrics
            let metrics = {};
            if (config.predictionType === 'regression') {
                const n = y_test.length;
                let sumErrorSq = 0;
                let sumAbsError = 0;
                let sumY = 0;

                for (let i = 0; i < n; i++) {
                    const err = y_test[i] - predictions[i];
                    sumErrorSq += err * err;
                    sumAbsError += Math.abs(err);
                    sumY += y_test[i];
                }

                const mse = sumErrorSq / n;
                const rmse = Math.sqrt(mse);
                const mae = sumAbsError / n;
                const meanY = sumY / n;
                const totalVar = y_test.reduce((a, b) => a + Math.pow(b - meanY, 2), 0);
                const r2 = 1 - (sumErrorSq / totalVar);

                metrics = { RMSE: rmse.toFixed(6), MAE: mae.toFixed(6), R2: r2.toFixed(4) };

            } else {
                // Classification
                let tp = 0, tn = 0, fp = 0, fn = 0;
                for (let i = 0; i < y_test.length; i++) {
                    const p = predictions[i];
                    const a = y_test[i];
                    if (p === 1 && a === 1) tp++;
                    if (p === 0 && a === 0) tn++;
                    if (p === 1 && a === 0) fp++;
                    if (p === 0 && a === 1) fn++;
                }

                const accuracy = (tp + tn) / y_test.length;
                const precision = tp / (tp + fp) || 0;
                const recall = tp / (tp + fn) || 0;
                const f1 = 2 * (precision * recall) / (precision + recall) || 0;

                metrics = { Accuracy: (accuracy * 100).toFixed(2) + '%', Precision: precision.toFixed(2), Recall: recall.toFixed(2), F1: f1.toFixed(2) };
            }

            setResults({
                metrics,
                predictions,
                actuals: y_test,
                dates: dates_test
            });

        } catch (err) {
            console.error("Training Error:", err);
            setError(err.message);
        } finally {
            setIsTraining(false);
        }
    };

    // Chart Data
    const chartData = useMemo(() => {
        if (!results) return null;

        const labels = results.dates.map(d => new Date(d).toLocaleDateString());

        return {
            labels,
            datasets: [
                {
                    label: 'Actual',
                    data: results.actuals,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1,
                    pointRadius: 2
                },
                {
                    label: 'Predicted',
                    data: results.predictions,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    borderDash: [5, 5],
                    tension: 0.1,
                    pointRadius: 2
                }
            ]
        };
    }, [results]);

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: true, text: `Actual vs Predicted (${config.predictionType.toUpperCase()})` },
        },
        scales: {
            y: {
                title: { display: true, text: config.predictionType === 'regression' ? 'Return' : 'Class (0/1)' }
            }
        }
    };

    return (
        <div className="p-6 bg-[#1a1a1a] rounded-lg text-white">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Brain className="text-purple-500" /> Machine Learning Analysis
            </h2>

            {/* Configuration Panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-800 rounded">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Model</label>
                    <select
                        className="w-full bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:border-purple-500"
                        value={config.modelType}
                        onChange={(e) => {
                            const type = e.target.value;
                            setConfig(prev => ({
                                ...prev,
                                modelType: type,
                                // Auto-switch prediction type for compatibility
                                predictionType: type === 'linear_regression' ? 'regression' : (type === 'svm' ? 'classification' : prev.predictionType)
                            }));
                        }}
                    >
                        <option value="linear_regression">Linear Regression (Simple)</option>
                        <option value="decision_tree">Decision Tree (CART)</option>
                        <option value="svm">SVM (Support Vector Machine)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Type</label>
                    <select
                        className="w-full bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:border-purple-500"
                        value={config.predictionType}
                        onChange={(e) => setConfig(prev => ({ ...prev, predictionType: e.target.value }))}
                        disabled={config.modelType === 'linear_regression' || config.modelType === 'svm'} // Enforce constraints
                    >
                        <option value="regression">Regression (Returns)</option>
                        <option value="classification">Classification (Up/Down)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm text-gray-400 mb-1">Test Size (0-1)</label>
                    <input
                        type="number" step="0.1" min="0.1" max="0.9"
                        className="w-full bg-gray-700 p-2 rounded border border-gray-600 focus:outline-none focus:border-purple-500"
                        value={config.testSize}
                        onChange={(e) => setConfig(prev => ({ ...prev, testSize: parseFloat(e.target.value) }))}
                    />
                </div>

                <div className="flex items-end">
                    <button
                        onClick={trainModel}
                        disabled={isTraining}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white p-2 rounded font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                        {isTraining ? "Training..." : <><Play size={16} /> Train Model</>}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 p-3 rounded mb-4 flex items-center gap-2">
                    <AlertCircle size={18} /> {error}
                </div>
            )}

            {/* Results */}
            {results && (
                <div className="space-y-6">
                    {/* Metrics Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(results.metrics).map(([key, value]) => (
                            <div key={key} className="bg-gray-800 p-4 rounded text-center border-l-4 border-purple-500">
                                <div className="text-gray-400 text-sm">{key}</div>
                                <div className="text-xl font-bold">{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    <div className="bg-gray-800 p-4 rounded h-[400px]">
                        <Line data={chartData} options={chartOptions} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default QuantMachineLearning;
