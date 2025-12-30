import { Request, Response, NextFunction } from 'express';
import { Application } from '../models/Application.js';
import { ChatSession } from '../models/ChatSession.js';

/**
 * Middleware to verify user owns the application
 */
export const requireApplicationOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const applicationId = req.params.applicationId || req.params.id;
  const userId = req.user?._id?.toString();

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (!applicationId) {
    next();
    return;
  }

  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      res.status(404).json({
        success: false,
        error: 'Application not found'
      });
      return;
    }

    // Check ownership (applications without ownerId are legacy/public for now)
    if (application.ownerId && application.ownerId.toString() !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied: You do not own this application'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('❌ Ownership check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify ownership'
    });
  }
};

/**
 * Middleware to verify user owns the chat session
 */
export const requireChatSessionOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const sessionId = req.params.sessionId || req.params.id;
  const userId = req.user?._id?.toString();

  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
    return;
  }

  if (!sessionId) {
    next();
    return;
  }

  try {
    const session = await ChatSession.findOne({ sessionId });

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
      return;
    }

    // Check ownership (sessions without userId are legacy/public for now)
    if (session.userId && session.userId.toString() !== userId) {
      res.status(403).json({
        success: false,
        error: 'Access denied: You do not own this session'
      });
      return;
    }

    next();
  } catch (error) {
    console.error('❌ Session ownership check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify ownership'
    });
  }
};
