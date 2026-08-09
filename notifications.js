import { Router } from 'express';
import store from '../data/store.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

// GET /api/notifications
router.get('/', authenticateToken, (req, res) => {
  const notifs = store.notifications.get(req.user.id) || [];
  res.json(notifs);
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticateToken, (req, res) => {
  const notifs = store.notifications.get(req.user.id) || [];
  const notif = notifs.find(n => n.id === req.params.id);
  if (notif) {
    notif.read = true;
  }
  res.json({ message: 'Marked as read' });
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticateToken, (req, res) => {
  const notifs = store.notifications.get(req.user.id) || [];
  notifs.forEach(n => { n.read = true; });
  res.json({ message: 'All marked as read' });
});

export default router;
