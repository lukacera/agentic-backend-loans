import Imap from 'imap';
import { simpleParser } from 'mailparser';

export interface FetchedEmail {
  from: string;
  subject: string;
  body: string;
  date: Date;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

// Global connection state
let imapConnection: Imap | null = null;
let isConnected = false;

function createIMAPConnection(): Imap {
  const imap = new Imap({
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    tls: true,
    tlsOptions: { 
      rejectUnauthorized: false 
    },
    authTimeout: 10000,
    connTimeout: 15000
  });

  // Setup event handlers
  imap.once('ready', () => {
    console.log('IMAP connection ready');
    isConnected = true;
  });

  imap.once('error', (err: Error) => {
    console.error('IMAP connection error:', err);
    isConnected = false;
  });

  imap.once('end', () => {
    console.log('IMAP connection ended');
    isConnected = false;
  });

  return imap;
}

async function connectToIMAP(): Promise<Imap> {
  if (isConnected && imapConnection) {
    console.log('Reusing existing IMAP connection');
    return imapConnection;
  }

  if (!imapConnection) {
    imapConnection = createIMAPConnection();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('IMAP connection timeout'));
    }, 15000);

    imapConnection!.once('ready', () => {
      clearTimeout(timeout);
      isConnected = true;
      resolve(imapConnection!);
    });

    imapConnection!.once('error', (err: Error) => {
      clearTimeout(timeout);
      isConnected = false;
      reject(err);
    });

    if (!isConnected) {
      imapConnection!.connect();
    } else {
      clearTimeout(timeout);
      resolve(imapConnection!);
    }
  });
}

async function parseEmailMessage(emailData: Buffer, seqno: number): Promise<FetchedEmail> {
  const parsed = await simpleParser(emailData);
  
  return {
    messageId: parsed.messageId || `unknown-${seqno}-${Date.now()}`,
    subject: parsed.subject || 'No Subject',
    from: parsed.from?.text || 'Unknown Sender',
    body: parsed.text || '',
    date: parsed.date || new Date(),
    inReplyTo: parsed.inReplyTo || undefined,
    references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []
  };
}

async function fetchUnreadEmails(imap: Imap): Promise<FetchedEmail[]> {
  return new Promise((resolve, reject) => {
    imap.openBox('INBOX', false, (err: any, box: any) => {
      if (err) {
        reject(err);
        return;
      }

      // Search for unread emails
      imap.search(['UNSEEN'], (searchErr: any, results: any) => {
        if (searchErr) {
          reject(searchErr);
          return;
        }

        if (!results || results.length === 0) {
          resolve([]);
          return;
        }

        console.log(`Found ${results.length} unread emails`);

        // Fetch the emails
        const fetch = imap.fetch(results, {
          bodies: '',
          struct: true,
          markSeen: true // Mark as read after fetching
        });

        const emails: FetchedEmail[] = [];
        let processedCount = 0;

        fetch.on('message', (msg: any, seqno: any) => {
          let emailData: Buffer = Buffer.alloc(0);

          msg.on('body', (stream: any) => {
            stream.on('data', (chunk: any) => {
              emailData = Buffer.concat([emailData, chunk]);
            });

            stream.once('end', async () => {
              try {
                const fetchedEmail = await parseEmailMessage(emailData, seqno);
                emails.push(fetchedEmail);
              } catch (parseError) {
                console.error('Error parsing email:', parseError);
              } finally {
                processedCount++;
                
                if (processedCount === results.length) {
                  resolve(emails);
                }
              }
            });
          });

          msg.once('end', () => {
            // Message processing complete
          });
        });

        fetch.once('error', (fetchErr: any) => {
          reject(fetchErr);
        });

        fetch.once('end', () => {
          if (processedCount === results.length) {
            resolve(emails);
          }
        });
      });
    });
  });
}

// Main export function that poller.ts expects
export async function fetchEmails(): Promise<FetchedEmail[]> {
  try {
    const imap = await connectToIMAP();
    return await fetchUnreadEmails(imap);
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
}