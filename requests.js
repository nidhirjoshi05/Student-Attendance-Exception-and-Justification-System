import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import store from '../data/store.js';
import { authenticateToken } from '../middleware/auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure uploads directory exists
const uploadDir = join(__dirname, '..', 'uploads');
try { mkdirSync(uploadDir, { recursive: true }); } catch(e) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router = Router();

// GET /api/requests - List requests (role-aware)
router.get('/', authenticateToken, (req, res) => {
  let results = Array.from(store.requests.values());

  if (req.user.role === 'student') {
    results = results.filter(r => r.studentId === req.user.id);
  }

  // Sort by createdAt desc
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json(results);
});

// GET /api/requests/:id
router.get('/:id', authenticateToken, (req, res) => {
  const request = store.requests.get(req.params.id);
  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  // Students can only view their own
  if (req.user.role === 'student' && request.studentId !== req.user.id) {
    return res.status(403).json({ message: 'Access denied' });
  }

  res.json(request);
});

// POST /api/requests - Create new exception request
router.post('/', authenticateToken, upload.array('documents', 5), (req, res) => {
  if (req.user.role !== 'student') {
    return res.status(403).json({ message: 'Only students can submit requests' });
  }

  const { subject, date, reason, description } = req.body;

  if (!subject || !date || !reason || !description) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const id = uuid();
  const documents = req.files ? req.files.map(f => f.filename) : [];

  const request = {
    id,
    studentId: req.user.id,
    studentName: req.user.name,
    subject,
    date,
    reason,
    description,
    status: 'pending',
    documents,
    remarks: '',
    createdAt: new Date().toISOString(),
  };

  store.requests.set(id, request);

  // Notify faculty
  for (const [, user] of store.users) {
    if (user.role === 'faculty') {
      const notifs = store.notifications.get(user.id) || [];
      notifs.unshift({
        id: uuid(),
        userId: user.id,
        title: 'New Exception Request',
        message: `${req.user.name} submitted an exception request for ${subject}.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      store.notifications.set(user.id, notifs);
    }
  }

  res.status(201).json(request);
});

// PUT /api/requests/:id/review - Faculty approve/reject
router.put('/:id/review', authenticateToken, (req, res) => {
  if (!['faculty', 'hod', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only faculty/HOD can review requests' });
  }

  const request = store.requests.get(req.params.id);
  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  const { status, remarks } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected' });
  }

  request.status = status;
  request.remarks = remarks || '';
  request.reviewedBy = req.user.id;
  request.reviewedAt = new Date().toISOString();

  // Update attendance if approved
  if (status === 'approved') {
    const attendance = store.attendance.get(request.studentId);
    if (attendance) {
      const record = attendance.find(a => a.subjectName === request.subject);
      if (record) {
        record.present += 1;
      }
    }
  }

  // Notify student
  const studentNotifs = store.notifications.get(request.studentId) || [];
  studentNotifs.unshift({
    id: uuid(),
    userId: request.studentId,
    title: status === 'approved' ? 'Request Approved ✅' : 'Request Rejected ❌',
    message: `Your exception request for ${request.subject} (${new Date(request.date).toLocaleDateString()}) has been ${status}.${remarks ? ' Remarks: ' + remarks : ''}`,
    read: false,
    createdAt: new Date().toISOString(),
  });
  store.notifications.set(request.studentId, studentNotifs);

  res.json(request);
});

// PUT /api/requests/:id/escalate - Escalate to HOD
router.put('/:id/escalate', authenticateToken, (req, res) => {
  if (!['faculty', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only faculty can escalate requests' });
  }

  const request = store.requests.get(req.params.id);
  if (!request) {
    return res.status(404).json({ message: 'Request not found' });
  }

  request.status = 'escalated';
  request.escalatedBy = req.user.id;
  request.escalatedAt = new Date().toISOString();

  // Notify HOD
  for (const [, user] of store.users) {
    if (user.role === 'hod') {
      const notifs = store.notifications.get(user.id) || [];
      notifs.unshift({
        id: uuid(),
        userId: user.id,
        title: 'Escalated Request',
        message: `A request from ${request.studentName} for ${request.subject} has been escalated for your review.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      store.notifications.set(user.id, notifs);
    }
  }

  res.json(request);
});

export default router;
