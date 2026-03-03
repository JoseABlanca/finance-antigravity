const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const investmentController = require('../controllers/investmentController');

// Transactions
router.get('/transactions', transactionController.getAllTransactions);
router.post('/transactions', transactionController.createTransaction);
router.put('/transactions/:id', transactionController.updateTransaction);
router.delete('/transactions/:id', transactionController.deleteTransaction);

// Investments
router.get('/investments/quote/:symbol', investmentController.getMarketData);
router.get('/investments/analyze/:ticker', investmentController.analyzeTicker);
router.post('/investments/trade', investmentController.recordTrade);
router.put('/investments/trade/:id', investmentController.updateTrade);
router.delete('/investments/trade/:id', investmentController.deleteTrade);
router.get('/investments/portfolio', investmentController.getPortfolio);
router.post('/investments/optimize', investmentController.optimizePortfolio);
router.post('/investments/analyze/custom', investmentController.analyzeCustomPortfolio);
router.post('/investments/correlation', investmentController.getCorrelationMatrix); // NEW ROUTE
router.post('/investments/walkforward', investmentController.getWalkforwardAnalysis); // NEW ROUTE
router.post('/investments/walkforward-matrix', investmentController.getWalkforwardMatrix); // NEW ROUTE
router.get('/investments/financials/:ticker', investmentController.getFinancials); // NEW ROUTE
router.get('/investments/dashboard-summary', investmentController.getDashboardSummary);

module.exports = router;
