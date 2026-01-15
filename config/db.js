import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ridepooling';
    
    console.log('🔄 Attempting MongoDB connection...');
    console.log('URI (first 50 chars):', mongoURI.substring(0, 50) + '...');
    
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    
    console.log('✅ MongoDB connected successfully');
    console.log('Connected to:', mongoose.connection.host);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Error code:', error.code);
    console.error('Full error:', error);
    
    // Provide helpful debugging info
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n⚠️  DNS Resolution failed. Possible causes:');
      console.error('1. Check your internet connection');
      console.error('2. Verify MongoDB URI is correct in .env');
      console.error('3. Check MongoDB Atlas IP whitelist includes your current IP');
      console.error('4. Try adding your IP (0.0.0.0/0) to MongoDB Atlas Network Access');
    } else if (error.message.includes('authentication failed')) {
      console.error('\n⚠️  Authentication failed. Check your MongoDB username/password in .env');
    }
    
    process.exit(1);
  }
};

export default connectDB;
