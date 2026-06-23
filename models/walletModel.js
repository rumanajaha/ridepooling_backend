import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  description: {
    type: String,
    required: true,
  },
  rideId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride',
  },
  relatedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'completed',
  },
  transactionDate: {
    type: Date,
    default: Date.now,
  },
});

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    transactions: [transactionSchema],
  },
  { timestamps: true }
);

// Create wallet automatically when user registers
walletSchema.statics.createWallet = async function (userId) {
  try {
    // Atomic upsert to avoid race conditions creating duplicate wallets
    const wallet = await this.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, balance: 0 } },
      { new: true, upsert: true }
    );
    return wallet;
  } catch (error) {
    throw new Error('Failed to create wallet: ' + error.message);
  }
};

// Add credit (earning)
walletSchema.methods.addCredit = async function (amount, description, rideId, relatedUserId, session = null) {
  this.balance += amount;
  this.transactions.push({
    type: 'credit',
    amount,
    description,
    rideId,
    relatedUserId,
    status: 'completed',
  });
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
  return this;
};

// Deduct amount (payment)
walletSchema.methods.deductAmount = async function (amount, description, rideId, relatedUserId, session = null) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance');
  }
  this.balance -= amount;
  this.transactions.push({
    type: 'debit',
    amount,
    description,
    rideId,
    relatedUserId,
    status: 'completed',
  });
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
  return this;
};

export default mongoose.model('Wallet', walletSchema);
