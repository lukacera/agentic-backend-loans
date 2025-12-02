import { fetchEmails } from './emailFetcher';
import { handleEmail } from './emailHandler';
import { sendEmail } from './emailSender';

const POLL_INTERVAL = Number(process.env.POLL_INTERVAL) || 20000; // 20 seconds

async function pollEmails() {
  try {
    console.log('Polling inbox for new emails...');

    const emails = await fetchEmails(); // fetch unread emails from GoDaddy
    console.log(`Fetched ${emails.length} emails`);
    for (const email of emails) {
      console.log(`Processing email from: ${email.from}, subject: ${email.subject}`);

      // GPT generates reply and optional flags
      const { reply, flagForReview } = await handleEmail(email);

      if (flagForReview) {
        console.log('Email flagged for human review:', email.subject);
        continue; // skip auto-reply
      }

      // Send reply
      await sendEmail({
        to: [email.from],
        subject: `Re: ${email.subject}`,
        text: reply,
        html: reply.replace(/\n/g, '<br>')
      });

      console.log('Reply sent for email:', email.subject);
    }
  } catch (err) {
    console.error('Error during polling:', err);
  } finally {
    // Schedule next poll
    setTimeout(pollEmails, POLL_INTERVAL);
  }
}

export default pollEmails;