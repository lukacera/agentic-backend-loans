import { v4 as uuidv4 } from 'uuid';
import { ChatSession, IChatSessionDocument } from '../models/ChatSession.js';
import { ChatMessage, SBAApplicationData } from '../types/index.js';
import websocketService from './websocket.js';
import {
  CHECKBOX_GROUPS,
  CHECKBOX_GROUPS_413,
  getGroupCheckboxes,
  getGroupCheckboxes413
} from './pdfFormProcessor.js';
import { Application } from '../models/Application.js';
import {
  calculateSBAEligibilityForBuyer,
  calculateSBAEligibilityForOwner,
  createDraft
} from './applicationService.js';
import { generatePresignedUrl } from './s3Service.js';

// ==============================
// SESSION MANAGEMENT
// ==============================

/**
 * Create a new chat session
 */
export const createSession = async (): Promise<IChatSessionDocument> => {
  const sessionId = uuidv4();
  const session = new ChatSession({
    sessionId,
    messages: [],
    userData: {}
  });
  await session.save();
  console.log(`✅ Created chat session: ${sessionId}`);
  return session;
};

/**
 * Get a chat session by ID
 */
export const getSession = async (sessionId: string): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOne({ sessionId });
};

/**
 * Add a message to a chat session
 */
export const addMessage = async (
  sessionId: string,
  message: ChatMessage
): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $push: { messages: message } },
    { new: true }
  );
};

/**
 * Update user data in a chat session
 */
export const updateUserData = async (
  sessionId: string,
  data: Record<string, any>
): Promise<IChatSessionDocument | null> => {
  // Get current session
  const session = await ChatSession.findOne({ sessionId });
  if (!session) return null;

  // Merge new data with existing userData
  const updatedUserData = {
    ...session.userData,
    ...data,
    updatedAt: new Date()
  };

  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: { userData: updatedUserData } },
    { new: true }
  );
};

/**
 * Link an application to a chat session
 */
export const linkApplication = async (
  sessionId: string,
  applicationId: string
): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: { applicationId } },
    { new: true }
  );
};

/**
 * Delete a chat session
 */
export const deleteSession = async (sessionId: string): Promise<boolean> => {
  const result = await ChatSession.deleteOne({ sessionId });
  return result.deletedCount > 0;
};

// ==============================
// TOOL HANDLERS
// ==============================

interface ToolResult {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Get WebSocket rooms for a session
 */
const getRooms = (sessionId: string): string[] => ['global', sessionId];

/**
 * Handle captureUserName tool
 */
export const handleCaptureUserName = async (
  sessionId: string,
  args: { name?: string }
): Promise<ToolResult> => {
  const { name } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { name });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { userName: name },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Got it! Name "${name ?? ''}" has been captured.`
  };
};

/**
 * Handle captureBusinessName tool
 */
export const handleCaptureBusinessName = async (
  sessionId: string,
  args: { businessName?: string }
): Promise<ToolResult> => {
  const { businessName } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessName });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessName },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Business name "${businessName ?? ''}" has been captured.`
  };
};

/**
 * Handle captureBusinessPhone tool
 */
export const handleCaptureBusinessPhone = async (
  sessionId: string,
  args: { businessPhone?: string }
): Promise<ToolResult> => {
  const { businessPhone } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessPhone });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessPhone },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Business phone captured successfully.'
  };
};

/**
 * Handle captureCreditScore tool
 */
export const handleCaptureCreditScore = async (
  sessionId: string,
  args: { creditScore?: number }
): Promise<ToolResult> => {
  const { creditScore } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { creditScore });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { creditScore },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Credit score captured successfully.'
  };
};

/**
 * Handle captureYearFounded tool
 */
export const handleCaptureYearFounded = async (
  sessionId: string,
  args: { yearFounded?: number }
): Promise<ToolResult> => {
  const { yearFounded } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { yearFounded });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { yearFounded },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Year founded captured successfully.'
  };
};

/**
 * Handle captureUSCitizen tool
 */
export const handleCaptureUSCitizen = async (
  sessionId: string,
  args: { usCitizen?: boolean | string }
): Promise<ToolResult> => {
  const { usCitizen } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { usCitizen });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { usCitizen },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'US citizenship status captured successfully.'
  };
};

/**
 * Handle captureAnnualRevenue tool
 */
