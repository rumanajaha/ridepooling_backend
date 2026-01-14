import express from 'express';
import authMiddleware from '../middleware/authMiddleware.js';
import {
  getChats,
  getMessages,
  sendMessage,
  markAsRead,
  deleteChat,
  getUnreadCount,
} from '../controllers/chatController.js';

const router = express.Router();

// Get user's chats (protected)
router.get('/me', authMiddleware, getChats);

// Get unread message count (protected)
router.get('/unread', authMiddleware, getUnreadCount);

// Get messages in a chat (protected)
router.get('/:chatId', authMiddleware, getMessages);

// Send message (protected)
router.post('/', authMiddleware, sendMessage);

// Mark message as read (protected)
router.put('/:messageId/read', authMiddleware, markAsRead);

// Delete chat (protected)
router.delete('/:chatId', authMiddleware, deleteChat);

export default router;
