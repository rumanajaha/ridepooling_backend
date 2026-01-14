import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    chat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for quick queries
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ receiver: 1 });
messageSchema.index({ isRead: 1 });

const Message = mongoose.model('Message', messageSchema);
export default Message;
