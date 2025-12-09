/**
 * Format a date to a human-readable short format
 * Example: "Dec 8, 2024"
 */
const formatDate = (date: Date | string | undefined): string => {
  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Format currency to readable format
 * Example: $350,000
 */
const formatCurrency = (amount: number): string => {
  return `$${amount.toLocaleString('en-US')}`;
};

/**
 * Format banks array to readable string
 * Example: "Bank of America (submitted, Dec 8 2024), Chase (rejected, Dec 9 2024)"
 */
const formatBanks = (banks: any[]): string => {
  if (!banks || banks.length === 0) return '';

  const formatted = banks.map(bank => {
    const bankName = typeof bank.bank === 'object' && bank.bank?.name
      ? bank.bank.name
      : bank.bank;
    return `${bankName} (${bank.status}, ${formatDate(bank.submittedAt)})`;
  }).join(', ');

  return ` | Banks: [${formatted}]`;
};

/**
 * Format offers array to readable string
 * Example: "Bank A - 60mo @ 6.5% APR, $978/mo, $5,000 down (pending)"
 */
const formatOffers = (offers: any[]): string => {
  if (!offers || offers.length === 0) return '';

  const formatted = offers.map(offer => {
    const bankName = typeof offer.bank === 'object' && offer.bank?.name
      ? offer.bank.name
      : offer.bank;
    const details = offer.offerDetails;

    return `${bankName} - ${details.repaymentTermMonths}mo @ ${details.annualInterestRate}% APR, ${formatCurrency(details.monthlyPayment)}/mo, ${formatCurrency(details.downPaymentRequired)} down (${offer.status})`;
  }).join('; ');

  return ` | Offers: [${formatted}]`;
};

/**
 * Format document arrays to readable string
 */
const formatDocuments = (
  signedDocs: any[],
  unsignedDocs: any[],
  userDocs: any[]
): string => {
  let result = '';

  if (signedDocs && signedDocs.length > 0) {
    const latestSignedDate = signedDocs.reduce((latest, doc) => {
      const docDate = doc.signedAt || doc.uploadedAt;
      return !latest || (docDate && new Date(docDate) > new Date(latest))
        ? docDate
        : latest;
    }, null);

    result += ` | Signed Documents: ${signedDocs.length} file${signedDocs.length > 1 ? 's' : ''}`;
    if (latestSignedDate) {
      result += ` (${formatDate(latestSignedDate)})`;
    }
  }

  if (unsignedDocs && unsignedDocs.length > 0) {
    result += ` | Unsigned Documents: ${unsignedDocs.length} file${unsignedDocs.length > 1 ? 's' : ''} (awaiting signature)`;
  }

  if (userDocs && userDocs.length > 0) {
    const docTypes = userDocs.map(doc => doc.fileType).join(', ');
    result += ` | User Provided: [${docTypes}]`;
  }

  return result;
};

/**
 * Format signing information to readable string
 */
const formatSigningInfo = (
  signingStatus: string,
  signedBy?: string,
  signedDate?: Date | string
): string => {
  let result = ` | Signing Status: ${signingStatus}`;

  if (signingStatus === 'completed' && signedBy) {
    result += ` by ${signedBy}`;
    if (signedDate) {
      result += ` on ${formatDate(signedDate)}`;
    }
  }

  return result;
};

/**
 * Convert application object to human-readable single-line string
 *
 * This function formats an SBA application into a concise, readable format
 * suitable for AI agent consumption via tool responses.
 *
 * @param application - The application object (can be plain object or Mongoose document)
 * @returns A human-readable single-line string with all key application information
 */
export const formatApplicationStatus = (application: any): string => {
  // Handle Mongoose documents
  const app = typeof application?.toObject === 'function'
    ? application.toObject()
    : application;

  // Core applicant information (always present)
  const applicantInfo = `Applicant: ${app.applicantData.name} | Business: ${app.applicantData.businessName} | Phone: ${app.applicantData.businessPhoneNumber}`;

  // Financial information (always present)
  const financialInfo = ` | Credit Score: ${app.applicantData.creditScore} | Annual Revenue: ${formatCurrency(app.applicantData.annualRevenue)} | Year Founded: ${app.applicantData.yearFounded}`;

  // Status information (always present)
  const statusInfo = ` | Application Status: ${app.status}`;

  // Signing information
  const signingInfo = formatSigningInfo(
    app.signingStatus || 'not_started',
    app.signedBy,
    app.signedDate
  );

  // Banks (conditional)
  const banksInfo = formatBanks(app.banks || []);

  // Offers (conditional)
  const offersInfo = formatOffers(app.offers || []);

  // Documents (conditional)
  const documentsInfo = formatDocuments(
    app.signedDocuments || [],
    app.unsignedDocuments || [],
    app.userProvidedDocuments || []
  );

  // Email tracking (conditional)
  const emailInfo = app.emailSentAt
    ? ` | Email Sent: ${formatDate(app.emailSentAt)}`
    : '';

  // Timestamps (always present)
  const timestampInfo = ` | Created: ${formatDate(app.createdAt)} | Last Updated: ${formatDate(app.updatedAt)}`;

  // Combine all sections
  return applicantInfo +
         financialInfo +
         statusInfo +
         signingInfo +
         banksInfo +
         offersInfo +
         documentsInfo +
         emailInfo +
         timestampInfo;
};
