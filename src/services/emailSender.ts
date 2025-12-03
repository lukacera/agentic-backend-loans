import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

export async function sendEmail({ 
  to, 
  subject, 
  text, 
  html, 
  from, 
  attachments 
}: { 
  to: string[], 
  subject: string, 
  text?: string, 
  html?: string, 
  from?: string, 
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: string | Buffer;
    contentType?: string;
    encoding?: string;
  }> 
}) {

  // Create transporter using SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,       // e.g., smtp.gmail.com
    port: Number(process.env.SMTP_PORT) || 587, // 465 for SSL, 587 for TLS
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
    auth: {
      user: process.env.SMTP_USER,     // your email
      pass: process.env.SMTP_PASS      // your email password or app password
    }
  });

  const mailOptions = {
    from: from || `team@salestorvely.com`,
    to: to.join(', '),   // Nodemailer wants a comma-separated string
    subject,
    text,
    html,
    attachments
  };

  console.log('Sending email with the following details:');
  console.log('- To:', mailOptions.to);
  console.log('- Subject:', mailOptions.subject);
  console.log('- Attachments count:', mailOptions.attachments?.length || 0);
  if (mailOptions.attachments && mailOptions.attachments.length > 0) {
    mailOptions.attachments.forEach((att, index) => {
      console.log(`  Attachment ${index + 1}: ${att.filename} (${att.contentType || 'unknown type'})`);
    });
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    console.log('Accepted recipients:', info.accepted);
    if (info.rejected && info.rejected.length > 0) {
      console.warn('Rejected recipients:', info.rejected);
    }
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}