export const handleCaptureAnnualRevenue = async (
  sessionId: string,
  args: { annualRevenue?: number }
): Promise<ToolResult> => {
  const { annualRevenue } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { annualRevenue });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { annualRevenue },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Annual revenue captured successfully.'
  };
};

/**
 * Handle captureMonthlyRevenue tool
 */
export const handleCaptureMonthlyRevenue = async (
  sessionId: string,
  args: { monthlyRevenue?: number }
): Promise<ToolResult> => {
  const { monthlyRevenue } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { monthlyRevenue });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { monthlyRevenue },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Monthly revenue captured successfully.'
  };
};

/**
 * Handle captureMonthlyExpenses tool
 */
export const handleCaptureMonthlyExpenses = async (
  sessionId: string,
  args: { monthlyExpenses?: number }
): Promise<ToolResult> => {
  const { monthlyExpenses } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { monthlyExpenses });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { monthlyExpenses },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Monthly expenses captured successfully.'
  };
};

/**
 * Handle captureExistingDebtPayment tool
 */
export const handleCaptureExistingDebtPayment = async (
  sessionId: string,
  args: { existingDebtPayment?: number }
): Promise<ToolResult> => {
  const { existingDebtPayment } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { existingDebtPayment });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { existingDebtPayment },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Existing debt payment captured successfully.'
  };
};

/**
 * Handle captureRequestedLoanAmount tool
 */
export const handleCaptureRequestedLoanAmount = async (
  sessionId: string,
  args: { requestedLoanAmount?: number }
): Promise<ToolResult> => {
  const { requestedLoanAmount } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { requestedLoanAmount });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { requestedLoanAmount },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Requested loan amount captured successfully.'
  };
};

/**
 * Handle captureLoanPurpose tool
 */
export const handleCaptureLoanPurpose = async (
  sessionId: string,
  args: { loanPurpose?: string | string[] }
): Promise<ToolResult> => {
  const { loanPurpose } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { loanPurpose });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { loanPurpose },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Loan purpose captured successfully.'
  };
};

/**
 * Handle capturePurchasePrice tool
 */
export const handleCapturePurchasePrice = async (
  sessionId: string,
  args: { purchasePrice?: number }
): Promise<ToolResult> => {
  const { purchasePrice } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { purchasePrice });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { purchasePrice },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Purchase price captured successfully.'
  };
};

/**
 * Handle captureAvailableCash tool
 */
export const handleCaptureAvailableCash = async (
  sessionId: string,
  args: { availableCash?: number }
): Promise<ToolResult> => {
  const { availableCash } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { availableCash });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { availableCash },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Available cash captured successfully.'
  };
};

/**
 * Handle captureBusinessCashFlow tool
 */
export const handleCaptureBusinessCashFlow = async (
  sessionId: string,
  args: { businessCashFlow?: number }
): Promise<ToolResult> => {
  const { businessCashFlow } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessCashFlow });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessCashFlow },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Business cash flow captured successfully.'
  };
};

/**
 * Handle captureIndustryExperience tool
 */
export const handleCaptureIndustryExperience = async (
  sessionId: string,
  args: { industryExperience?: string }
): Promise<ToolResult> => {
  const { industryExperience } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { industryExperience });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { industryExperience },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Industry experience captured successfully.'
  };
};

/**
 * Handle captureUserTypeNewApplication tool
 */
export const handleCaptureUserTypeNewApplication = async (
  sessionId: string,
  args: { type?: string }
): Promise<ToolResult> => {
  const { type } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { type });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { type },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'User type captured successfully.'
  };
};

/**
 * Handle captureSellingFinancingPercentage tool
 */
export const handleCaptureSellingFinancingPercentage = async (
  sessionId: string,
  args: { sellerFinancingPercentage?: number }
): Promise<ToolResult> => {
  const { sellerFinancingPercentage } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { sellerFinancingPercentage });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { sellerFinancingPercentage },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Seller financing percentage captured successfully.'
  };
};

/**
 * Handle captureIfSellerFinancingOnStandbyExists tool
 */
export const handleCaptureIfSellerFinancingOnStandbyExists = async (
  sessionId: string,
  args: { sellerFinancingOnStandbyExists?: boolean }
): Promise<ToolResult> => {
  const { sellerFinancingOnStandbyExists } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { sellerFinancingOnStandbyExists });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { sellerFinancingOnStandbyExists },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Seller financing on standby existence captured successfully.'
  };
};

