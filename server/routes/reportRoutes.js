const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/dashboard', reportController.getDashboardData);
router.get('/balance-sheet', reportController.getBalanceSheet);
router.get('/profit-loss', reportController.getProfitAndLoss);
router.get('/cash-flow', reportController.getCashFlow);
router.get('/trends', reportController.getFinancialTrends);
router.post('/email', reportController.sendReport);

module.exports = router;
