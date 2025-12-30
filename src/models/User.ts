import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  auth0Id: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  lastLoginAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    auth0Id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    name: {
      type: String,
      trim: true
    },
    lastLoginAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

export const User = model<IUser>('User', userSchema);
