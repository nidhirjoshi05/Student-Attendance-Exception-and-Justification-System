import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['student', 'faculty', 'hod', 'admin'],
    required: true,
  },
  department: {
    type: String,
    default: 'Computer Science',
  },
  studentId: {
    type: String,
  },
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
