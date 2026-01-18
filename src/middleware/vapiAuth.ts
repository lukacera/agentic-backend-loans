import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Verify Vapi webhook requests using API key or signature
 */
export const verifyVapiWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;

  if (!vapiSecret) {
    // If no secret configured, allow (development mode)
    console.warn(
      '⚠️ VAPI_WEBHOOK_SECRET not configured - webhook verification disabled'
    );
    next();
    return;
  }

  // Option 1: Check for API key in header
  const apiKey = req.headers['x-vapi-secret'] as string;
  if (apiKey && apiKey === vapiSecret) {
    next();
    return;
  }

  // Option 2: Check for signature (HMAC)
  const signature = req.headers['x-vapi-signature'] as string;
  if (signature) {
    try {
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', vapiSecret)
        .update(payload)
        .digest('hex');

      if (
        crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        )
      ) {
        next();
        return;
      }
    } catch {
      // Signature comparison failed
    }
  }

  console.warn('⚠️ Vapi webhook authentication failed');
  res.status(401).json({
    error: 'Unauthorized webhook request'
  });
};
