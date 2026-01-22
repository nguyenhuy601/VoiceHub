const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'document-service' });
});

// Document routes
const documentRoutes = require('./routes/document.routes');
app.use('/api/documents', documentRoutes);

module.exports = app;

