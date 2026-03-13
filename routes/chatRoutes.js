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
import { validateObjectIdParam } from '../middleware/validateObjectId.js';
import { validateRequest } from '../middleware/validateRequest.js';
import { sendMessageSchema } from '../validation/schemas.js';

const router = express.Router();

// Get user's chats (protected)
router.get('/me', authMiddleware, getChats);

// Get unread message count (protected)
router.get('/unread', authMiddleware, getUnreadCount);

// Get messages in a chat (protected)
router.get('/:chatId', authMiddleware, validateObjectIdParam('chatId'), getMessages);

// Send message (protected)
router.post('/', authMiddleware, validateRequest(sendMessageSchema), sendMessage);

// Mark message as read (protected)
router.put('/:messageId/read', authMiddleware, validateObjectIdParam('messageId'), markAsRead);

// Delete chat (protected)
router.delete('/:chatId', authMiddleware, validateObjectIdParam('chatId'), deleteChat);

export default router;
