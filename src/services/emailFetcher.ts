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
  threadId?: string;
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
    isConnected = true;
  });

  imap.once('error', (err: Error) => {
    console.error('IMAP connection error:', err);
    isConnected = false;
  });

  imap.once('end', () => {
    isConnected = false;
  });

  return imap;
}

async function connectToIMAP(): Promise<Imap> {
  if (isConnected && imapConnection) {
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

// Helper function to compute thread ID from email headers
function computeThreadId(messageId: string, inReplyTo?: string, references?: string[]): string {
  // Use the first reference as thread ID, or inReplyTo, or messageId for new threads
  if (inReplyTo) {
    console.log(`Using inReplyTo as thread ID: ${inReplyTo}`);
    return inReplyTo.replace(/[<>]/g, '');
  }
  if (references && references.length > 0) {
    console.log(`Using first reference as thread ID: ${references[0]}`);
    return references[0].replace(/[<>]/g, '');
  }
  
  return messageId.replace(/[<>]/g, '');
}

async function parseEmailMessage(emailData: Buffer, seqno: number): Promise<FetchedEmail> {
  const parsed = await simpleParser(emailData);
  
  const messageId = parsed.messageId || `unknown-${seqno}-${Date.now()}`;
  const inReplyTo = parsed.inReplyTo || undefined;
  const references = Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [];
  
  return {
    messageId,
    subject: parsed.subject || 'No Subject',
    from: parsed.from?.text || 'Unknown Sender',
    body: parsed.text || '',
    date: parsed.date || new Date(),
    inReplyTo,
    references,
    threadId: computeThreadId(messageId, inReplyTo, references)
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
      imap.search(['UNSEEN'], (searchErr: any, results: number[]) => {        
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

// Fetch all emails with specific thread ID
export async function fetchEmailsByThreadId(threadId: string): Promise<FetchedEmail[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const imap = await connectToIMAP();
      
      imap.openBox('INBOX', true, (err: any, box: any) => { // true = read-only
        if (err) {
          reject(err);
          return;
        }

        // Search for emails with this thread ID in message-id, references, or in-reply-to
        const searchCriteria = [['OR', ['HEADER', 'MESSAGE-ID', `<${threadId}>`], ['OR', ['HEADER', 'REFERENCES', threadId], ['HEADER', 'IN-REPLY-TO', `<${threadId}>`]]]];

        imap.search(searchCriteria, (searchErr: any, results: any) => {
          if (searchErr) {
            reject(searchErr);
            return;
          }

          if (!results || results.length === 0) {
            resolve([]);
            return;
          }

          console.log(`Found ${results.length} emails in thread: ${threadId}`);

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true
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
                  console.error('Error parsing thread email:', parseError);
                } finally {
                  processedCount++;
                  
                  if (processedCount === results.length) {
                    // Sort by date for chronological order
                    emails.sort((a, b) => a.date.getTime() - b.date.getTime());
                    resolve(emails);
                  }
                }
              });
            });
          });

          fetch.once('error', (fetchErr: any) => {
            reject(fetchErr);
          });

          fetch.once('end', () => {
            if (processedCount === results.length) {
              emails.sort((a, b) => a.date.getTime() - b.date.getTime());
              resolve(emails);
            }
          });
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Main export function that poller.ts expects
export async function fetchEmails(): Promise<FetchedEmail[]> {
  try {
    const imap = await connectToIMAP();
    const unreadEmails = await fetchUnreadEmails(imap);
    
    return unreadEmails;
  } catch (error) {
    console.error('Error fetching emails:', error);
    throw error;
  }
}