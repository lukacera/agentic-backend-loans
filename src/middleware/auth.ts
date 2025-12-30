import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';
import { User, IUser } from '../models/User.js';
import { Application } from '../models/Application.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

// Configure Auth0 JWT verification
const checkJwt = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_DOMAIN,
  tokenSigningAlg: 'RS256'
});

/**
 * Middleware that verifies JWT and attaches/creates user
 * Handles first-login user creation and application migration
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  console.log("VERIFYING AUTH TOKEN");
  try {
    // First, verify the JWT
    await new Promise<void>((resolve, reject) => {
      checkJwt(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const authPayload = (req as any).auth?.payload;
    if (!authPayload?.sub) {
      res.status(401).json({
        success: false,
        error: 'Invalid token: missing sub claim'
      });
      return;
    }

    const auth0Id = authPayload.sub as string;
    const email = authPayload.email as string | undefined;

    // Find or create user
    let user = await User.findOne({ auth0Id });

    if (!user) {
      
      // First login - create user
      if (!email) {
        res.status(401).json({
          success: false,
          error: 'Email not provided in token'
        });
        return;
      }

      user = await User.create({
        auth0Id,
        email,
        emailVerified: (authPayload.email_verified as boolean) || false,
        name: (authPayload.name as string) || undefined,
        lastLoginAt: new Date()
      });

      console.log(`✅ New user created: ${email} (${auth0Id})`);

      // Migrate existing applications (async, don't block response)
      migrateUserApplications(user._id.toString(), email).catch((err) => {
        console.error('❌ Application migration error:', err);
      });
    } else {
      // Update last login
      user.lastLoginAt = new Date();
      await user.save();
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Authentication error:', error);

    if ((error as any)?.status === 401) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

/**
 * Optional auth - attaches user if token present, continues if not
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      checkJwt(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const authPayload = (req as any).auth?.payload;
    if (authPayload?.sub) {
      const user = await User.findOne({ auth0Id: authPayload.sub });
      if (user) {
        req.user = user;
      }
    }
  } catch {
    // Token invalid, continue without user
  }

  next();
};

/**
 * Migrate existing applications to new user on first login
 */
async function migrateUserApplications(
  userId: string,
  email: string
): Promise<void> {
  // Find applications without an owner that match user's email
  const applicationsToMigrate = await Application.find({
    ownerId: { $exists: false },
    $or: [
      { 'applicantData.email': email },
      { 'applicantData.email': { $regex: new RegExp(`^${email}$`, 'i') } }
    ]
  });

  if (applicationsToMigrate.length > 0) {
    await Application.updateMany(
      { _id: { $in: applicationsToMigrate.map((a) => a._id) } },
      { $set: { ownerId: userId } }
    );

    console.log(
      `✅ Migrated ${applicationsToMigrate.length} applications to user ${email}`
    );
  }
}
