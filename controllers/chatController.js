import Chat from '../models/chatModel.js';
import Message from '../models/messageModel.js';
import { getIO } from '../socket/socketHandler.js';


export const getChats = async (req, res) => {
  try {
    const userId = req.userId;

    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'name')
      .populate({
        path: 'lastMessage',
        populate: { path: 'sender', select: 'name' },
      })
      .sort({ updatedAt: -1 });

    res.status(200).json({ success: true, data: chats, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch chats', requestId: req.requestId });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Verify user is participant in chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const isParticipant = chat.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not a participant in this chat' });
    }

    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'name')
      .populate('receiver', 'name')
      .sort({ createdAt: 1 });

    // Mark messages as read for current user
    await Message.updateMany(
      { chat: chatId, receiver: userId, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, data: messages, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch messages', requestId: req.requestId });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { receiverId, chatId, content, rideId } = req.body;
    const senderId = req.userId;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message cannot be empty' });
    }

    // Create or get chat
    let chat;
    if (chatId) {
      chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({ success: false, message: 'Chat not found' });
      }

      const isParticipant = chat.participants.some((p) => p.toString() === senderId);
      if (!isParticipant) {
        return res.status(403).json({ success: false, message: 'Not a participant in this chat' });
      }
    } else {
      // Create new chat if doesn't exist
      chat = await Chat.findOne({
        participants: { $all: [senderId, receiverId] },
      });

      if (!chat) {
        chat = new Chat({
          participants: [senderId, receiverId],
          rideId: rideId || null,
        });
        await chat.save();
      }
    }

    // Create message
    const message = new Message({
      chat: chat._id,
      sender: senderId,
      receiver: receiverId,
      rideId: rideId || null,
      content: content.trim(),
    });

    await message.save();
    await message.populate('sender', 'name');
    await message.populate('receiver', 'name');

    // Update chat's lastMessage and updatedAt
    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    // Emit socket event for real-time delivery
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${receiverId}`).emit('receive-message', message);
        io.to(`user:${senderId}`).emit('receive-message', message);
      }
    } catch (socketErr) {
      console.error('Failed to emit chat message socket event:', socketErr);
    }

    res.status(201).json({ success: true, data: message, message: 'Message sent successfully', requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to send message', requestId: req.requestId });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.userId;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }

    // Only receiver can mark as read
    if (message.receiver.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Can only mark your own messages as read' });
    }

    message.isRead = true;
    await message.save();

    res.status(200).json({ success: true, data: message, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to mark message as read', requestId: req.requestId });
  }
};

export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Verify user is participant
    const isParticipant = chat.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Not a participant in this chat' });
    }

    // Delete all messages in chat
    await Message.deleteMany({ chat: chatId });

    // Delete chat
    await Chat.findByIdAndDelete(chatId);

    res.status(200).json({ success: true, message: 'Chat deleted successfully', requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete chat', requestId: req.requestId });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.userId;

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      isRead: false,
    });

    res.status(200).json({ success: true, data: { unreadCount }, requestId: req.requestId });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch unread count', requestId: req.requestId });
  }
};
