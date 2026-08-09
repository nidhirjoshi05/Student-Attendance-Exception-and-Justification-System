import { Router } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import store from '../data/store.js';
import { authenticateToken } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

// GET /api/notes
router.get('/', authenticateToken, (req, res) => {
  let notes = store.notes;

  if (req.query.requestId) {
    // Filter by request if needed
    const request = store.requests.get(req.query.requestId);
    if (request) {
      notes = notes.filter(n => n.subject === request.subject);
    }
  }

  res.json(notes);
});

// POST /api/notes - Faculty upload notes
router.post('/', authenticateToken, upload.array('files', 5), (req, res) => {
  if (!['faculty', 'hod', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Only faculty can upload notes' });
  }

  const { title, subject, description, topics } = req.body;

  if (!title || !subject || !description) {
    return res.status(400).json({ message: 'Title, subject, and description are required' });
  }

  const note = {
    id: uuid(),
    title,
    subject,
    description,
    facultyId: req.user.id,
    facultyName: req.user.name,
    topics: topics ? topics.split(',').map(t => t.trim()).filter(Boolean) : [],
    createdAt: new Date().toISOString(),
  };

  store.notes.push(note);

  // Notify students who had approved requests for this subject
  for (const [, request] of store.requests) {
    if (request.subject === subject && request.status === 'approved') {
      const notifs = store.notifications.get(request.studentId) || [];
      notifs.unshift({
        id: uuid(),
        userId: request.studentId,
        title: 'New Notes Available 📚',
        message: `${req.user.name} uploaded notes for ${subject}: "${title}".`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      store.notifications.set(request.studentId, notifs);
    }
  }

  res.status(201).json(note);
});

export default router;
