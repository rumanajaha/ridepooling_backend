import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Index for quick queries
chatSchema.index({ participants: 1 });
chatSchema.index({ updatedAt: -1 });

const Chat = mongoose.model('Chat', chatSchema);
export default Chat;
