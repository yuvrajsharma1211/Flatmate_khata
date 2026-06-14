import { Router } from 'express';
import multer from 'multer';
import { processCsvImport, resolveAnomaly } from '../services/import.js';
import { authenticateToken } from '../middleware/auth.js';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload CSV file
router.post('/groups/:id/import', authenticateToken, upload.single('file'), async (req, res) => {
  const groupId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded' });
  }

  try {
    const fileContent = req.file.buffer.toString('utf8');
    const result = await processCsvImport(fileContent, groupId, userId);
    return res.json(result);
  } catch (error) {
    console.error('CSV Import error:', error);
    return res.status(500).json({ error: error.message || 'Error processing CSV upload' });
  }
});

// Resolve a pending anomaly
router.post('/import-anomalies/:id/resolve', authenticateToken, async (req, res) => {
  const anomalyId = parseInt(req.params.id);
  const { decision, edits } = req.body;
  const reviewerId = req.user.id;

  if (isNaN(anomalyId)) {
    return res.status(400).json({ error: 'Invalid anomaly ID' });
  }

  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be approve or reject' });
  }

  try {
    const result = await resolveAnomaly(anomalyId, decision, edits, reviewerId);
    return res.json(result);
  } catch (error) {
    console.error('Resolve anomaly error:', error);
    return res.status(500).json({ error: error.message || 'Error resolving anomaly' });
  }
});

// Get import batch report
router.get('/import-batches/:id/report', authenticateToken, async (req, res) => {
  const batchId = parseInt(req.params.id);

  if (isNaN(batchId)) {
    return res.status(400).json({ error: 'Invalid batch ID' });
  }

  try {
    const anomalies = await prisma.importAnomaly.findMany({
      where: { import_batch_id: batchId },
      include: {
        expense: { select: { id: true, description: true, amount_base: true } },
        settlement: { select: { id: true, amount_base: true } }
      },
      orderBy: { row_number: 'asc' }
    });

    return res.json({ anomalies });
  } catch (error) {
    console.error('Fetch batch report error:', error);
    return res.status(500).json({ error: 'Error fetching import report' });
  }
});

// Get all anomalies for a group (useful for review UI)
router.get('/groups/:id/anomalies', authenticateToken, async (req, res) => {
  const groupId = parseInt(req.params.id);

  if (isNaN(groupId)) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  try {
    const anomalies = await prisma.importAnomaly.findMany({
      where: {
        batch: { group_id: groupId }
      },
      include: {
        batch: true
      },
      orderBy: { row_number: 'asc' }
    });

    return res.json({ anomalies });
  } catch (error) {
    console.error('Fetch group anomalies error:', error);
    return res.status(500).json({ error: 'Error fetching anomalies' });
  }
});

export default router;
