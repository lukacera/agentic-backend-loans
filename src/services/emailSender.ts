import dotenv from "dotenv";
import sgMail from '@sendgrid/mail';

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
      from: from || `team@salestorvely.com`,
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