/**
 * Handle captureOpenSBAForm tool
 */
export const handleCaptureOpenSBAForm = async (
  sessionId: string,
  args: { formType?: string }
): Promise<ToolResult> => {
  const { formType } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { formType });

  websocketService.broadcast('open-sba-form', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { formType },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Got it! Form type "${formType ?? ''}" has been captured.`
  };
};

/**
 * Handle captureHighlightField tool
 */
export const handleCaptureHighlightField = async (
  sessionId: string,
  args: { field?: string; text?: string; formType?: 'SBA_1919' | 'SBA_413' }
): Promise<ToolResult> => {
  const { field, text, formType } = args;
  const rooms = getRooms(sessionId);

  if (!field) {
    return {
      success: false,
      message: 'Field name is required'
    };
  }

  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  websocketService.broadcast('highlight-fields', {
    sessionId,
    timestamp: new Date().toISOString(),
    field,
    text,
    formType: activeFormType,
    source: 'chat'
  }, rooms);

  console.log(`✨ ${formLabel} Highlighted field: ${field} with text: "${text || 'none'}" for session ${sessionId}`);

  return {
    success: true,
    message: `${formLabel} Field "${field}" highlighted successfully${text ? ' with text' : ''}.`
  };
};

/**
 * Handle captureCheckboxSelection tool
 */
export const handleCaptureCheckboxSelection = async (
  sessionId: string,
  args: { group?: string; value?: string; formType?: 'SBA_1919' | 'SBA_413' }
): Promise<ToolResult> => {
  let { group, value, formType } = args;
  const rooms = getRooms(sessionId);

  // Default to SBA_1919 if not specified
  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  // Normalize: trim whitespace and newlines
  group = group?.trim();
  value = value?.trim();

  // Validate required parameters
  if (!group || !value) {
    return {
      success: false,
      message: 'Both group and value are required'
    };
  }

  // Select appropriate checkbox groups based on form type
  const checkboxGroups = activeFormType === 'SBA_413' ? CHECKBOX_GROUPS_413 : CHECKBOX_GROUPS;
  const getCheckboxesFn = activeFormType === 'SBA_413' ? getGroupCheckboxes413 : getGroupCheckboxes;

  // Validate group exists
  const groupConfig = checkboxGroups[group];
  if (!groupConfig) {
    return {
      success: false,
      message: `Unknown checkbox group: ${group}. Available groups: ${Object.keys(checkboxGroups).join(', ')}`
    };
  }

  // Validate value exists in group options
  const fieldName = groupConfig.options[value];
  if (!fieldName) {
    return {
      success: false,
      message: `Unknown value '${value}' for group '${group}'. Available values: ${Object.keys(groupConfig.options).join(', ')}`
    };
  }

  console.log(`📋 ${formLabel} Capturing checkbox selection: ${group} = ${value} -> field: ${fieldName}`);

  // Store PDF field name in session userData
  await updateUserData(sessionId, { [fieldName]: true });

  // Get all checkboxes in group for exclusive groups
  let groupCheckboxes: string[] | undefined = undefined;
  if (groupConfig.exclusive) {
    groupCheckboxes = getCheckboxesFn(group);
    console.log(`📋 ${formLabel} Exclusive group - all checkboxes:`, groupCheckboxes);
  }

  // Broadcast to WebSocket
  websocketService.broadcast('checkbox-selection', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { [fieldName]: true },
    fieldType: 'checkbox',
    formType: activeFormType,
    groupCheckboxes,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `${formLabel} Checkbox "${value}" in group "${group}" captured successfully.`,
    data: { fieldName, groupCheckboxes }
  };
};

/**
 * Handle captureLoan tool
 */
export const handleCaptureLoan = async (
  sessionId: string,
  args: { loanAmount?: number; loanType?: string; loanPurpose?: string }
): Promise<ToolResult> => {
  const { loanAmount, loanType, loanPurpose } = args;
  const rooms = getRooms(sessionId);

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { loanAmount, loanType, loanPurpose },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Loan information captured successfully.'
  };
};

/**
 * Handle conversation flow detection
 * No MongoDB update needed - just return the flow value
 */
export const handleDetectConversationFlow = async (
  sessionId: string,
  args: { flow?: string }
): Promise<ToolResult> => {
  const flow = args.flow;

  // Validate flow value
  const validFlows = ['continue_application', 'new_application', 'check_status'];
  if (!flow || !validFlows.includes(flow)) {
    return {
      success: false,
      message: `Invalid flow: ${flow}`
    };
  }

  // No MongoDB update needed - just return the flow
  console.log(`✅ Conversation flow detected: ${flow}`);
  return {
    success: true,
    message: `Flow detected: ${flow}`,
    data: { flow }
  };
};

/**
 * Calculate SBA eligibility chances for BUYER
 */
export const handleChancesUserSBAApprovedBUYER = async (
  sessionId: string,
  args: {
    purchasePrice?: number;
    availableCash?: number;
    businessCashFlow?: number;
    buyerCreditScore?: number;
    isUSCitizen?: boolean;
    businessYearsRunning?: number;
    industryExperience?: string;
  }
): Promise<ToolResult> => {
  const {
    purchasePrice,
    availableCash,
    businessCashFlow,
    buyerCreditScore,
    isUSCitizen,
    businessYearsRunning,
    industryExperience
  } = args;

  // Validate required fields
  if (!purchasePrice || !availableCash || !businessCashFlow || !buyerCreditScore || isUSCitizen === undefined || !businessYearsRunning) {
    return {
      success: false,
      message: 'Missing required fields for buyer eligibility calculation'
    };
  }

  try {
    // Call the existing eligibility calculation function
    const result = calculateSBAEligibilityForBuyer({
      purchasePrice: String(purchasePrice),
      availableCash: String(availableCash),
      businessCashFlow: String(businessCashFlow),
      buyerCreditScore: String(buyerCreditScore),
      isUSCitizen,
      businessYearsRunning,
      industryExperience
    });

    console.log(`✅ SBA eligibility calculated for BUYER: ${result.chance} (score: ${result.score})`);

    return {
      success: true,
      message: `Eligibility calculated: ${result.chance} chance`,
      data: {
        score: result.score,
        chance: result.chance,
        reasons: result.reasons
      }
    };
  } catch (error) {
    console.error('❌ Error calculating buyer eligibility:', error);
    return {
      success: false,
      message: `Error calculating eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Calculate SBA eligibility chances for OWNER
 */
export const handleChancesUserSBAApprovedOWNER = async (
  sessionId: string,
  args: {
    monthlyRevenue?: number;
    monthlyExpenses?: number;
    existingDebtPayment?: number;
    requestedLoanAmount?: number;
    ownerCreditScore?: number;
    isUSCitizen?: boolean;
    businessYearsRunning?: number;
  }
): Promise<ToolResult> => {
  const {
    monthlyRevenue,
    monthlyExpenses,
    existingDebtPayment,
    requestedLoanAmount,
    ownerCreditScore,
    isUSCitizen,
    businessYearsRunning
  } = args;

  // Validate required fields
  if (!monthlyRevenue || !monthlyExpenses || !requestedLoanAmount || !ownerCreditScore || isUSCitizen === undefined || !businessYearsRunning) {
    return {
      success: false,
      message: 'Missing required fields for owner eligibility calculation'
    };
  }

  try {
    // Call the existing eligibility calculation function
    const result = calculateSBAEligibilityForOwner({
      monthlyRevenue: String(monthlyRevenue),
      monthlyExpenses: String(monthlyExpenses),
      existingDebtPayment: String(existingDebtPayment || 0),
      requestedLoanAmount: String(requestedLoanAmount),
      loanPurpose: 'Working Capital', // Default value
      ownerCreditScore: String(ownerCreditScore),
      isUSCitizen,
      businessYearsRunning
    });
    const applicantData: any = {
      name: "Undisclosed",
      businessName: "Undisclosed",
      businessPhoneNumber: "",
      userType: 'owner',
      creditScore: Number(args.ownerCreditScore || args.ownerCreditScore || 0),
      yearFounded: Number(new Date().getFullYear()) - Number(args.businessYearsRunning || 0),
      isUSCitizen: args.isUSCitizen === true,
      monthlyRevenue: String(args.monthlyRevenue || ''),
      monthlyExpenses: String(args.monthlyExpenses || ''),
      existingDebtPayment: String(args.existingDebtPayment || ''),
      requestedLoanAmount: String(args.requestedLoanAmount || '')
    };

    // Create draft application
    await createDraft(applicantData as SBAApplicationData, result);


    console.log(`✅ SBA eligibility calculated for OWNER: ${result.chance} (score: ${result.score})`);

    return {
      success: true,
      message: `Eligibility calculated: ${result.chance} chance`,
      data: {
        score: result.score,
        chance: result.chance,
        reasons: result.reasons
      }
    };
  } catch (error) {
    console.error('❌ Error calculating owner eligibility:', error);
    return {
      success: false,
      message: `Error calculating eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Retrieve application status by identifier
 */
export const handleRetrieveApplicationStatus = async (
  sessionId: string,
  args: { identifier?: string }
): Promise<ToolResult> => {
  const { identifier } = args;

  if (!identifier) {
    return {
      success: false,
      message: 'Identifier is required'
    };
  }

  try {
    // Search by business name, phone, or application ID
    const application = await Application.findOne({
      $or: [
        { _id: identifier },
        { 'applicantData.businessName': { $regex: new RegExp(identifier, 'i') } },
        { 'applicantData.businessPhoneNumber': identifier }
      ]
    }).populate('banks.bank');

    if (!application) {
      return {
        success: false,
        message: `No application found for: ${identifier}`
      };
    }

    console.log(`✅ Application retrieved: ${application._id}`);

    // Generate presigned URLs for all document types
    const expiresIn = 3600; // 1 hour default

    const [userProvidedDocuments, draftDocuments] = await Promise.all([
      Promise.all(
        (application.userProvidedDocuments || []).map(async (doc) => ({
          fileName: doc.fileName,
          s3Key: doc.s3Key,
          url: await generatePresignedUrl(doc.s3Key, expiresIn),
          uploadedAt: doc.uploadedAt,
          fileType: doc.fileType,
          expiresIn
        }))
      ),
      Promise.all(
        (application.draftDocuments || []).map(async (doc: any) => ({
          fileName: doc.fileName,
          s3Key: doc.s3Key,
          url: await generatePresignedUrl(doc.s3Key, expiresIn),
          generatedAt: doc.generatedAt,
          fileType: doc.fileType,
          expiresIn,
          signed: doc.signed || false
        }))
      )
    ]);

    // Return comprehensive application data with presigned URLs
    return {
      success: true,
      message: 'Application found',
      data: {
        applicationId: application._id.toString(),
        status: application.status,
        applicantData: application.applicantData,
        loanChances: application.loanChances,
        banks: application.banks,
        offers: application.offers,
        documents: {
          userProvided: userProvidedDocuments,
          draft: draftDocuments
        },
        signing: {
          provider: application.signingProvider,
          status: application.signingStatus,
          signedBy: application.signedBy,
          signedDate: application.signedDate
        },
        createdAt: application.createdAt,
        updatedAt: application.updatedAt
      }
    };
  } catch (error) {
    console.error('❌ Error retrieving application:', error);
    return {
      success: false,
      message: `Error retrieving application: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Get filled and empty fields for form continuation
 */
export const handleGetFilledFields = async (
  sessionId: string,
  args: { applicationId?: string }
): Promise<ToolResult> => {
  const { applicationId } = args;

  if (!applicationId) {
    return {
      success: false,
      message: 'Application ID is required'
    };
  }

  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      return {
        success: false,
        message: `Application not found: ${applicationId}`
      };
    }

    // TODO: Implement field analysis for SBA forms
    // This would analyze which fields in applicantData are filled vs empty
    // For now, return a simple structure
    const filledFields: string[] = [];
    const emptyFields: string[] = [];

    // Analyze applicantData
    const data = application.applicantData;
    if (data.name) filledFields.push('name');
    else emptyFields.push('name');

    if (data.businessName) filledFields.push('businessName');
    else emptyFields.push('businessName');

    if (data.businessPhoneNumber) filledFields.push('businessPhoneNumber');
    else emptyFields.push('businessPhoneNumber');

    if (data.creditScore) filledFields.push('creditScore');
    else emptyFields.push('creditScore');

    if (data.yearFounded) filledFields.push('yearFounded');
    else emptyFields.push('yearFounded');

    console.log(`✅ Field analysis complete: ${filledFields.length} filled, ${emptyFields.length} empty`);

    return {
      success: true,
      message: 'Field analysis complete',
      data: {
        sba1919: {
          filledFields,
          emptyFields,
          allFields: data
        },
        sba413: {
          filledFields: [],
          emptyFields: [],
          allFields: {}
        }
      }
    };
  } catch (error) {
    console.error('❌ Error getting filled fields:', error);
    return {
      success: false,
      message: `Error analyzing fields: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * End conversation signal
 */
export const handleEndConversation = async (
  sessionId: string,
  args: { reason?: string }
): Promise<ToolResult> => {
  const { reason = 'completed' } = args;

  console.log(`✅ Conversation ended: ${sessionId} (reason: ${reason})`);

  // Optionally broadcast conversation end event
  const rooms = getRooms(sessionId);
  websocketService.broadcast('conversation-ended', {
    sessionId,
    timestamp: new Date().toISOString(),
    reason,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Conversation ended: ${reason}`,
    data: { reason }
  };
};

// ==============================
// TOOL DISPATCHER
// ==============================

/**
 * Execute a tool call by name
 */
export const executeToolCall = async (
  sessionId: string,
  toolName: string,
  args: Record<string, any>
): Promise<ToolResult> => {
  console.log(`🔧 Executing tool: ${toolName}`, args);

  switch (toolName) {
    case 'captureUserName':
      return handleCaptureUserName(sessionId, args);
    case 'captureBusinessName':
      return handleCaptureBusinessName(sessionId, args);
    case 'captureBusinessPhone':
      return handleCaptureBusinessPhone(sessionId, args);
    case 'captureCreditScore':
      return handleCaptureCreditScore(sessionId, args);
    case 'captureYearFounded':
      return handleCaptureYearFounded(sessionId, args);
    case 'captureUSCitizen':
      return handleCaptureUSCitizen(sessionId, args);
    case 'captureAnnualRevenue':
      return handleCaptureAnnualRevenue(sessionId, args);
    case 'captureMonthlyRevenue':
      return handleCaptureMonthlyRevenue(sessionId, args);
    case 'captureMonthlyExpenses':
      return handleCaptureMonthlyExpenses(sessionId, args);
    case 'captureExistingDebtPayment':
      return handleCaptureExistingDebtPayment(sessionId, args);
    case 'captureRequestedLoanAmount':
      return handleCaptureRequestedLoanAmount(sessionId, args);
    case 'captureLoanPurpose':
      return handleCaptureLoanPurpose(sessionId, args);
    case 'capturePurchasePrice':
      return handleCapturePurchasePrice(sessionId, args);
    case 'captureAvailableCash':
      return handleCaptureAvailableCash(sessionId, args);
    case 'captureBusinessCashFlow':
      return handleCaptureBusinessCashFlow(sessionId, args);
    case 'captureIndustryExperience':
      return handleCaptureIndustryExperience(sessionId, args);
    case 'captureUserTypeNewApplication':
      return handleCaptureUserTypeNewApplication(sessionId, args);
    case 'captureSellingFinancingPercentage':
      return handleCaptureSellingFinancingPercentage(sessionId, args);
    case 'captureIfSellerFinancingOnStandbyExists':
      return handleCaptureIfSellerFinancingOnStandbyExists(sessionId, args);
    case 'captureOpenSBAForm':
      return handleCaptureOpenSBAForm(sessionId, args);
    case 'captureHighlightField':
      return handleCaptureHighlightField(sessionId, args);
    case 'captureCheckboxSelection':
      return handleCaptureCheckboxSelection(sessionId, args);
    case 'captureLoan':
      return handleCaptureLoan(sessionId, args);
    case 'detectConversationFlow':
      return handleDetectConversationFlow(sessionId, args);
    case 'chancesUserSBAApprovedBUYER':
      return handleChancesUserSBAApprovedBUYER(sessionId, args);
    case 'chancesUserSBAApprovedOWNER':
      return handleChancesUserSBAApprovedOWNER(sessionId, args);
    case 'retrieveApplicationStatus':
      return handleRetrieveApplicationStatus(sessionId, args);
    case 'getFilledFields':
      return handleGetFilledFields(sessionId, args);
    case 'endConversation':
      return handleEndConversation(sessionId, args);
    default:
      console.warn(`⚠️ Unknown tool: ${toolName}`);
      return {
        success: false,
        message: `Unknown tool: ${toolName}`
      };
  }
};

export default {
  // Session management
  createSession,
  getSession,
  addMessage,
  updateUserData,
  linkApplication,
  deleteSession,
  // Tool dispatcher
  executeToolCall
};
