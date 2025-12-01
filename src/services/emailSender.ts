import dotenv from "dotenv";
import sgMail from '@sendgrid/mail';
import { EmailMessage, EmailDraft } from '../types';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function sendEmail({ to, subject, text, html, from, attachments }: 
  { to: string[], subject: string, text?: string, html?: string, from?: string, attachments?: Array<{
    content: string;
    filename: string;
    type: string;
    disposition: string;
  }> }) {

    const msg = {
      from: from || `team@torvely.com`,
      to,
      subject,
      text,
      html,
      attachments
    };

    return sgMail
      //@ts-ignore
      .send(msg)
      .then(() => {
        console.log('Email sent successfully')
      })
      .catch((error) => {
        if (error.response) {
          if (error.response.body?.errors) {
            console.error('Specific Errors:');
            error.response.body.errors.forEach((err: any, index: number) => {
              console.error(`Error ${index + 1}:`, JSON.stringify(err, null, 2));
            });
          }
        }
        console.error('=== END ERROR DETAILS ===');
        throw error; // Re-throw so calling code knows it failed
      })
}

// Initialize email service (for SendGrid, just need to set API key)
export const initializeEmailService = (): void => {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('⚠️  SendGrid API key not found. Please set SENDGRID_API_KEY environment variable.');
    return;
  }
  
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid email service initialized successfully');
};

// Send email using EmailMessage object
export const sendEmailMessage = async (
  email: EmailMessage,
  actualRecipient?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const recipient = actualRecipient || email.to[0];
    
    await sendEmail({
      to: [recipient],
      subject: email.subject,
      html: email.body,
      text: email.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      from: email.from
    });
    
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// Send email using EmailDraft object
export const sendEmailDraft = async (
  draft: EmailDraft,
  actualRecipient?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
  try {
    const recipient = actualRecipient || draft.to[0];
    
    await sendEmail({
      to: [recipient],
      subject: draft.subject,
      html: draft.body,
      text: draft.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      from: process.env.EMAIL_FROM || 'noreply@shiny-panda.com'
    });
    
    return { success: true };
  } catch (error) {
    console.error('Email draft sending error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

// Test email connection
export const testEmailConnection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!process.env.SENDGRID_API_KEY) {
    return { success: false, error: 'SendGrid API key not configured' };
  }

  try {
    // For SendGrid, we can't really test connection without sending an email
    // So we just check if API key is configured
    return { success: true };
  } catch (error) {
    console.error('SendGrid connection test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
};